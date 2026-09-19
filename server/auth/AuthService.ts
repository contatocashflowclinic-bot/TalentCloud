import { createHash, randomBytes } from 'node:crypto';
import type { AuthUser, UserRole } from '../../src/types.js';
import { passwordPolicyError } from '../../src/access.js';
import { logAudit } from '../audit.js';
import { getPool, Queryable, withTransaction } from '../db/pool.js';
import { ForbiddenError, NotFoundError, TooManyRequestsError, UnauthorizedError, ValidationError } from '../errors.js';
import { dummyVerify, generateTempPassword, hashPassword, verifyPassword } from './password.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60_000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

const DEFAULT_ADMIN = {
  id: 'super-01',
  name: 'SuperAdmin Root',
  email: 'admin@admin.com.br',
  password: 'Admin@123'
};

export interface AuthenticatedSession extends AuthUser {
  tokenHash: string;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const normEmail = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** In-memory brute-force guard: MAX_FAILED_ATTEMPTS failures per (ip, email) lock for LOCK_MS. */
class LoginLimiter {
  private entries = new Map<string, { fails: number; lockedUntil: number }>();

  assertAllowed(key: string) {
    const e = this.entries.get(key);
    if (e && e.lockedUntil > Date.now()) {
      const minutes = Math.ceil((e.lockedUntil - Date.now()) / 60_000);
      throw new TooManyRequestsError(`Muitas tentativas de login. Tente novamente em ${minutes} minuto(s).`);
    }
  }

  fail(key: string) {
    const e = this.entries.get(key) ?? { fails: 0, lockedUntil: 0 };
    e.fails = e.lockedUntil && e.lockedUntil <= Date.now() ? 1 : e.fails + 1;
    if (e.fails >= MAX_FAILED_ATTEMPTS) e.lockedUntil = Date.now() + LOCK_MS;
    this.entries.set(key, e);
    if (this.entries.size > 10_000) this.entries.clear(); // bound memory
  }

  reset(key: string) {
    this.entries.delete(key);
  }
}

export class AuthService {
  private static instance: AuthService;
  private limiter = new LoginLimiter();
  private lastTouch = new Map<string, number>();

  static getInstance() {
    if (!AuthService.instance) AuthService.instance = new AuthService();
    return AuthService.instance;
  }

  // -------------------------------------------------------------------
  // Bootstrap: default SuperAdmin
  // -------------------------------------------------------------------
  /**
   * Creates the default SuperAdmin when no platform admin has credentials yet.
   * Override with SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD / SUPERADMIN_NAME (recommended in production).
   * Never overwrites an existing account.
   */
  async ensureDefaultSuperAdmin(): Promise<{ created: boolean; email: string; usingDefaultPassword: boolean }> {
    const email = normEmail(process.env.SUPERADMIN_EMAIL || DEFAULT_ADMIN.email);
    const password = process.env.SUPERADMIN_PASSWORD || DEFAULT_ADMIN.password;
    const name = process.env.SUPERADMIN_NAME || DEFAULT_ADMIN.name;
    const pool = getPool();

    const existing = await pool.query(
      'select email, password_changed_at from public.platform_admins where password_hash is not null and active order by created_at limit 1'
    );
    if (existing.rows[0]) {
      return {
        created: false,
        email: existing.rows[0].email,
        usingDefaultPassword: existing.rows[0].password_changed_at === null
      };
    }

    const hash = await hashPassword(password);
    await pool.query(
      `insert into public.platform_admins (id, name, email, active, password_hash)
       values ($1, $2, $3, true, $4)
       on conflict (id) do update set email = excluded.email, password_hash = excluded.password_hash, active = true`,
      [DEFAULT_ADMIN.id, name, email, hash]
    );
    return { created: true, email, usingDefaultPassword: !process.env.SUPERADMIN_PASSWORD };
  }

