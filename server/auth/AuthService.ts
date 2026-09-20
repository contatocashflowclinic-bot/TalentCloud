import { createHash, randomBytes } from 'node:crypto';
import type { AuthUser } from '../../src/types.js';
import { ALL_PERMISSIONS, effectivePermissions, entitledPermissions, passwordPolicyError } from '../../src/access.js';
import { sessionCache } from '../cache.js';
import { logAudit } from '../audit.js';
import { AccessService } from './AccessService.js';
import { getPool, Queryable, withTransaction } from '../db/pool.js';
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../errors.js';
import { FailureLimiter, purgeStaleRateLimits } from '../rateLimit.js';
import { isProduction } from '../runtime.js';
import { dummyVerify, generateTempPassword, hashPassword, verifyPassword } from './password.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60_000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_SECONDS = 15 * 60;

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

export class AuthService {
  private static instance: AuthService;
  /** Brute-force guard: MAX_FAILED_ATTEMPTS failures per (ip, organization, e-mail) lock the key for 15 min. Stored in the database (shared by every instance). */
  private limiter = new FailureLimiter('login', {
    maxFailures: MAX_FAILED_ATTEMPTS,
    windowSeconds: LOCK_SECONDS,
    lockSeconds: LOCK_SECONDS
  });
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

    // The built-in password is public (it is in the README): never create that account on an internet-facing deployment.
    const chosenByOperator = Boolean(process.env.SUPERADMIN_PASSWORD);
    if (isProduction() && !chosenByOperator) {
      console.error(
        '[TalentCloud Core] Nenhum SuperAdmin cadastrado e SUPERADMIN_PASSWORD não definida: em produção a conta ' +
        'padrão (senha pública) NÃO é criada. Defina SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD e reinicie, ou rode "npm run admin:password".'
      );
      return { created: false, email, usingDefaultPassword: false };
    }
    if (chosenByOperator) {
      const policy = passwordPolicyError(password);
      if (policy) throw new Error(`SUPERADMIN_PASSWORD inválida: ${policy}`);
    }

    const hash = await hashPassword(password);
    await pool.query(
      `insert into public.platform_admins (id, name, email, active, password_hash, password_changed_at)
       values ($1, $2, $3, true, $4, $5)
       on conflict (id) do update set email = excluded.email, password_hash = excluded.password_hash, active = true,
                                      password_changed_at = excluded.password_changed_at`,
      // A password picked by the operator counts as already "changed" (only the built-in default is flagged)
      [DEFAULT_ADMIN.id, name, email, hash, chosenByOperator ? new Date() : null]
    );
    return { created: true, email, usingDefaultPassword: !chosenByOperator };
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

    const key = this.limiter.key(ip, slug, email);
    await this.limiter.assertAllowed(key);

    const superAdmin = slug ? undefined : await this.findSuperAdmin(email);
    const identity = superAdmin ? undefined : await this.findIdentity(email, slug);
    const found = superAdmin ?? identity;
    const valid = found ? await verifyPassword(password, found.passwordHash) : (await dummyVerify(), false);

