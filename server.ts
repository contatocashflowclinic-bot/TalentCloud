import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

// Load env BEFORE anything reads process.env (.env.local takes precedence over .env)
dotenv.config({ path: ['.env.local', '.env'], quiet: true });

import { TenantConnectionRouter, TenantConnectionContext } from './server/tenant/TenantConnectionRouter.js';
import { evaluateCandidateWithAI } from './server/gemini.js';
import { closePool, getPool } from './server/db/pool.js';
import { newId } from './server/ids.js';
import { ConflictError, NotFoundError, ValidationError, toHttpError } from './server/errors.js';
import { ALL_PERMISSIONS } from './src/access.js';
import { sessionCache } from './server/cache.js';
import { AuthService } from './server/auth/AuthService.js';
import { can, authenticate, requirePasswordChanged, requireSuperAdmin } from './server/auth/middleware.js';
import { AccessService } from './server/auth/AccessService.js';
import { logAudit } from './server/audit.js';
import type { PoolClient } from 'pg';
import { registerPublicApi } from './server/publicApi.js';
import { actorOf } from './server/tenant/TenantConnectionRouter.js';
import { withTransaction } from './server/db/pool.js';

// Augment Express Request interface with tenantContext
declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantConnectionContext;
    }
  }
}

// Production = NODE_ENV=production OR running the compiled bundle (npm start), so "npm start" never boots the Vite dev server
const IS_PROD =
  process.env.NODE_ENV === 'production' || (typeof __filename !== 'undefined' && __filename.endsWith('.cjs'));

/** Forwards rejected promises to the error middleware (Express 4 does not do it natively). */
const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

const csv = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
    : String(value ?? '').split(',').map(s => s.trim()).filter(Boolean);