  // -------------------------------------------------------------------
  // Login / sessions
  // -------------------------------------------------------------------
  async login(
    input: { email: unknown; password: unknown; tenantSlug?: unknown },
    ip: string
  ): Promise<{ token: string; expiresAt: string; user: AuthUser }> {
    const email = normEmail(input.email);
    const password = typeof input.password === 'string' ? input.password : '';
    const slug = typeof input.tenantSlug === 'string' ? input.tenantSlug.trim().toLowerCase() : '';
    if (!email || !password) throw new ValidationError('Informe e-mail e senha.');

    const key = `${ip}|${slug}|${email}`;
    this.limiter.assertAllowed(key);

    const found = slug ? await this.findTenantUser(slug, email) : await this.findSuperAdmin(email);
    const valid = found ? await verifyPassword(password, found.passwordHash) : (await dummyVerify(), false);

    if (!found || !valid) {
      this.limiter.fail(key);
      await logAudit({
        tenantId: found?.tenantId ?? '',
        userId: found?.user.id ?? 'unknown',
        userName: email,
        action: 'LOGIN_FAILED',
        category: 'ACCESS_CONTROL',
        details: `Falha de autenticação para '${email}'${slug ? ` na organização '${slug}'` : ''}`,
        ipAddress: ip,
        databaseAffected: 'auth'
      }).catch(() => undefined);
      throw new UnauthorizedError('E-mail ou senha inválidos.');
    }

    // Credentials are right; now enforce account / organization state.
    if (!found.active) throw new ForbiddenError('Usuário desativado. Procure o administrador.');
    if (found.tenantStatus === 'suspended') throw new ForbiddenError('Organização suspensa. Procure o suporte.');

    this.limiter.reset(key);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await withTransaction(async tx => {
      await tx.query('delete from public.auth_sessions where expires_at < now()');
      await tx.query(
        `insert into public.auth_sessions (token_hash, principal_type, principal_id, tenant_id, expires_at)
         values ($1, $2, $3, $4, $5)`,
        [sha256(token), found.user.type, found.user.id, found.user.tenantId ?? null, expiresAt]
      );
      if (found.user.type === 'super_admin') {
        await tx.query('update public.platform_admins set last_login_at = now() where id = $1', [found.user.id]);
      } else {
        await tx.query('update public.tenant_users set last_login_at = now() where tenant_id = $1 and id = $2', [
          found.user.tenantId, found.user.id
        ]);
      }
      await logAudit(
        {
          tenantId: found.user.tenantId ?? '',
          userId: found.user.id,
          userName: found.user.name,
          action: 'LOGIN_SUCCEEDED',
          category: 'ACCESS_CONTROL',
          details: `Login realizado (${found.user.role})`,
          ipAddress: ip,
          databaseAffected: 'auth'
        },
        tx
      );
    });

    return { token, expiresAt: expiresAt.toISOString(), user: found.user };
  }

  async authenticate(token: string): Promise<AuthenticatedSession | undefined> {
    if (!token) return undefined;
    const tokenHash = sha256(token);
    const { rows } = await getPool().query(
      `select s.principal_type, s.principal_id, s.tenant_id,
              pa.name as pa_name, pa.email as pa_email, pa.active as pa_active,
              pa.must_change_password as pa_must, pa.password_changed_at as pa_changed,
              tu.name as tu_name, tu.email as tu_email, tu.role as tu_role,
              tu.active as tu_active, tu.must_change_password as tu_must
         from public.auth_sessions s
         left join public.platform_admins pa
                on s.principal_type = 'super_admin' and pa.id = s.principal_id
         left join public.tenant_users tu
                on s.principal_type = 'tenant_user' and tu.tenant_id = s.tenant_id and tu.id = s.principal_id
        where s.token_hash = $1 and s.expires_at > now()`,
      [tokenHash]
    );
    const r = rows[0];
    if (!r) return undefined;

    this.touch(tokenHash);

    if (r.principal_type === 'super_admin') {
      if (!r.pa_active) return undefined;
      return {
        tokenHash,
        type: 'super_admin',
        id: r.principal_id,
        name: r.pa_name,
        email: r.pa_email,
        role: 'SUPER_ADMIN',
        mustChangePassword: r.pa_must,
        usingDefaultPassword: r.pa_changed === null
      };
    }
    if (!r.tu_active) return undefined;
    return {
      tokenHash,
      type: 'tenant_user',
      id: r.principal_id,
      name: r.tu_name,
      email: r.tu_email,
      role: r.tu_role as UserRole,
      tenantId: r.tenant_id,
      mustChangePassword: r.tu_must
    };
  }

  async logout(tokenHash: string): Promise<void> {
    await getPool().query('delete from public.auth_sessions where token_hash = $1', [tokenHash]);
  }

