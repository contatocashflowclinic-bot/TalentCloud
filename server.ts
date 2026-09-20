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
import { AppError, ConflictError, NotFoundError, ValidationError, toHttpError } from './server/errors.js';
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
import { assertValidFile, getFile, putFile, removeFile, safeFileName } from './server/storage.js';
import { reviewItem, type AdmissionAction } from './server/tenant/admission.js';
import { CANDIDATE_DECLARED_FIELDS, type AdmissionItem, type OnboardingChecklistItem } from './src/types.js';

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
const ROUTE_NOT_FOUND_MESSAGE =
  'Não foi possível concluir esta ação porque o sistema está desatualizado. ' +
  'Atualize a página (Ctrl+F5) e tente de novo. Se o problema continuar, avise o suporte.';

const h = (fn:(req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

const csv = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
    : String(value ?? '').split(',').map(s => s.trim()).filter(Boolean);

const csvLines = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(v => String(v).trim()).filter(Boolean) : String(value ?? '').split('\n').map(s => s.trim()).filter(Boolean);

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
        superActor(req),
        { linkExisting: true }
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
          superActor(req),
          { linkExisting: true }
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

  // Registers a person in this organization: a NEW e-mail gets an identity plus a one-time temporary password.
  // An e-mail that already has an account on the platform is refused here: giving one person access to several
  // organizations is done only by the Conta Mãe (/api/master).
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

  // Shared helpers for the edit (PATCH) routes: only fields present in the body are validated and changed.
  const has = (body: Record<string, unknown>, key: string) => body[key] !== undefined;
  const intIn = (value: unknown, label: string, min: number, max: number): number => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError(`${label} deve ser um número inteiro entre ${min} e ${max}.`);
    return n;
  };
  const moneyOf = (value: unknown, label: string): number => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 99_999_999) throw new ValidationError(`${label} inválido.`);
    return n;
  };
  const optionalMoney = (value: unknown, label: string): number | null =>
    value === null || value === '' ? null : moneyOf(value, label);
  const requireUser = async (db: TenantConnectionContext['db'], id: unknown, label: string): Promise<string> => {
    const userId = required(id, label);
    if (!(await db.users.list()).some(u => u.id === userId)) throw new ValidationError(`${label}: usuário não encontrado nesta organização.`);
    return userId;
  };

  app.patch('/api/v1/departments/:id', can('structure:edit'), h(async (req, res) => {
    const { db } = ctx(req);
    const b = req.body ?? {};
    const patch: Record<string, unknown> = {};
    if (has(b, 'name')) patch.name = required(b.name, 'name');
    if (has(b, 'code')) patch.code = required(b.code, 'code');
    if (has(b, 'costCenter')) patch.costCenter = required(b.costCenter, 'costCenter');
    if (has(b, 'headcountTarget')) patch.headcountTarget = intIn(b.headcountTarget, 'Meta de headcount', 0, 100000);
    if (has(b, 'currentHeadcount')) patch.currentHeadcount = intIn(b.currentHeadcount, 'Headcount atual', 0, 100000);
    if (has(b, 'managerId')) patch.managerId = b.managerId === null || b.managerId === '' ? null : await requireUser(db, b.managerId, 'managerId');
    if (has(b, 'parentId')) {
      if (b.parentId === null || b.parentId === '') {
        patch.parentId = null;
      } else {
        const parentId = required(b.parentId, 'parentId');
        const all = await db.departments.list();
        if (!all.some(d => d.id === parentId)) throw new ValidationError('Departamento superior não encontrado.');
        // a department can never sit under itself or under one of its own descendants
        for (let cursor: string | undefined = parentId, guard = 0; cursor && guard < 100; guard++) {
          if (cursor === req.params.id) throw new ValidationError('Um departamento não pode ficar subordinado a si mesmo ou a uma de suas subáreas.');
          cursor = all.find(d => d.id === cursor)?.parentId;
        }
        patch.parentId = parentId;
      }
    }
    const department = await db.departments.update(req.params.id, patch);
    if (!department) throw new NotFoundError('Departamento não encontrado');
    res.json({ success: true, department });
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

  app.patch('/api/v1/positions/:id', can('positions:edit'), h(async (req, res) => {
    const { db } = ctx(req);
    const b = req.body ?? {};
    const current = await db.positions.get(req.params.id);
    if (!current) throw new NotFoundError('Cargo não encontrado');
    const patch: Record<string, unknown> = {};
    if (has(b, 'title')) patch.title = required(b.title, 'title');
    if (has(b, 'departmentId')) patch.departmentId = required(b.departmentId, 'departmentId');
    if (has(b, 'level')) patch.level = oneOfList(b.level, POSITION_LEVELS, 'Nível');
    if (has(b, 'description')) patch.description = String(b.description ?? '').trim();
    if (has(b, 'technicalRequirements')) patch.technicalRequirements = csv(b.technicalRequirements);
    if (has(b, 'behavioralCompetencies')) patch.behavioralCompetencies = csv(b.behavioralCompetencies);
    if (has(b, 'careerTrack')) patch.careerTrack = oneOfList(b.careerTrack, ['Y_TECNICO', 'GESTÃO', 'OPERACIONAL'], 'Trilha de carreira');
    if (has(b, 'status')) patch.status = oneOfList(b.status, ['active', 'archived'], 'Situação');
    if (has(b, 'minSalary')) patch.minSalary = moneyOf(b.minSalary, 'Salário mínimo');
    if (has(b, 'maxSalary')) patch.maxSalary = moneyOf(b.maxSalary, 'Salário máximo');
    if (Number(patch.maxSalary ?? current.maxSalary) < Number(patch.minSalary ?? current.minSalary)) {
      throw new ValidationError('O salário máximo não pode ser menor que o mínimo.');
    }
    res.json({ success: true, position: await db.positions.update(req.params.id, patch) });
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

  app.patch('/api/v1/openings/:id', can('openings:edit'), h(async (req, res) => {
    const { db } = ctx(req);
    const b = req.body ?? {};
    const current = await db.openings.get(req.params.id);
    if (!current) throw new NotFoundError('Vaga não encontrada');
    const patch: Record<string, unknown> = {};
    if (has(b, 'title')) patch.title = required(b.title, 'title');
    if (has(b, 'positionId')) patch.positionId = required(b.positionId, 'positionId');
    if (has(b, 'departmentId')) patch.departmentId = required(b.departmentId, 'departmentId');
    if (has(b, 'hiringManagerId')) patch.hiringManagerId = await requireUser(db, b.hiringManagerId, 'hiringManagerId');
    if (has(b, 'recruiterId')) patch.recruiterId = await requireUser(db, b.recruiterId, 'recruiterId');
    if (has(b, 'status')) patch.status = oneOfList(b.status, ['draft', 'open', 'in_progress', 'offer', 'filled', 'cancelled'], 'Situação');
    if (has(b, 'workModel')) patch.workModel = oneOfList(b.workModel, ['Presencial', 'Híbrido', 'Remoto'], 'Modelo de trabalho');
    if (has(b, 'location')) patch.location = required(b.location, 'location');
    if (has(b, 'slaDays')) patch.slaDays = intIn(b.slaDays, 'SLA', 1, 730);
    if (has(b, 'openingsCount')) {
      patch.openingsCount = intIn(b.openingsCount, 'Número de posições', 1, 10000);
      if (Number(patch.openingsCount) < current.filledCount) {
        throw new ValidationError(`A vaga já tem ${current.filledCount} posição(ões) preenchida(s); o total não pode ser menor.`);
      }
    }
    if (has(b, 'targetFillDate')) {
      const date = new Date(String(b.targetFillDate));
      if (Number.isNaN(date.getTime())) throw new ValidationError('Meta de preenchimento inválida.');
      patch.targetFillDate = date.toISOString();
    }
    if (has(b, 'salaryOfferedMin')) patch.salaryOfferedMin = optionalMoney(b.salaryOfferedMin, 'Salário oferecido (mínimo)');
    if (has(b, 'salaryOfferedMax')) patch.salaryOfferedMax = optionalMoney(b.salaryOfferedMax, 'Salário oferecido (máximo)');
    const min = (patch.salaryOfferedMin ?? current.salaryOfferedMin) as number | null | undefined;
    const max = (patch.salaryOfferedMax ?? current.salaryOfferedMax) as number | null | undefined;
    if (min != null && max != null && max < min) throw new ValidationError('O salário máximo oferecido não pode ser menor que o mínimo.');
    if (has(b, 'customQuestions')) patch.customQuestions = csvLines(b.customQuestions);
    res.json({ success: true, opening: await db.openings.update(req.params.id, patch) });
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
      tags: Array.isArray(tags) ? tags : ['Novo Candidato'],
      dataOrigin: 'rh'
    });
    res.status(201).json({ success: true, candidate });
  }));

  // Validates the fields present in a candidate body (shared by the edit and the correction routes).
  const parseCandidatePatch = (b: Record<string, unknown>): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    if (has(b, 'name')) patch.name = required(b.name, 'name');
    if (has(b, 'email')) {
      const email = required(b.email, 'email').toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('E-mail inválido.');
      patch.email = email;
    }
    if (has(b, 'phone')) patch.phone = String(b.phone ?? '').trim();
    if (has(b, 'location')) patch.location = String(b.location ?? '').trim();
    if (has(b, 'linkedinUrl')) {
      const url = String(b.linkedinUrl ?? '').trim();
      if (url && !/^https?:\/\//i.test(url)) throw new ValidationError('O LinkedIn deve começar com http:// ou https://.');
      patch.linkedinUrl = url || null;
    }
    if (has(b, 'currentRole')) patch.currentRole = required(b.currentRole, 'currentRole');
    if (has(b, 'yearsOfExperience')) patch.yearsOfExperience = intIn(b.yearsOfExperience, 'Anos de experiência', 0, 70);
    if (has(b, 'education')) patch.education = String(b.education ?? '').trim();
    if (has(b, 'resumeSummary')) patch.resumeSummary = String(b.resumeSummary ?? '').trim();
    if (has(b, 'skills')) patch.skills = csv(b.skills);
    if (has(b, 'languages')) patch.languages = csv(b.languages);
    if (has(b, 'tags')) patch.tags = csv(b.tags);
    return patch;
  };
  const DECLARED = new Set<string>(CANDIDATE_DECLARED_FIELDS);
  const auditActor = (req: Request) => ({ by: req.auth!.name, byId: req.auth!.id });

  // Edit. What the candidate declared in the portal form is protected: it changes only through a justified correction.
  app.patch('/api/v1/candidates/:id', can('candidates:edit'), h(async (req, res) => {
    const { db } = ctx(req);
    const current = await db.candidates.get(req.params.id);
    if (!current) throw new NotFoundError('Candidato não encontrado');
    const patch = parseCandidatePatch(req.body ?? {});
    if (current.dataOrigin === 'candidate') {
      const locked = Object.keys(patch).filter(k => DECLARED.has(k));
      if (locked.length > 0) {
        throw new AppError(
          'Estes dados foram informados pelo próprio candidato e não podem ser editados. Use "Registrar correção" informando o motivo.',
          409, 'DECLARED_DATA_LOCKED'
        );
      }
    }
    const { candidate } = await db.updateCandidate(req.params.id, patch, { kind: 'update', ...auditActor(req) });
    res.json({ success: true, candidate });
  }));

  // Justified correction of declared data: keeps the original value, the new one, who, when and why.
  app.post('/api/v1/candidates/:id/corrections', can('candidates:edit'), h(async (req, res) => {
    const { db, tenant } = ctx(req);
    const body = req.body ?? {};
    const reason = required(body.reason, 'motivo da correção');
    if (reason.length < 10) throw new ValidationError('Descreva o motivo da correção com pelo menos 10 caracteres.');
    const changes = body.changes && typeof body.changes === 'object' && !Array.isArray(body.changes) ? body.changes as Record<string, unknown> : {};
    const fields = Object.keys(changes);
    if (fields.length === 0) throw new ValidationError('Informe ao menos um campo a corrigir.');
    const notDeclared = fields.filter(f => !DECLARED.has(f));
    if (notDeclared.length > 0) throw new ValidationError(`Só dados informados pelo candidato passam por correção. Edite normalmente: ${notDeclared.join(', ')}.`);

    const { candidate, changedFields } = await db.updateCandidate(req.params.id, parseCandidatePatch(changes), { kind: 'correction', reason, ...auditActor(req) });
    if (changedFields.length === 0) throw new ValidationError('Nenhum valor foi alterado: os dados informados são iguais aos atuais.');

    await router.logMasterAudit({
      tenantId: tenant.id,
      userId: req.auth!.id,
      userName: req.auth!.name,
      action: 'CANDIDATE_DATA_CORRECTED',
      category: 'CANDIDATE_DATA',
      details: `Correção de dados do candidato ${candidate.name} (${changedFields.join(', ')}). Motivo: ${reason}`,
      ipAddress: req.ip || '127.0.0.1',
      databaseAffected: tenant.dbConfig.dbName
    });
    res.status(201).json({ success: true, candidate, changedFields });
  }));

  // Archive keeps everything (applications, evaluations, history); the profile just leaves the main list.
  app.post('/api/v1/candidates/:id/archive', can('candidates:edit'), h(async (req, res) => {
    const { db } = ctx(req);
    const reason = required(req.body?.reason, 'motivo do arquivamento');
    if (reason.length < 10) throw new ValidationError('Descreva o motivo do arquivamento com pelo menos 10 caracteres.');
    const current = await db.candidates.get(req.params.id);
    if (!current) throw new NotFoundError('Candidato não encontrado');
    if (current.archived) throw new ValidationError('Este perfil já está arquivado.');
    const { candidate } = await db.updateCandidate(req.params.id, { archived: true }, { kind: 'update', reason, ...auditActor(req) });
    res.json({ success: true, candidate });
  }));

  app.post('/api/v1/candidates/:id/unarchive', can('candidates:edit'), h(async (req, res) => {
    const { db } = ctx(req);
    const current = await db.candidates.get(req.params.id);
    if (!current) throw new NotFoundError('Candidato não encontrado');
    if (!current.archived) throw new ValidationError('Este perfil não está arquivado.');
    const reason = typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : 'Perfil reativado.';
    const { candidate } = await db.updateCandidate(req.params.id, { archived: false }, { kind: 'update', reason, ...auditActor(req) });
    res.json({ success: true, candidate });
  }));

  app.get('/api/v1/candidates/:id/history', can('candidates:view'), h(async (req, res) => {
    const { db } = ctx(req);
    if (!(await db.candidates.get(req.params.id))) throw new NotFoundError('Candidato não encontrado');
    res.json({ success: true, changes: await db.listCandidateChanges(req.params.id) });
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
    if ((await db.candidates.get(candidateId))?.archived) {
      throw new ValidationError('Este perfil está arquivado. Reative o perfil no Banco de Talentos antes de inscrevê-lo em uma vaga.');
    }
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

  // Catálogo de benefícios da organização (base do pacote de benefícios das propostas).
  // Benefícios não são excluídos (propostas antigas guardam o texto): são desativados.
  const BENEFIT_CATEGORIES = ['Saúde', 'Alimentação', 'Financeiro', 'Bem-estar', 'Trabalho', 'Outros'];
  const POSITION_LEVELS = ['Júnior', 'Pleno', 'Sênior', 'Especialista', 'Coordenação', 'Gerência', 'Diretoria'];
  const benefitFields = (body: Record<string, unknown>, partial: boolean) => {
    const out: Record<string, unknown> = {};
    if (!partial || body.name !== undefined) out.name = required(body.name, 'name');
    if (body.category !== undefined || !partial) {
      const category = (body.category as string) ?? 'Outros';
      if (!BENEFIT_CATEGORIES.includes(category)) throw new ValidationError('Categoria de benefício inválida.');
      out.category = category;
    }
    if (body.description !== undefined || !partial) out.description = String(body.description ?? '').trim();
    if (body.active !== undefined) out.active = Boolean(body.active);
    if (body.defaultLevels !== undefined || !partial) {
      const levels = csv(body.defaultLevels);
      if (levels.some(l => !POSITION_LEVELS.includes(l))) throw new ValidationError('Nível de cargo inválido.');
      out.defaultLevels = levels;
    }
    return out;
  };

  app.get('/api/v1/benefits', can('offers:view'), h(async (req, res) => {
    res.json({ success: true, benefits: await ctx(req).db.benefits.list() });
  }));

  app.post('/api/v1/benefits', can('offers:edit'), h(async (req, res) => {
    const benefit = await ctx(req).db.benefits.insert({ id: newId('ben'), active: true, ...benefitFields(req.body, false) });
    res.status(201).json({ success: true, benefit });
  }));

  app.patch('/api/v1/benefits/:id', can('offers:edit'), h(async (req, res) => {
    const benefit = await ctx(req).db.benefits.update(req.params.id, benefitFields(req.body, true));
    if (!benefit) throw new NotFoundError('Benefício não encontrado');
    res.json({ success: true, benefit });
  }));

  // Edit the terms of an offer that has not gone to the candidate yet; changing an approved offer sends it back to approval.
  app.patch('/api/v1/offers/:id', can('offers:edit'), h(async (req, res) => {
    const { db } = ctx(req);
    const b = req.body ?? {};
    const current = await db.offers.get(req.params.id);
    if (!current) throw new NotFoundError('Proposta não encontrada');
    if (!['draft', 'pending_approval', 'approved'].includes(current.status)) {
      throw new ValidationError('Esta proposta já foi enviada ao candidato e não pode mais ser alterada.');
    }
    const patch: Record<string, unknown> = {};
    if (has(b, 'baseSalary')) patch.baseSalary = moneyOf(b.baseSalary, 'Salário base');
    if (has(b, 'benefits')) patch.benefits = csv(b.benefits);
    if (has(b, 'startDate')) {
      if (typeof b.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.startDate)) throw new ValidationError('Data de início inválida.');
      patch.startDate = b.startDate;
    }
    if (has(b, 'contractType')) patch.contractType = oneOfList(b.contractType, ['CLT', 'PJ'], 'Tipo de contrato');
    if (has(b, 'notes')) patch.notes = String(b.notes ?? '').trim() || null;
    if (current.status === 'approved' && Object.keys(patch).some(k => k !== 'notes')) {
      patch.status = 'pending_approval';
    }
    res.json({ success: true, offer: await db.offers.update(req.params.id, patch) });
  }));

  app.patch('/api/v1/offers/:id/status',can('offers:edit'), h(async (req, res) => {
    const { status, notes } = req.body;
    const { db } = ctx(req);
    const offer = await db.setOfferStatus(req.params.id, required(status, 'status') as Parameters<typeof db.setOfferStatus>[1], notes);
    res.json({ success: true, offer });
  }));

  // ---------------------------------------------------------
  // MÓDULO 12: Onboarding
  // ---------------------------------------------------------
  app.get('/api/v1/onboardings', can('onboarding:view'), h(async (req, res) => {
    const { db } = ctx(req);
    await db.syncAcceptedOffers();
    res.json({ success: true, onboardings: await db.onboardings.list() });
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
  // MÓDULO 12.2: Checklist de Integração (modelo da organização + itens de cada contratação)
  // Permissões: onboarding:view para consultar, onboarding:edit para configurar e alterar.
  // ---------------------------------------------------------
  const CHECKLIST_CATEGORIES = ['Documentação', 'TI & Acessos', 'Cultura & Boas-Vindas', 'Treinamento Técnico'];
  const CHECKLIST_RESPONSIBLES = ['RH', 'TI', 'Gestor', 'Buddy'];
  const dueDayOf = (value: unknown): number => {
    const day = Number(value ?? 1);
    if (!Number.isInteger(day) || day < 0 || day > 365) throw new ValidationError('O prazo deve ser de 0 a 365 dias após o início.');
    return day;
  };
  const oneOfList = (value: unknown, allowed: string[], label: string): string => {
    if (typeof value !== 'string' || !allowed.includes(value)) throw new ValidationError(`${label} inválido(a).`);
    return value;
  };
  const integrationFields = (body: Record<string, unknown>, partial: boolean) => {
    const out: Record<string, unknown> = {};
    if (!partial || body.name !== undefined) out.name = required(body.name, 'name');
    if (!partial || body.category !== undefined) out.category = oneOfList(body.category, CHECKLIST_CATEGORIES, 'Categoria');
    if (!partial || body.responsible !== undefined) out.responsible = oneOfList(body.responsible ?? 'Gestor', CHECKLIST_RESPONSIBLES, 'Responsável');
    if (!partial || body.dueDay !== undefined) out.dueDay = dueDayOf(body.dueDay);
    if (!partial || body.active !== undefined) out.active = body.active === undefined ? true : Boolean(body.active);
    return out;
  };

  app.get('/api/v1/integration-templates', can('onboarding:view'), h(async (req, res) => {
    res.json({ success: true, templates: await ctx(req).db.ensureIntegrationTemplates() });
  }));

  app.post('/api/v1/integration-templates', can('onboarding:edit'), h(async (req, res) => {
    const template = await ctx(req).db.integrationTemplates.insert({ id: newId('igt'), ...integrationFields(req.body ?? {}, false) });
    res.status(201).json({ success: true, template });
  }));

  app.patch('/api/v1/integration-templates/:id', can('onboarding:edit'), h(async (req, res) => {
    const template = await ctx(req).db.integrationTemplates.update(req.params.id, integrationFields(req.body ?? {}, true));
    if (!template) throw new NotFoundError('Item do modelo não encontrado');
    res.json({ success: true, template });
  }));

  app.get('/api/v1/onboardings/:id/checklist-available', can('onboarding:view'), h(async (req, res) => {
    res.json({ success: true, templates: await ctx(req).db.listAvailableChecklistTemplates(req.params.id) });
  }));

  app.post('/api/v1/onboardings/:id/checklist-apply', can('onboarding:edit'), h(async (req, res) => {
    const ids = req.body?.templateIds;
    if (!Array.isArray(ids)) throw new ValidationError('Informe os itens do modelo a incluir (templateIds).');
    res.json({ success: true, onboarding: await ctx(req).db.applyChecklistTemplates(req.params.id, ids.map(String)) });
  }));

  // Extra item for one hire (outside the model)
  app.post('/api/v1/onboardings/:id/checklist', can('onboarding:edit'), h(async (req, res) => {
    const body = req.body ?? {};
    const onboarding = await ctx(req).db.addChecklistItem(req.params.id, {
      id: newId('chk'),
      title: required(body.title, 'title'),
      category: oneOfList(body.category ?? 'Cultura & Boas-Vindas', CHECKLIST_CATEGORIES, 'Categoria') as OnboardingChecklistItem['category'],
      dueDateDay: dueDayOf(body.dueDateDay),
      status: 'pending',
      assignedToRole: oneOfList(body.assignedToRole ?? 'Gestor', CHECKLIST_RESPONSIBLES, 'Responsável')
    });
    res.status(201).json({ success: true, onboarding });
  }));

  app.delete('/api/v1/onboardings/:id/checklist/:itemId', can('onboarding:edit'), h(async (req, res) => {
    res.json({ success: true, onboarding: await ctx(req).db.removeChecklistItem(req.params.id, req.params.itemId) });
  }));

  // ---------------------------------------------------------
  // MÓDULO 12.1: Admissão (catálogo de itens + pasta de documentos por contratação)
  // Permissões: onboarding:view para consultar/baixar, onboarding:edit para configurar, enviar e analisar.
  // ---------------------------------------------------------
  const ADMISSION_CATEGORIES = ['Documentos pessoais', 'Exames', 'Dados bancários e dependentes', 'Contratuais', 'Etapas internas'];
  const ADMISSION_RESPONSIBLES = ['RH', 'Candidato', 'DP', 'Jurídico', 'TI'];
  const oneOf = (value: unknown, allowed: string[], label: string): string => {
    if (typeof value !== 'string' || !allowed.includes(value)) throw new ValidationError(`${label} inválido(a).`);
    return value;
  };
  const admissionFields = (body: Record<string, unknown>, partial: boolean) => {
    const out: Record<string, unknown> = {};
    if (!partial || body.name !== undefined) out.name = required(body.name, 'name');
    if (!partial || body.category !== undefined) out.category = oneOf(body.category, ADMISSION_CATEGORIES, 'Categoria');
    if (!partial || body.responsible !== undefined) out.responsible = oneOf(body.responsible ?? 'RH', ADMISSION_RESPONSIBLES, 'Responsável');
    if (!partial || body.description !== undefined) out.description = String(body.description ?? '').trim();
    if (!partial || body.required !== undefined) out.required = body.required === undefined ? true : Boolean(body.required);
    if (!partial || body.requiresDocument !== undefined) out.requiresDocument = body.requiresDocument === undefined ? true : Boolean(body.requiresDocument);
    if (!partial || body.active !== undefined) out.active = body.active === undefined ? true : Boolean(body.active);
    if (!partial || body.dueDaysBeforeStart !== undefined) {
      const days = Number(body.dueDaysBeforeStart ?? 5);
      if (!Number.isInteger(days) || days < 0 || days > 90) throw new ValidationError('Prazo deve ser de 0 a 90 dias antes do início.');
      out.dueDaysBeforeStart = days;
    }
    if (!partial || body.contractTypes !== undefined) {
      const types = csv(body.contractTypes ?? ['CLT', 'PJ']);
      if (types.length === 0 || types.some(t => !['CLT', 'PJ'].includes(t))) throw new ValidationError('Informe ao menos um tipo de contrato (CLT ou PJ).');
      out.contractTypes = [...new Set(types)];
    }
    return out;
  };

  app.get('/api/v1/admission-templates', can('onboarding:view'), h(async (req, res) => {
    res.json({ success: true, templates: await ctx(req).db.ensureAdmissionTemplates() });
  }));

  app.post('/api/v1/admission-templates', can('onboarding:edit'), h(async (req, res) => {
    const template = await ctx(req).db.admissionTemplates.insert({ id: newId('adt'), ...admissionFields(req.body ?? {}, false) });
    res.status(201).json({ success: true, template });
  }));

  app.patch('/api/v1/admission-templates/:id', can('onboarding:edit'), h(async (req, res) => {
    const template = await ctx(req).db.admissionTemplates.update(req.params.id, admissionFields(req.body ?? {}, true));
    if (!template) throw new NotFoundError('Item do catálogo não encontrado');
    res.json({ success: true, template });
  }));

  // Catalog items that apply to this hire and are not in its folder yet (the RH chooses which ones to bring)
  app.get('/api/v1/onboardings/:id/admission/available', can('onboarding:view'), h(async (req, res) => {
    res.json({ success: true, templates: await ctx(req).db.listAvailableAdmissionTemplates(req.params.id) });
  }));

  app.post('/api/v1/onboardings/:id/admission/apply-template', can('onboarding:edit'), h(async (req, res) => {
    const ids = req.body?.templateIds;
    if (!Array.isArray(ids)) throw new ValidationError('Informe os itens do modelo a incluir (templateIds).');
    const onboarding = await ctx(req).db.applyAdmissionTemplates(req.params.id, ids.map(String));
    res.json({ success: true, onboarding });
  }));

  app.delete('/api/v1/onboardings/:id/admission/:itemId', can('onboarding:edit'), h(async (req, res) => {
    res.json({ success: true, onboarding: await ctx(req).db.removeAdmissionItem(req.params.id, req.params.itemId) });
  }));

  // Extra item for a specific hire (outside the catalog)
  app.post('/api/v1/onboardings/:id/admission', can('onboarding:edit'), h(async (req, res) => {
    const { db } = ctx(req);
    const body = req.body ?? {};
    const journey = await db.onboardings.get(req.params.id);
    if (!journey) throw new NotFoundError('Jornada de onboarding não encontrada');
    const dueDate = typeof body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? body.dueDate : journey.hireDate;
    const onboarding = await db.addAdmissionItem(journey.id, {
      id: newId('adi'),
      title: required(body.title, 'title'),
      category: oneOf(body.category ?? 'Etapas internas', ADMISSION_CATEGORIES, 'Categoria') as AdmissionItem['category'],
      required: body.required === undefined ? true : Boolean(body.required),
      requiresDocument: body.requiresDocument === undefined ? true : Boolean(body.requiresDocument),
      responsible: oneOf(body.responsible ?? 'RH', ADMISSION_RESPONSIBLES, 'Responsável') as AdmissionItem['responsible'],
      dueDate,
      status: 'pending',
      history: [{ at: new Date().toISOString(), by: req.auth!.name, action: 'Item incluído manualmente' }]
    });
    res.status(201).json({ success: true, onboarding });
  }));

  // Review: approve / reject (with reason) / reopen
  app.patch('/api/v1/onboardings/:id/admission/:itemId', can('onboarding:edit'), h(async (req, res) => {
    const { action, note } = req.body ?? {};
    const valid = oneOf(action, ['approve', 'reject', 'reopen'], 'Ação') as AdmissionAction;
    const onboarding = await ctx(req).db.updateAdmissionItem(req.params.id, req.params.itemId, item =>
      reviewItem(item, valid, typeof note === 'string' ? note : undefined, req.auth!.name)
    );
    res.json({ success: true, onboarding });
  }));

  // Upload: raw body (PDF/JPG/PNG up to 8 MB), file name in ?name=
  app.post(
    '/api/v1/onboardings/:id/admission/:itemId/file',
    can('onboarding:edit'),
    express.raw({ type: () => true, limit: '9mb' }),
    h(async (req, res) => {
      const { db, tenant } = ctx(req);
      const mime = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      const content = assertValidFile(req.body, mime);
      const journey = await db.onboardings.get(req.params.id);
      const current = journey?.admission.find(i => i.id === req.params.itemId);
      if (!journey || !current) throw new NotFoundError('Item de admissão não encontrado');
      if (!current.requiresDocument) throw new ValidationError('Este item é uma etapa e não recebe arquivo.');

      const name = safeFileName(String(req.query.name ?? 'documento'));
      const storagePath = `${tenant.id}/${journey.id}/${current.id}/${newId('f')}-${name}`;
      await putFile(storagePath, content, mime);

      let previousPath: string | undefined;
      try {
        const onboarding = await db.updateAdmissionItem(journey.id, current.id, item => {
          previousPath = item.file?.path;
          const at = new Date().toISOString();
          item.file = { name, mime, size: content.length, path: storagePath, uploadedAt: at, uploadedBy: req.auth!.name };
          item.status = 'submitted';
          item.reviewNote = undefined;
          item.history.push({ at, by: req.auth!.name, action: `Documento enviado: ${name}` });
        });
        if (previousPath) void removeFile(previousPath);
        res.status(201).json({ success: true, onboarding });
      } catch (err) {
        void removeFile(storagePath);
        throw err;
      }
    })
  );

  // Download through the API (permission + tenant checked); the storage is never exposed by URL
  app.get('/api/v1/onboardings/:id/admission/:itemId/file', can('onboarding:view'), h(async (req, res) => {
    const { db, tenant } = ctx(req);
    const journey = await db.onboardings.get(req.params.id);
    const file = journey?.admission.find(i => i.id === req.params.itemId)?.file;
    if (!journey || !file || !file.path.startsWith(`${tenant.id}/${journey.id}/`)) throw new NotFoundError('Documento não encontrado');
    const content = await getFile(file.path);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(content);
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
    console.warn(`[api] rota inexistente: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ success: false, error: ROUTE_NOT_FOUND_MESSAGE, code: 'ROUTE_NOT_FOUND' });
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