const required = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`Campo obrigatório: ${label}`);
  return value.trim();
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const router = TenantConnectionRouter.getInstance();

  // Fail fast if the database is unreachable
  await getPool().query('select 1');

  // Default SuperAdmin (Conta Mãe) - created only when no platform admin has credentials yet
  const auth = AuthService.getInstance();
  const admin = await auth.ensureDefaultSuperAdmin();
  if (admin.created) console.log(`[TalentCloud Core] SuperAdmin padrão criado: ${admin.email}`);
  if (admin.usingDefaultPassword) {
    console.warn('[TalentCloud Core] ATENÇÃO: o SuperAdmin ainda usa a senha PADRÃO. Altere-a antes de expor o sistema (ou defina SUPERADMIN_PASSWORD).');
  }

  // Behind a reverse proxy / load balancer (Cloud Run, Render, Nginx...) set TRUST_PROXY=1 so req.ip is the real
  // client (login lockout and the public-apply limit are per IP). Leave unset when exposed directly.
  if (process.env.TRUST_PROXY) {
    const v = process.env.TRUST_PROXY;
    app.set('trust proxy', v === 'true' ? true : Number.isNaN(Number(v)) ? v : Number(v));
  }

  // Baseline security headers (API + SPA)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (IS_PROD) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  });

  app.use(express.json({ limit: '200kb' }));

  // Healthcheck endpoint (includes database connectivity)
  app.get('/api/health', async (req, res) => {
    try {
      await getPool().query('select 1');
      res.json({
        status: 'ok',
        service: 'TalentCloud Multi-Tenant SaaS Core',
        database: 'ok',
        timestamp: new Date().toISOString()
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        service: 'TalentCloud Multi-Tenant SaaS Core',
        database: 'unreachable',
        timestamp: new Date().toISOString()
      });
    }
  });

  // ==========================================
  // PUBLIC (no login): careers portal
  // ==========================================
  registerPublicApi(app, router);

  // ==========================================
  // AUTHENTICATION
  // ==========================================
  app.post('/api/auth/login', h(async (req, res) => {
    const { email, password, tenant } = req.body ?? {};
    const result = await auth.login({ email, password, tenantSlug: tenant }, req.ip || '127.0.0.1');
    res.json({ success: true, ...result });
  }));

  app.get('/api/auth/me', authenticate, h(async (req, res) => {
    res.json({ success: true, user: await auth.describe(req.auth!) });
  }));

  // A person linked to several organizations moves between them without a new login
  app.post('/api/auth/switch-organization', authenticate, requirePasswordChanged, h(async (req, res) => {
    await auth.switchOrganization(req.auth!, req.body?.tenantId, req.ip || '127.0.0.1');
    const token = (req.headers.authorization ?? '').slice(7).trim();
    res.json({ success: true, user: await auth.describe((await auth.authenticate(token))!) });
  }));

  app.post('/api/auth/logout', authenticate, h(async (req, res) => {
    await auth.logout(req.auth!.tokenHash);
    res.json({ success: true });
  }));

  app.post('/api/auth/change-password', authenticate, h(async (req, res) => {
    await auth.changeOwnPassword(req.auth!, req.body?.currentPassword, req.body?.newPassword);
    res.json({ success: true });
  }));

  // ==========================================
  // SUPERADMIN / CONTA MÃE ENDPOINTS
  // ==========================================
  app.use('/api/master', authenticate, requirePasswordChanged, requireSuperAdmin);

  // List all tenants from the Master Catalog
  app.get('/api/master/tenants', h(async (req, res) => {
    const page = await router.getTenantsPage({
      search: String(req.query.search ?? ''),
      page: Number(req.query.page),
      pageSize: Number(req.query.pageSize)
    });
    res.json({ success: true, ...page });
  }));

  app.get('/api/master/tenants/:id', h(async (req, res) => {
    const tenant = await router.getTenantDetail(req.params.id);
    if (!tenant) throw new NotFoundError('Organização não encontrada');
    res.json({ success: true, tenant });
  }));

  // Edit registration data, plan and the modules (routines) the organization may use
  app.patch('/api/master/tenants/:id', h(async (req, res) => {
    const tenant = await router.updateOrganization(req.params.id, req.body ?? {}, actorOf(req.auth!, req.ip));
    res.json({ success: true, tenant });
  }));

  // Provision a new organization (tenant + DNA + admin user, atomically)
  app.post('/api/master/tenants/provision', h(async (req, res) => {
    const { name, tradingName, slug, document, contactEmail, plan, adminUserName, adminUserEmail, enabledRoutines } = req.body;
    if (!name || !slug || !contactEmail) {
      throw new ValidationError('Campos obrigatórios: name, slug, contactEmail');
    }

    const result = await router.provisionNewOrganization(
      {
        name,
        tradingName: tradingName || name,
        slug,
        document: document || '00.000.000/0001-00',
        contactEmail,
        plan: plan || 'Scale',
        adminUserName: adminUserName || 'Administrador Org',
        adminUserEmail: adminUserEmail || contactEmail,
        enabledRoutines
      },
      actorOf(req.auth!, req.ip)
    );

    res.status(201).json({ success: true, ...result });
  }));

  // Update tenant status (Active, Suspended, Maintenance)
  app.patch('/api/master/tenants/:id/status', h(async (req, res) => {
    const tenant = await router.updateOrganizationStatus(req.params.id, req.body.status, actorOf(req.auth!, req.ip));
    res.json({ success: true, tenant });
  }));

  // Support: issue a new temporary password to an organization user (default: its first ORG_ADMIN)
  app.post('/api/master/tenants/:id/reset-admin-password', h(async (req, res) => {
    const result = await router.resetOrganizationUserPassword(req.params.id, req.body?.userId, actorOf(req.auth!, req.ip));
    res.json({ success: true, ...result });
  }));

  // ---------------------------------------------------------
  // Conta Mãe: users, links and access of ANY organization.
  // Only access-control metadata is exposed here (people, links, profiles). Business data (candidates, jobs...)
  // is never reachable by the platform environment. Every query is scoped by the organization id in the URL.
  // ---------------------------------------------------------
  const superActor = (req: Request) => ({ id: req.auth!.id, permissions: [...ALL_PERMISSIONS] });
  /** Access changes clear the session cache AFTER commit so no request can re-cache a pre-commit state. */
  const accessTx = async <T,>(fn: (tx: PoolClient) => Promise<T>): Promise<T> => {
    try {
      return await withTransaction(fn);
    } finally {
      sessionCache.clear();
    }
  };
  const orgOr404 = async (id: string) => {
    const tenant = await router.getTenantById(id);
    if (!tenant) throw new NotFoundError('Organização não encontrada');
    return tenant;
  };
  const masterAudit = (req: Request, tenantId: string, action: string, details: string, tx?: PoolClient) =>
    logAudit(
      {
        tenantId,
        userId: req.auth!.id,
        userName: req.auth!.name,
        action,
        category: 'ACCESS_CONTROL',
        details,
        ipAddress: req.ip || '127.0.0.1',
        databaseAffected: tenantId ? 'tenant_users' : 'app_users'
      },
      tx
    );

  app.get('/api/master/tenants/:id/members', h(async (req, res) => {
    await orgOr404(req.params.id);
    const page = await AccessService.listMembersPage(getPool(), req.params.id, {
      search: String(req.query.search ?? ''), page: Number(req.query.page), pageSize: Number(req.query.pageSize)
    });
    res.json({ success: true, users: page.items, total: page.total, page: page.page, pageSize: page.pageSize });
  }));

  app.post('/api/master/tenants/:id/members', h(async (req, res) => {
    const tenant = await orgOr404(req.params.id);
    const { name, email, profileId, jobTitle, departmentId, permissions } = req.body ?? {};
    const result = await accessTx(async tx => {
      const added = await AccessService.addMember(
        tx, tenant.id,
        { name: required(name, 'name'), email: required(email, 'email'), profileId, jobTitle, departmentId, permissions },
        superActor(req)
      );
      const tempPassword = added.identityCreated ? await auth.issueTempPassword(added.identityId, tx) : undefined;
      await masterAudit(req, tenant.id, added.identityCreated ? 'USER_CREATED' : 'USER_LINKED',
        `${added.identityCreated ? 'Usuário criado' : 'Usuário existente vinculado'} pela Conta Mãe: ${added.member.email} (${added.member.profileName}) em '${tenant.name}'`, tx);
      return { user: added.member, tempPassword, linkedExisting: !added.identityCreated };
    });
    res.status(201).json({ success: true, ...result });
  }));

  app.patch('/api/master/tenants/:id/members/:memberId', h(async (req, res) => {
    const tenant = await orgOr404(req.params.id);
    const { name, jobTitle, departmentId, profileId, active, permissions } = req.body ?? {};
    const user = await accessTx(async tx => {
      const updated = await AccessService.updateMember(
        tx, tenant.id, req.params.memberId,
        { name, jobTitle, departmentId, profileId, permissions, active: typeof active === 'boolean' ? active : undefined },
        superActor(req)
      );
      await masterAudit(req, tenant.id, 'USER_ACCESS_UPDATED', `Acesso de ${updated.email} em '${tenant.name}' alterado pela Conta Mãe (perfil ${updated.profileName}, ${updated.active ? 'ativo' : 'inativo'})`, tx);
      return updated;
    });
    res.json({ success: true, user });
  }));

  app.post('/api/master/tenants/:id/members/:memberId/reset-password', h(async (req, res) => {
    const tenant = await orgOr404(req.params.id);
    const out = await accessTx(async tx => {
      const member = await AccessService.getMember(tx, tenant.id, req.params.memberId);
      if (!member) throw new NotFoundError('Usuário não encontrado nesta organização.');
      const tempPassword = await auth.issueTempPassword(member.userId, tx);
      await masterAudit(req, tenant.id, 'PASSWORD_RESET_ISSUED', `Senha temporária emitida para ${member.email} pela Conta Mãe`, tx);
      return { user: member, tempPassword };
    });
    res.json({ success: true, ...out });
  }));

  app.get('/api/master/tenants/:id/profiles', h(async (req, res) => {
    await orgOr404(req.params.id);
    res.json({ success: true, profiles: await AccessService.listProfiles(getPool(), req.params.id) });
  }));

  app.post('/api/master/tenants/:id/profiles', h(async (req, res) => {
    const tenant = await orgOr404(req.params.id);
    const profile = await accessTx(async tx => {
      const created = await AccessService.createProfile(tx, tenant.id, req.body ?? {}, superActor(req));
      await masterAudit(req, tenant.id, 'PROFILE_CREATED', `Perfil '${created.name}' criado pela Conta Mãe em '${tenant.name}'`, tx);
      return created;
    });
    res.status(201).json({ success: true, profile });
  }));

  app.put('/api/master/tenants/:id/profiles/:profileId', h(async (req, res) => {
    const tenant = await orgOr404(req.params.id);
    const profile = await accessTx(async tx => {
      const updated = await AccessService.updateProfile(tx, tenant.id, req.params.profileId, req.body ?? {}, superActor(req));
      await masterAudit(req, tenant.id, 'PROFILE_UPDATED', `Perfil '${updated.name}' atualizado pela Conta Mãe em '${tenant.name}'`, tx);
      return updated;
    });
    res.json({ success: true, profile });
  }));

  app.delete('/api/master/tenants/:id/profiles/:profileId', h(async (req, res) => {
    const tenant = await orgOr404(req.params.id);
    await accessTx(async tx => {
      const removed = await AccessService.deleteProfile(tx, tenant.id, req.params.profileId);
      await masterAudit(req, tenant.id, 'PROFILE_DELETED', `Perfil '${removed.name}' excluído pela Conta Mãe em '${tenant.name}'`, tx);
    });
    res.json({ success: true });
  }));

  // People across the platform (global identities + their links)
  app.get('/api/master/users', h(async (req, res) => {
    const page = await AccessService.listIdentities(getPool(), {
      search: String(req.query.search ?? ''), page: Number(req.query.page), pageSize: Number(req.query.pageSize)
    });
    res.json({ success: true, users: page.items, total: page.total, page: page.page, pageSize: page.pageSize });
  }));

  // New person, optionally already linked to an organization with a profile. An e-mail that exists is a conflict
  // (link it from the organization instead), so a password is never silently replaced.
  app.post('/api/master/users', h(async (req, res) => {
    const { name, email, link } = req.body ?? {};
    const out = await accessTx(async tx => {
      let identityId: string;
      if (link && typeof link === 'object') {
        const tenant = await orgOr404(String(link.tenantId ?? ''));
        const added = await AccessService.addMember(
          tx, tenant.id,
          { name: required(name, 'name'), email: required(email, 'email'), profileId: link.profileId, jobTitle: link.jobTitle, permissions: link.permissions },
          superActor(req)
        );
        if (!added.identityCreated) throw new ConflictError('Já existe um usuário com este e-mail. Vincule-o pela organização.');
        identityId = added.identityId;
      } else {
        identityId = await AccessService.createIdentity(tx, { name: required(name, 'name'), email: required(email, 'email') });
      }
      const tempPassword = await auth.issueTempPassword(identityId, tx);
      await masterAudit(req, '', 'USER_CREATED', `Usuário ${String(email).toLowerCase()} criado pela Conta Mãe${link ? ' com vínculo inicial' : ''}`, tx);
      return { user: (await AccessService.listIdentities(tx, { onlyId: identityId, pageSize: 1 })).items[0], tempPassword };
    });
    res.status(201).json({ success: true, ...out });
  }));

  app.patch('/api/master/users/:userId', h(async (req, res) => {
    const { active, name } = req.body ?? {};
    const user = await accessTx(async tx => {
      const current = (await AccessService.listIdentities(tx, { onlyId: req.params.userId, pageSize: 1 })).items[0];
      if (!current) throw new NotFoundError('Usuário não encontrado.');
      const next = typeof active === 'boolean' ? active : current.active;
      const updated = await AccessService.setIdentityActive(tx, req.params.userId, next, name);
      await masterAudit(req, '', 'USER_ACCESS_UPDATED', `Usuário ${updated.email} ${next === current.active ? 'atualizado' : next ? 'reativado' : 'desativado'} em toda a plataforma pela Conta Mãe`, tx);
      return updated;
    });
    res.json({ success: true, user });
  }));

  app.post('/api/master/users/:userId/reset-password', h(async (req, res) => {
    const out = await accessTx(async tx => {
      const user = (await AccessService.listIdentities(tx, { onlyId: req.params.userId, pageSize: 1 })).items[0];
      if (!user) throw new NotFoundError('Usuário não encontrado.');
      const tempPassword = await auth.issueTempPassword(user.id, tx);
      await masterAudit(req, '', 'PASSWORD_RESET_ISSUED', `Senha temporária emitida para ${user.email} pela Conta Mãe`, tx);
      return { user, tempPassword };
    });
    res.json({ success: true, ...out });
  }));

  // SuperAdmin Global Telemetry & Cross-Tenant Analytics
  app.get('/api/master/telemetry', h(async (req, res) => {
    res.json({ success: true, telemetry: await router.getGlobalTelemetry() });
  }));

  // Master Audit Logs (Isolation, Provisioning, Routing trace)
  app.get('/api/master/audit-logs', h(async (req, res) => {
    const { logs, nextCursor } = await router.getMasterAuditLogs({
      limit: Number(req.query.limit),
      before: req.query.before ? String(req.query.before) : undefined,
      category: req.query.category ? String(req.query.category) : undefined,
      q: req.query.q ? String(req.query.q) : undefined,
      tenantId: req.query.tenantId ? String(req.query.tenantId) : undefined
    });
    res.json({ success: true, logs, nextCursor });
  }));

  // =========================================================================
  // DYNAMIC TENANT CONNECTION ROUTING MIDDLEWARE
  // Resolves the tenant and mounts a repository hard-scoped to it
  // =========================================================================
  const tenantRoutingMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = await router.routeConnection(req, req.auth!);
      req.tenantContext = context;

      // Expose routing metadata in response headers for transparency & debugging
      res.setHeader('X-Resolved-Tenant-Id', context.tenant.id);
      res.setHeader('X-Isolated-Database', context.tenant.dbConfig.dbName);
      res.setHeader('X-Routing-Strategy', context.resolution.strategy);
      res.setHeader('X-Routing-Latency-Ms', context.resolution.latencyMs.toString());

      next();
    } catch (err) {
      const { status, message, code } = toHttpError(err);
      res.status(status).json({
        success: false,
        error: message,
        code,
        tip: 'Verifique se a organização da sua sessão está ativa.'
      });
    }
  };

  // Mount router middleware on all /api/v1 routes
  app.use('/api/v1', authenticate, requirePasswordChanged, tenantRoutingMiddleware);

  const ctx = (req: Request) => req.tenantContext!;

  // ---------------------------------------------------------
  // MÓDULO 1: Contexto e Conexão da Organização Ativa
  // ---------------------------------------------------------
  app.get('/api/v1/context', h(async (req, res) => {
    const { tenant, telemetry, resolution } = ctx(req);
    res.json({ success: true, tenant, telemetry, routingResolution: resolution });
  }));

  // ---------------------------------------------------------
  // MÓDULO 2: Usuários e Permissões (RBAC)
  // ---------------------------------------------------------
  const actorAccess = (req: Request) => ({ id: req.auth!.id, permissions: req.auth!.permissions });
  const audit = (req: Request, action: string, details: string, tx?: PoolClient) =>
    logAudit(
      {
        tenantId: ctx(req).tenant.id,
        userId: req.auth!.id,
        userName: req.auth!.name,
        action,
        category: 'ACCESS_CONTROL',
        details,
        ipAddress: req.ip || '127.0.0.1',
        databaseAffected: ctx(req).tenant.dbConfig.dbName
      },
      tx
    );

  app.get('/api/v1/users', can('users:view'), h(async (req, res) => {
    const paged = req.query.page || req.query.pageSize || req.query.search;
    if (!paged) {
      res.json({ success: true, users: await AccessService.listMembers(getPool(), ctx(req).tenant.id) });
      return;
    }
    const page = await AccessService.listMembersPage(getPool(), ctx(req).tenant.id, {
      search: String(req.query.search ?? ''), page: Number(req.query.page), pageSize: Number(req.query.pageSize)
    });
    res.json({ success: true, users: page.items, total: page.total, page: page.page, pageSize: page.pageSize });
  }));

  // Links a person to this organization. An e-mail that already has an account is LINKED (its password is
  // never touched); a new e-mail gets an identity plus a one-time temporary password.
  app.post('/api/v1/users', can('users:create'), h(async (req, res) => {
    const { tenant } = ctx(req);
    const { name, email, profileId, jobTitle, departmentId, permissions } = req.body ?? {};
    const result = await accessTx(async tx => {
      const added = await AccessService.addMember(
        tx,
        tenant.id,
        { name: required(name, 'name'), email: required(email, 'email'), profileId, jobTitle, departmentId, permissions },
        actorAccess(req)
      );
      const tempPassword = added.identityCreated ? await auth.issueTempPassword(added.identityId, tx) : undefined;
      await audit(
        req,
        added.identityCreated ? 'USER_CREATED' : 'USER_LINKED',
        `${added.identityCreated ? 'Usuário criado' : 'Usuário existente vinculado'}: ${added.member.email} (${added.member.profileName})`,
        tx
      );
      return { user: added.member, tempPassword, linkedExisting: !added.identityCreated };
    });
    res.status(201).json({ success: true, ...result });
  }));

  app.patch('/api/v1/users/:id', can('users:edit'), h(async (req, res) => {
    const { tenant } = ctx(req);
    const { name, jobTitle, departmentId, profileId, active, permissions } = req.body ?? {};
    const user = await accessTx(async tx => {
      const before = await AccessService.getMember(tx, tenant.id, req.params.id);
      const updated = await AccessService.updateMember(
        tx,
        tenant.id,
        req.params.id,
        { name, jobTitle, departmentId, profileId, permissions, active: typeof active === 'boolean' ? active : undefined },
        actorAccess(req)
      );
      const changes = [
        before && before.profileId !== updated.profileId ? `perfil ${before.profileName} → ${updated.profileName}` : '',
        before && before.active !== updated.active ? (updated.active ? 'reativado' : 'desativado') : '',
        permissions !== undefined ? 'permissões individuais ajustadas' : ''
      ].filter(Boolean);
      await audit(req, 'USER_ACCESS_UPDATED', `Acesso de ${updated.email} alterado${changes.length ? `: ${changes.join('; ')}` : ''}`, tx);
      return updated;
    });
    res.json({ success: true, user });
  }));

  app.post('/api/v1/users/:id/reset-password', can('users:edit'), h(async (req, res) => {
    const { tenant } = ctx(req);
    const user = await accessTx(async tx => {
      const member = await AccessService.getMember(tx, tenant.id, req.params.id);
      if (!member) throw new NotFoundError('Usuário não encontrado');
      await AccessService.assertPasswordResettable(tx, tenant.id, member, actorAccess(req));
      const tempPassword = await auth.issueTempPassword(member.userId, tx);
      await audit(req, 'PASSWORD_RESET_ISSUED', `Senha temporária emitida para ${member.email}`, tx);
      return { member, tempPassword };
    });
    res.json({ success: true, user: user.member, tempPassword: user.tempPassword });
  }));

  // Access profiles: sets of permissions per routine
  // (also needed by whoever assigns profiles to users)
  app.get('/api/v1/profiles', can('profiles:view', 'users:create', 'users:edit'), h(async (req, res) => {
    res.json({ success: true, profiles: await AccessService.listProfiles(getPool(), ctx(req).tenant.id) });
  }));

  app.post('/api/v1/profiles', can('profiles:create'), h(async (req, res) => {
    const { tenant } = ctx(req);
    const profile = await accessTx(async tx => {
      const created = await AccessService.createProfile(tx, tenant.id, req.body ?? {}, actorAccess(req));
      await audit(req, 'PROFILE_CREATED', `Perfil '${created.name}' criado (${created.permissions.length} permissões)`, tx);
      return created;
    });
    res.status(201).json({ success: true, profile });
  }));

  app.put('/api/v1/profiles/:id', can('profiles:edit'), h(async (req, res) => {
    const { tenant } = ctx(req);
    const profile = await accessTx(async tx => {
      const updated = await AccessService.updateProfile(tx, tenant.id, req.params.id, req.body ?? {}, actorAccess(req));
      await audit(req, 'PROFILE_UPDATED', `Perfil '${updated.name}' atualizado (${updated.permissions.length} permissões)`, tx);
      return updated;
    });
    res.json({ success: true, profile });
  }));

  app.delete('/api/v1/profiles/:id', can('profiles:delete'), h(async (req, res) => {
    const { tenant } = ctx(req);
    await accessTx(async tx => {
      const removed = await AccessService.deleteProfile(tx, tenant.id, req.params.id);
      await audit(req, 'PROFILE_DELETED', `Perfil '${removed.name}' excluído`, tx);
    });
    res.json({ success: true });
  }));

  // ---------------------------------------------------------
  // MÓDULO 3: DNA Organizacional
  // ---------------------------------------------------------
  app.get('/api/v1/dna', can('dna:view'), h(async (req, res) => {
    const dna = await ctx(req).db.getDna();
    if (!dna) throw new NotFoundError('DNA organizacional não configurado.');
    res.json({ success: true, dna });
  }));

  app.put('/api/v1/dna', can('dna:edit'), h(async (req, res) => {
    const { db } = ctx(req);
    const current = await db.getDna();
    if (!current) throw new NotFoundError('DNA organizacional não configurado.');
    const { mission, vision, archetype, cultureSummary, coreValues, pillars, culturalFitThreshold } = req.body;
    const { tenantId: _t, ...base } = current;
    const dna = await db.upsertDna({
      ...base,
      mission: mission ?? current.mission,
      vision: vision ?? current.vision,
      archetype: archetype ?? current.archetype,
      cultureSummary: cultureSummary ?? current.cultureSummary,
      coreValues: coreValues ?? current.coreValues,
      pillars: pillars ?? current.pillars,
      culturalFitThreshold: culturalFitThreshold ?? current.culturalFitThreshold,
      updatedAt: new Date().toISOString()
    });
    res.json({ success: true, dna });
  }));

  // ---------------------------------------------------------
  // MÓDULO 4: Estrutura Organizacional
  // ---------------------------------------------------------
  app.get('/api/v1/departments', can('structure:view'), h(async (req, res) => {
    res.json({ success: true, departments: await ctx(req).db.departments.list() });
  }));

  app.post('/api/v1/departments', can('structure:create'), h(async (req, res) => {
    const { db } = ctx(req);
    const { name, code, costCenter, headcountTarget, managerId } = req.body;
    const deptName = required(name, 'name');
    const users = await db.users.list();
    const department = await db.departments.insert({
      id: newId('dep'),
      name: deptName,
      code: code || deptName.slice(0, 4).toUpperCase(),
      costCenter: costCenter || 'CC-1000',
      headcountTarget: Number(headcountTarget) || 10,
      currentHeadcount: 1,
      managerId: managerId || users[0]?.id
    });
    res.status(201).json({ success: true, department });
  }));

  // ---------------------------------------------------------
  // MÓDULO 5: Cargos
  // ---------------------------------------------------------
  app.get('/api/v1/positions', can('positions:view'), h(async (req, res) => {
    res.json({ success: true, positions: await ctx(req).db.positions.list() });
  }));

  app.post('/api/v1/positions', can('positions:create'), h(async (req, res) => {
    const { db } = ctx(req);
    const { title, departmentId, level, description, technicalRequirements, behavioralCompetencies, minSalary, maxSalary, careerTrack } = req.body;
    const position = await db.positions.insert({
      id: newId('pos'),
      title: required(title, 'title'),
      departmentId: required(departmentId, 'departmentId'),
      level: level || 'Pleno',
      description: description ?? '',
      technicalRequirements: csv(technicalRequirements),
      behavioralCompetencies: csv(behavioralCompetencies),
      minSalary: Number(minSalary) || 8000,
      maxSalary: Number(maxSalary) || 12000,
      currency: 'BRL',
      careerTrack: careerTrack || 'Y_TECNICO',
      status: 'active'
    });
    res.status(201).json({ success: true, position });
  }));

  // ---------------------------------------------------------
  // MÓDULO 6: Vagas
  // ---------------------------------------------------------
  app.get('/api/v1/openings', can('openings:view'), h(async (req, res) => {
    res.json({ success: true, openings: await ctx(req).db.openings.list() });
  }));

  app.post('/api/v1/openings', can('openings:create'), h(async (req, res) => {
    const { db } = ctx(req);
    const { title, positionId, departmentId, workModel, location, slaDays, openingsCount, salaryOfferedMin, salaryOfferedMax } = req.body;
    const [users, positions, departments] = await Promise.all([db.users.list(), db.positions.list(), db.departments.list()]);

    const resolvedPositionId = positionId || positions[0]?.id;
    const resolvedDepartmentId = departmentId || departments[0]?.id;
    if (!resolvedPositionId) throw new ValidationError('Cadastre um cargo antes de abrir uma vaga.');
    if (!resolvedDepartmentId) throw new ValidationError('Cadastre um departamento antes de abrir uma vaga.');

    const sla = Number(slaDays) || 30;
    const opening = await db.openings.insert({
      id: newId('job'),
      title: required(title, 'title'),
      positionId: resolvedPositionId,
      departmentId: resolvedDepartmentId,
      hiringManagerId: users.find(u => u.profileId === 'hiring_manager')?.id || users[0]?.id,
      recruiterId: users.find(u => u.profileId === 'recruiter')?.id || users[0]?.id,
      status: 'open',
      openingsCount: Number(openingsCount) || 1,
      filledCount: 0,
      workModel: workModel || 'Híbrido',
      location: location || 'Remoto / Brasil',
      slaDays: sla,
      openedAt: new Date().toISOString(),
      targetFillDate: new Date(Date.now() + sla * 86400000).toISOString(),
      salaryOfferedMin: Number(salaryOfferedMin) || undefined,
      salaryOfferedMax: Number(salaryOfferedMax) || undefined,
      stages: [
        { id: 'stg-1', name: 'Triagem Inicial', type: 'screening', order: 1, description: 'Análise de currículo' },
        { id: 'stg-2', name: 'Fit Cultural com IA', type: 'cultural_fit', order: 2, description: 'Aderência ao DNA e explicabilidade' },
        { id: 'stg-3', name: 'Entrevista de Competências', type: 'technical_assessment', order: 3, description: 'Validação técnica ou prática' },
        { id: 'stg-4', name: 'Alinhamento Final', type: 'manager_interview', order: 4, description: 'Conversa com Gestor' },
        { id: 'stg-5', name: 'Proposta & Oferta', type: 'proposal', order: 5, description: 'Envio formal' }
      ]
    });
    res.status(201).json({ success: true, opening });
  }));

  // ---------------------------------------------------------
  // MÓDULO 7: Candidatos
  // ---------------------------------------------------------
  app.get('/api/v1/candidates', can('candidates:view'), h(async (req, res) => {
    res.json({ success: true, candidates: await ctx(req).db.candidates.list() });
  }));

  app.post('/api/v1/candidates', can('candidates:create'), h(async (req, res) => {
    const { db } = ctx(req);
    const { name, email, phone, location, currentRole, yearsOfExperience, education, resumeSummary, skills, languages, tags, linkedinUrl } = req.body;
    const candidate = await db.candidates.insert({
      id: newId('cand'),
      name: required(name, 'name'),
      email: required(email, 'email'),
      phone: phone || '+55 11 99999-0000',
      location: location || 'Brasil',
      linkedinUrl,
      currentRole: currentRole || 'Profissional',
      yearsOfExperience: Number(yearsOfExperience) || 3,
      education: education || 'Ensino Superior Completo',
      resumeSummary: resumeSummary || 'Perfil cadastrado na plataforma.',
      skills: csv(skills),
      languages: Array.isArray(languages) ? languages : ['Português (Nativo)'],
      registeredAt: new Date().toISOString(),
      tags: Array.isArray(tags) ? tags : ['Novo Candidato']
    });
    res.status(201).json({ success: true, candidate });
  }));

  // ---------------------------------------------------------
  // MÓDULO 8: Processo Seletivo (Inscrições / Kanban Pipeline)
  // ---------------------------------------------------------
  // (also read as supporting data by candidates / interviews, which is all an Entrevistador needs)
  app.get('/api/v1/applications', can('selection:view', 'candidates:view', 'interviews:view'), h(async (req, res) => {
    res.json({ success: true, applications: await ctx(req).db.applications.list() });
  }));

  app.post('/api/v1/applications', can('selection:create'), h(async (req, res) => {
    const { db } = ctx(req);
    const candidateId = required(req.body.candidateId, 'candidateId');
    const jobOpeningId = required(req.body.jobOpeningId, 'jobOpeningId');
    const application = await db.createApplication(candidateId, jobOpeningId, newId('app'));
    res.status(201).json({ success: true, application });
  }));

  app.patch('/api/v1/applications/:id/stage', can('selection:edit'), h(async (req, res) => {
    const { stageId, note, status } = req.body;
    const application = await ctx(req).db.moveApplication(req.params.id, { stageId, status, note });
    res.json({ success: true, application });
  }));

  // ---------------------------------------------------------
  // MÓDULO 9: Avaliação Assistida por IA
  // (Princípios: IA como apoio, Decisão humana, Explicação)
  // ---------------------------------------------------------
  app.get('/api/v1/ai/evaluations', can('ai_evaluation:view', 'candidates:view', 'interviews:view'), h(async (req, res) => {
    res.json({ success: true, evaluations: await ctx(req).db.aiEvaluations.list() });
  }));

  app.post('/api/v1/ai/evaluate-candidate', can('ai_evaluation:create'), h(async (req, res) => {
    const { db, tenant } = ctx(req);
    const candidateId = required(req.body.candidateId, 'candidateId');
    const jobOpeningId = required(req.body.jobOpeningId, 'jobOpeningId');

    const candidate = await db.candidates.get(candidateId);
    if (!candidate) throw new NotFoundError('Candidato não encontrado no banco deste tenant.');

    const job = await db.openings.get(jobOpeningId);
    if (!job) throw new NotFoundError('Vaga não encontrada no banco deste tenant.');

    const [position, dna] = await Promise.all([db.positions.get(job.positionId), db.getDna()]);
    if (!dna) throw new NotFoundError('DNA organizacional não configurado para este tenant.');

    // Perform AI Assisted Evaluation server-side via Gemini API
    const aiResult = await evaluateCandidateWithAI({ candidate, job, position, dna });

    const evaluation = await db.saveAIEvaluation({
      id: newId('eval'),
      evaluatedAt: new Date().toISOString(),
      ...aiResult
    });

    await router.logMasterAudit({
      tenantId: tenant.id,
      userId: req.auth!.id,
      userName: req.auth!.name,
      action: 'AI_EVALUATION_COMPLETED',
      category: 'AI_EXECUTION',
      details: `Avaliação de IA assistida concluída para candidato ${candidate.name} na vaga ${job.title}. Score: ${evaluation.overallFitScore}%`,
      ipAddress: req.ip || '127.0.0.1',
      databaseAffected: tenant.dbConfig.dbName
    });

    res.status(201).json({ success: true, evaluation });
  }));

  // Human Review & Override (Princípio: Decisão Humana)
  app.patch('/api/v1/ai/evaluations/:id/human-decision', can('ai_evaluation:edit'), h(async (req, res) => {
    const { db } = ctx(req);
    const { decision, humanNotes, reviewerName } = req.body;
    const evaluation = await db.aiEvaluations.update(req.params.id, {
      humanReviewerDecision: required(decision, 'decision'),
      humanNotes,
      reviewedBy: reviewerName || 'Recrutador Responsável',
      reviewedAt: new Date().toISOString()
    });
    if (!evaluation) throw new NotFoundError('Avaliação não encontrada');
    res.json({ success: true, evaluation });
  }));

  // ---------------------------------------------------------
  // MÓDULO 10: Entrevistas
  // ---------------------------------------------------------
  app.get('/api/v1/interviews', can('interviews:view'), h(async (req, res) => {
    res.json({ success: true, interviews: await ctx(req).db.interviews.list() });
  }));

  app.post('/api/v1/interviews', can('interviews:create'), h(async (req, res) => {
    const { db } = ctx(req);
    const { jobOpeningId, candidateId, stageName, scheduledFor, interviewerIds, durationMinutes, meetLink, structuredScript } = req.body;
    const users = await db.users.list();
    const interview = await db.interviews.insert({
      id: newId('int'),
      jobOpeningId: required(jobOpeningId, 'jobOpeningId'),
      candidateId: required(candidateId, 'candidateId'),
      stageName: stageName || 'Entrevista com RH',
      scheduledFor: scheduledFor || new Date(Date.now() + 86400000).toISOString(),
      interviewerIds: Array.isArray(interviewerIds) && interviewerIds.length ? interviewerIds : users[0] ? [users[0].id] : [],
      durationMinutes: Number(durationMinutes) || 45,
      meetLink: meetLink || 'https://meet.google.com/xyz-talent',
      status: 'scheduled',
      structuredScript: structuredScript || [
        'Apresentação mútua e trajetória profissional',
        'Investigação das competências técnicas do cargo',
        'Validação dos pilares do DNA cultural da empresa'
      ],
      scorecard: [
        { competency: 'Aderência Cultural', score: 4, notes: '' },
        { competency: 'Competência Técnica', score: 4, notes: '' }
      ]
    });
    res.status(201).json({ success: true, interview });
  }));

  app.patch('/api/v1/interviews/:id/scorecard', can('interviews:edit'), h(async (req, res) => {
    const { scorecard, recommendation, overallFeedback } = req.body;
    const interview = await ctx(req).db.interviews.update(req.params.id, {
      scorecard,
      interviewerRecommendation: recommendation,
      overallFeedback,
      status: 'completed'
    });
    if (!interview) throw new NotFoundError('Entrevista não encontrada');
    res.json({ success: true, interview });
  }));

  // ---------------------------------------------------------
  // MÓDULO 11: Proposta
  // ---------------------------------------------------------
  app.get('/api/v1/offers', can('offers:view'), h(async (req, res) => {
    res.json({ success: true, offers: await ctx(req).db.offers.list() });
  }));

  app.post('/api/v1/offers', can('offers:create'), h(async (req, res) => {
    const { db } = ctx(req);
    const { jobOpeningId, candidateId, baseSalary, benefits, startDate, contractType } = req.body;
    const users = await db.users.list();
    const offer = await db.offers.insert({
      id: newId('off'),
      jobOpeningId: required(jobOpeningId, 'jobOpeningId'),
      candidateId: required(candidateId, 'candidateId'),
      baseSalary: Number(baseSalary) || 15000,
      benefits: Array.isArray(benefits) ? benefits : ['Plano de Saúde', 'Vale Refeição', 'Seguro de Vida'],
      startDate: startDate || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      contractType: contractType || 'CLT',
      status: 'pending_approval',
      approverId: users.find(u => u.profileId === 'hiring_manager')?.id || users[0]?.id
    });
    res.status(201).json({ success: true, offer });
  }));

  app.patch('/api/v1/offers/:id/status', can('offers:edit'), h(async (req, res) => {
    const { status, notes } = req.body;
    const now = new Date().toISOString();
    const offer = await ctx(req).db.offers.update(req.params.id, {
      status: required(status, 'status'),
      notes,
      sentAt: status === 'sent' ? now : undefined,
      respondedAt: status === 'accepted' || status === 'declined' ? now : undefined
    });
    if (!offer) throw new NotFoundError('Proposta não encontrada');
    res.json({ success: true, offer });
  }));

  // ---------------------------------------------------------
  // MÓDULO 12: Onboarding
  // ---------------------------------------------------------
  app.get('/api/v1/onboardings', can('onboarding:view'), h(async (req, res) => {
    res.json({ success: true, onboardings: await ctx(req).db.onboardings.list() });
  }));

  app.patch('/api/v1/onboardings/:id/checklist/:itemId', can('onboarding:edit'), h(async (req, res) => {
    const { status } = req.body;
    if (!['pending', 'in_progress', 'completed'].includes(status)) {
      throw new ValidationError('Status inválido. Use: pending, in_progress, completed.');
    }
    const onboarding = await ctx(req).db.setChecklistStatus(req.params.id, req.params.itemId, status);
    res.json({ success: true, onboarding });
  }));

  // ---------------------------------------------------------
  // MÓDULO 13: Desenvolvimento (PDI e 1:1s)
  // ---------------------------------------------------------
  app.get('/api/v1/development', can('development:view'), h(async (req, res) => {
    res.json({ success: true, developmentRecords: await ctx(req).db.development.list() });
  }));

  app.post('/api/v1/development/:id/goals', can('development:edit'), h(async (req, res) => {
    const { title, competency, deadline } = req.body;
    const goal = {
      id: newId('g'),
      title: required(title, 'title'),
      competency: competency || 'Geral',
      deadline: deadline || new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
      status: 'in_progress' as const,
      progressPercentage: 10
    };
    const developmentRecord = await ctx(req).db.addGoal(req.params.id, goal);
    res.status(201).json({ success: true, goal, developmentRecord });
  }));

  // ---------------------------------------------------------
  // MÓDULO 14: Retenção (eNPS, Clima & Termômetro de Turnover)
  // ---------------------------------------------------------
  app.get('/api/v1/retention', can('retention:view'), h(async (req, res) => {
    const { db } = ctx(req);
    const [climateSurveys, turnoverAlerts] = await Promise.all([db.climateSurveys.list(), db.turnoverAlerts.list()]);
    res.json({ success: true, climateSurveys, turnoverAlerts });
  }));

  app.post('/api/v1/retention/alert', can('retention:edit'), h(async (req, res) => {
    const { collaboratorName, department, riskLevel, earlyWarningSignals, suggestedActions } = req.body;
    const alert = await ctx(req).db.turnoverAlerts.insert({
      id: newId('alt'),
      collaboratorId: newId('colab'),
      collaboratorName: required(collaboratorName, 'collaboratorName'),
      department: department || 'Geral',
      riskLevel: riskLevel || 'Médio',
      earlyWarningSignals: csv(earlyWarningSignals),
      suggestedActions: csv(suggestedActions)
    });
    res.status(201).json({ success: true, alert });
  }));

  // ---------------------------------------------------------
  // MÓDULO 15: Indicadores (Tenant Analytics)
  // ---------------------------------------------------------
  app.get('/api/v1/indicators', can('indicators:view'), h(async (req, res) => {
    const indicators = await ctx(req).db.getIndicators();
    if (!indicators) throw new NotFoundError('Indicadores não disponíveis para este tenant.');
    res.json({ success: true, indicators });
  }));

  // Unknown API routes must not fall through to the SPA
  app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
  });

  // Central error handler (validation, not-found, Postgres constraint errors, ...)
  app.use('/api', (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const { status, message, code } = toHttpError(err);
    if (status >= 500) console.error(`[api] ${req.method} ${req.originalUrl}:`, err);
    res.status(status).json({ success: false, error: message, code });
  });

  // ==========================================
  // VITE MIDDLEWARE (Development & Production)
  // ==========================================
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TalentCloud Core] Servidor no ar. Abra no navegador: http://localhost:${PORT}`);
    console.log(`[TalentCloud Core] (0.0.0.0 é só o endereço em que o servidor escuta; não digite 0.0.0.0 no navegador)`);
    console.log(`[TalentCloud Core] Multi-tenancy routing active - database: Supabase Postgres`);
  });

  const shutdown = () => {
    server.close(() => closePool().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch(err => {
  console.error('Fatal: Failed to start TalentCloud Server:', err);
  process.exit(1);
});