    if (!found || !valid) {
      await this.limiter.fail(key);
      await logAudit({
        tenantId: '',
        userId: found?.id ?? 'unknown',
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
    // The install-time password is public knowledge: on an internet-facing deployment it must be replaced before
    // the Conta Mãe can be used, otherwise whoever reads the README could take over the platform.
    if (superAdmin && isProduction() && superAdmin.passwordChangedAt === null) {
      throw new ForbiddenError(
        'A Conta Mãe ainda usa a senha padrão de instalação e, por segurança, o acesso em produção está bloqueado. ' +
        'Defina uma senha própria com "npm run admin:password" (veja docs/deploy-vercel.md).'
      );
    }

    // SuperAdmin has no organization; a person may be linked to several: enter the most recently used usable one.
    let link: OrgLink | undefined;
    if (identity) {
      const usable = identity.links.filter(l => l.active && l.tenantStatus !== 'suspended');
      if (!usable.length) {
        throw new ForbiddenError(
          identity.links.length === 0
            ? 'Sua conta ainda não foi vinculada a nenhuma organização. Procure o administrador.'
            : identity.links.some(l => l.active)
              ? 'Organização suspensa. Procure o suporte.'
              : 'Usuário desativado. Procure o administrador.'
        );
      }
      // most recently used first; links never used (no last access) come last
      link = usable.sort((a, b) => (b.lastLoginAt ?? '').localeCompare(a.lastLoginAt ?? ''))[0];
    }

    await this.limiter.reset(key);
    await purgeStaleRateLimits().catch(() => undefined);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await withTransaction(async tx => {
      await tx.query('delete from public.auth_sessions where expires_at < now()');
      await tx.query(
        `insert into public.auth_sessions (token_hash, principal_type, principal_id, tenant_id, expires_at)
         values ($1, $2, $3, $4, $5)`,
        [sha256(token), superAdmin ? 'super_admin' : 'tenant_user', found.id, link?.tenantId ?? null, expiresAt]
      );
      if (superAdmin) {
        await tx.query('update public.platform_admins set last_login_at = now() where id = $1', [superAdmin.id]);
      } else {
        await tx.query('update public.app_users set last_login_at = now() where id = $1', [found.id]);
        await tx.query('update public.tenant_users set last_login_at = now() where tenant_id = $1 and id = $2', [
          link!.tenantId, link!.membershipId
        ]);
      }
      await logAudit(
        {
          tenantId: link?.tenantId ?? '',
          userId: link?.membershipId ?? found.id,
          userName: found.name,
          action: 'LOGIN_SUCCEEDED',
          category: 'ACCESS_CONTROL',
          details: `Login realizado (${superAdmin ? 'SUPER_ADMIN' : link!.profileName})`,
          ipAddress: ip,
          databaseAffected: 'auth'
        },
        tx
      );
    });

    const session = (await this.authenticate(token))!;
    return { token, expiresAt: expiresAt.toISOString(), user: await this.describe(session) };
  }

  /** Public shape of a session (no token hash) plus the organizations the person can switch to. */
  async describe(session: AuthenticatedSession): Promise<AuthUser> {
    const { tokenHash: _t, ...user } = session;
    if (session.type === 'tenant_user') {
      user.memberships = await AccessService.membershipsOf(getPool(), session.userId!);
    }
    return user;
  }

  async authenticate(token: string): Promise<AuthenticatedSession | undefined> {
    if (!token) return undefined;
    const tokenHash = sha256(token);
    const cached = sessionCache.get(tokenHash);
    if (cached) {
      this.touch(tokenHash);
      return cached;
    }
    const { rows } = await getPool().query(
      `select s.principal_type, s.principal_id, s.tenant_id,
              pa.name as pa_name, pa.email as pa_email, pa.active as pa_active,
              pa.must_change_password as pa_must, pa.password_changed_at as pa_changed,
              au.email as au_email, au.active as au_active, au.must_change_password as au_must,
              tu.id as tu_id, tu.name as tu_name, tu.active as tu_active,
              tu.granted_permissions, tu.revoked_permissions,
              ap.id as ap_id, ap.name as ap_name, ap.is_admin as ap_admin, ap.permissions as ap_permissions,
              t.enabled_routines
         from public.auth_sessions s
         left join public.platform_admins pa
                on s.principal_type = 'super_admin' and pa.id = s.principal_id
         left join public.app_users au
                on s.principal_type = 'tenant_user' and au.id = s.principal_id
         left join public.tenant_users tu
                on s.principal_type = 'tenant_user' and tu.tenant_id = s.tenant_id and tu.user_id = s.principal_id
         left join public.access_profiles ap
                on ap.tenant_id = tu.tenant_id and ap.id = tu.profile_id
         left join public.tenants t
                on t.id = s.tenant_id
        where s.token_hash = $1 and s.expires_at > now()`,
      [tokenHash]
    );
    const r = rows[0];
    if (!r) return undefined;

    this.touch(tokenHash);

    if (r.principal_type === 'super_admin') {
      if (!r.pa_active) return undefined;
      const superSession: AuthenticatedSession = {
        tokenHash,
        type: 'super_admin',
        id: r.principal_id,
        name: r.pa_name,
        email: r.pa_email,
        permissions: [...ALL_PERMISSIONS],
        mustChangePassword: r.pa_must,
        usingDefaultPassword: r.pa_changed === null
      };
      sessionCache.set(tokenHash, superSession);
      return superSession;
    }
    // Identity, link with the active organization and profile must all be active/present.
    if (!r.au_active || !r.tu_active || !r.ap_id) return undefined;
    const session: AuthenticatedSession = {
      tokenHash,
      type: 'tenant_user',
      id: r.tu_id,
      userId: r.principal_id,
      name: r.tu_name,
      email: r.au_email,
      tenantId: r.tenant_id,
      profileId: r.ap_id,
      profileName: r.ap_name,
      isOrgAdmin: r.ap_admin,
      // (profile + exceptions) ∩ what the organization's contract includes
      permissions: entitledPermissions(
        effectivePermissions(
          { isAdmin: r.ap_admin, permissions: r.ap_permissions },
          r.granted_permissions,
          r.revoked_permissions
        ),
        r.enabled_routines ?? []
      ),
      mustChangePassword: r.au_must
    };
    sessionCache.set(tokenHash, session);
    return session;
  }

  /** Moves the current session to another organization the person is linked to (no new login). */
  async switchOrganization(session: AuthenticatedSession, tenantId: unknown, ip: string): Promise<void> {
    if (session.type !== 'tenant_user') throw new ValidationError('A Conta Mãe não pertence a organizações.');
    sessionCache.clear();
    const target = typeof tenantId === 'string' ? tenantId : '';
    const allowed = (await AccessService.membershipsOf(getPool(), session.userId!)).find(m => m.tenantId === target);
    if (!allowed) throw new ForbiddenError('Você não tem acesso ativo a esta organização.');
    await withTransaction(async tx => {
      await tx.query('update public.auth_sessions set tenant_id = $2 where token_hash = $1', [session.tokenHash, target]);
      const { rows } = await tx.query(
        'update public.tenant_users set last_login_at = now() where tenant_id = $1 and user_id = $2 returning id',
        [target, session.userId]
      );
      await logAudit(
        {
          tenantId: target,
          userId: rows[0].id,
          userName: session.name,
          action: 'ORGANIZATION_SWITCHED',
          category: 'ACCESS_CONTROL',
          details: `${session.email} passou a operar a organização '${allowed.name}'`,
          ipAddress: ip,
          databaseAffected: `tenant:${allowed.slug}`
        },
        tx
      );
    });
  }

  async logout(tokenHash: string): Promise<void> {
    sessionCache.clear();
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
    const principalId = isSuper ? session.id : session.userId!;
    const { rows } = await getPool().query(
      `select password_hash from public.${isSuper ? 'platform_admins' : 'app_users'} where id = $1`,
      [principalId]
    );
    if (!(await verifyPassword(current, rows[0]?.password_hash))) {
      throw new UnauthorizedError('Senha atual incorreta.');
    }

    const hash = await hashPassword(next);
    sessionCache.clear();
    await withTransaction(async tx => {
      await tx.query(
        `update public.${isSuper ? 'platform_admins' : 'app_users'}
            set password_hash = $2, must_change_password = false, password_changed_at = now() where id = $1`,
        [principalId, hash]
      );
      // Sign out every other device
      await tx.query(
        'delete from public.auth_sessions where principal_type = $1 and principal_id = $2 and token_hash <> $3',
        [session.type, principalId, session.tokenHash]
      );
    });
  }

  /**
   * Sets a generated temporary password on a person (must change on next login) and signs them out of
   * every organization. Returns the clear text ONCE for the caller to hand over.
   * `userId` is the global identity (app_users.id), not the link with an organization.
   */
  async issueTempPassword(userId: string, db: Queryable = getPool()): Promise<string> {
    const temp = generateTempPassword();
    const hash = await hashPassword(temp);
    sessionCache.clear();
    const { rowCount } = await db.query(
      `update public.app_users set password_hash = $2, must_change_password = true where id = $1`,
      [userId, hash]
    );
    if (!rowCount) throw new NotFoundError('Usuário não encontrado.');
    await db.query(
      `delete from public.auth_sessions where principal_type = 'tenant_user' and principal_id = $1`,
      [userId]
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
      id: r.id as string,
      name: r.name as string,
      passwordHash: r.password_hash as string | null,
      active: r.active as boolean,
      passwordChangedAt: (r.password_changed_at ?? null) as string | null
    };
  }

  /**
   * Global identity by e-mail together with its organization links. With `slug`, only the link with that
   * organization counts (a person who is not linked to it is treated as unknown).
   */
  private async findIdentity(email: string, slug: string) {
    const { rows } = await getPool().query(
      `select u.id, u.name, u.password_hash, u.active,
              t.id as tenant_id, t.slug, t.status as tenant_status,
              tu.id as membership_id, tu.active as link_active, tu.last_login_at, ap.name as profile_name
         from public.app_users u
         left join public.tenant_users tu on tu.user_id = u.id
         left join public.tenants t on t.id = tu.tenant_id
         left join public.access_profiles ap on ap.tenant_id = tu.tenant_id and ap.id = tu.profile_id
        where lower(u.email) = $1 and ($2 = '' or t.slug = $2)`,
      [email, slug]
    );
    const first = rows[0];
    if (!first) return undefined;
    const links: OrgLink[] = rows
      .filter(r => r.tenant_id)
      .map(r => ({
        tenantId: r.tenant_id,
        membershipId: r.membership_id,
        tenantStatus: r.tenant_status,
        active: r.link_active,
        lastLoginAt: r.last_login_at,
        profileName: r.profile_name
      }));
    return {
      id: first.id as string,
      name: first.name as string,
      passwordHash: first.password_hash as string | null,
      active: first.active as boolean,
      links
    };
  }
}

interface OrgLink {
  tenantId: string;
  membershipId: string;
  tenantStatus: string;
  active: boolean;
  lastLoginAt: string | null;
  profileName: string;
}