  // -------------------------------------------------------------------
  // Passwords
  // -------------------------------------------------------------------
  async changeOwnPassword(session: AuthenticatedSession, currentPassword: unknown, newPassword: unknown): Promise<void> {
    const current = typeof currentPassword === 'string' ? currentPassword : '';
    const next = typeof newPassword === 'string' ? newPassword : '';
    const policy = passwordPolicyError(next);
    if (policy) throw new ValidationError(policy);
    if (next === current) throw new ValidationError('A nova senha deve ser diferente da atual.');

    const isSuper = session.type === 'super_admin';
    const { rows } = isSuper
      ? await getPool().query('select password_hash from public.platform_admins where id = $1', [session.id])
      : await getPool().query('select password_hash from public.tenant_users where tenant_id = $1 and id = $2', [
          session.tenantId, session.id
        ]);
    if (!(await verifyPassword(current, rows[0]?.password_hash))) {
      throw new UnauthorizedError('Senha atual incorreta.');
    }

    const hash = await hashPassword(next);
    await withTransaction(async tx => {
      if (isSuper) {
        await tx.query(
          `update public.platform_admins
              set password_hash = $2, must_change_password = false, password_changed_at = now() where id = $1`,
          [session.id, hash]
        );
      } else {
        await tx.query(
          `update public.tenant_users set password_hash = $3, must_change_password = false
            where tenant_id = $1 and id = $2`,
          [session.tenantId, session.id, hash]
        );
      }
      // Sign out every other device
      await tx.query(
        'delete from public.auth_sessions where principal_type = $1 and principal_id = $2 and token_hash <> $3',
        [session.type, session.id, session.tokenHash]
      );
    });
  }

  /**
   * Sets a generated temporary password on an organization user (must change on next login)
   * and signs that user out everywhere. Returns the clear text ONCE for the caller to hand over.
   */
  async issueTempPassword(tenantId: string, userId: string, db: Queryable = getPool()): Promise<string> {
    const temp = generateTempPassword();
    const hash = await hashPassword(temp);
    const { rowCount } = await db.query(
      `update public.tenant_users set password_hash = $3, must_change_password = true
        where tenant_id = $1 and id = $2`,
      [tenantId, userId, hash]
    );
    if (!rowCount) throw new NotFoundError('Usuário não encontrado nesta organização.');
    await db.query(
      `delete from public.auth_sessions where principal_type = 'tenant_user' and tenant_id = $1 and principal_id = $2`,
      [tenantId, userId]
    );
    return temp;
  }

  // -------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------
  private touch(tokenHash: string) {
    const now = Date.now();
    if (now - (this.lastTouch.get(tokenHash) ?? 0) < TOUCH_INTERVAL_MS) return;
    this.lastTouch.set(tokenHash, now);
    if (this.lastTouch.size > 10_000) this.lastTouch.clear();
    getPool()
      .query('update public.auth_sessions set last_used_at = now() where token_hash = $1', [tokenHash])
      .catch(() => undefined);
  }

  private async findSuperAdmin(email: string) {
    const { rows } = await getPool().query(
      `select id, name, email, active, password_hash, must_change_password, password_changed_at
         from public.platform_admins where lower(email) = $1`,
      [email]
    );
    const r = rows[0];
    if (!r) return undefined;
    return {
      passwordHash: r.password_hash as string | null,
      active: r.active as boolean,
      tenantId: undefined as string | undefined,
      tenantStatus: undefined as string | undefined,
      user: {
        type: 'super_admin',
        id: r.id,
        name: r.name,
        email: r.email,
        role: 'SUPER_ADMIN',
        mustChangePassword: r.must_change_password,
        usingDefaultPassword: r.password_changed_at === null
      } as AuthUser
    };
  }

  private async findTenantUser(slug: string, email: string) {
    const { rows } = await getPool().query(
      `select u.id, u.name, u.email, u.role, u.active, u.password_hash, u.must_change_password,
              t.id as tenant_id, t.status as tenant_status
         from public.tenant_users u
         join public.tenants t on t.id = u.tenant_id
        where t.slug = $1 and lower(u.email) = $2`,
      [slug, email]
    );
    const r = rows[0];
    if (!r) return undefined;
    return {
      passwordHash: r.password_hash as string | null,
      active: r.active as boolean,
      tenantId: r.tenant_id as string,
      tenantStatus: r.tenant_status as string,
      user: {
        type: 'tenant_user',
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role as UserRole,
        tenantId: r.tenant_id,
        mustChangePassword: r.must_change_password
      } as AuthUser
    };
  }
}
