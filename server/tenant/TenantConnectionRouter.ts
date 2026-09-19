import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import {
  Tenant,
  SystemAuditLog,
  TenantConnectionTelemetry,
  TenantRoutingResolution,
  DatabaseConfig
} from '../../src/types.js';
import { fromRow } from '../db/crud.js';
import { getPool, Queryable, withTransaction } from '../db/pool.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { TenantRepository } from './TenantRepository.js';
import { seedTenantData } from './seedTenant.js';
import { logAudit, AuditEntry } from '../audit.js';
import { AuthService, AuthenticatedSession } from '../auth/AuthService.js';
import { AccessService } from '../auth/AccessService.js';
import { ADMIN_PROFILE_ID, PLAN_ROUTINES, normalizeRoutines } from '../../src/access.js';
import { TtlCache, sessionCache } from '../cache.js';
import { invalidateStorageCache, withDbConfig } from './dbConfig.js';

export interface TenantConnectionContext {
  tenant: Tenant;
  db: TenantRepository;
  telemetry: TenantConnectionTelemetry;
  resolution: TenantRoutingResolution;
}

const PLANS: Tenant['plan'][] = ['Starter', 'Scale', 'Enterprise'];
const STATUSES: Tenant['status'][] = ['active', 'suspended', 'provisioning', 'maintenance'];

/** Who performed an action (recorded in the audit trail). */
export interface Actor {
  id: string;
  name: string;
  ip: string;
}

export const actorOf = (session: AuthenticatedSession, ip?: string): Actor => ({
  id: session.id,
  name: session.name,
  ip: ip || '127.0.0.1'
});

/** Real per-tenant request telemetry (sliding 60s window), kept in-process. */
class TelemetryTracker {
  private hits: number[] = [];
  private lastLatencyMs = 0;
  private lastAccess = new Date();

  record(latencyMs: number) {
    const now = Date.now();
    this.hits.push(now);
    this.hits = this.hits.filter(t => now - t < 60_000);
    this.lastLatencyMs = latencyMs;
    this.lastAccess = new Date(now);
  }

  get latency() { return this.lastLatencyMs; }

  snapshot(tenant: Tenant): TenantConnectionTelemetry {
    const now = Date.now();
    const pool = getPool();
    return {
      tenantId: tenant.id,
      dbName: tenant.dbConfig.dbName,
      activeConnections: Math.max(0, pool.totalCount - pool.idleCount),
      idleConnections: pool.idleCount,
      latencyMs: this.lastLatencyMs,
      queriesPerMinute: this.hits.filter(t => now - t < 60_000).length,
      lastConnectedAt: this.lastAccess.toISOString(),
      status: this.lastLatencyMs > 1000 ? 'degraded' : 'healthy',
      isolationVerified: true
    };
  }
}

/**
 * TenantConnectionRouter
 * 1. Organization users pinned to the active organization of their session
 * 2. Tenant-scoped data access (TenantRepository) over the shared Supabase Postgres
 * 3. SuperAdmin "Conta Mãe" (no access to organization data): tenant catalog, provisioning, status, audit and telemetry
 */
export class TenantConnectionRouter {
  private static instance: TenantConnectionRouter;
  private trackers: Map<string, TelemetryTracker> = new Map();

  public static getInstance(): TenantConnectionRouter {
    if (!TenantConnectionRouter.instance) {
      TenantConnectionRouter.instance = new TenantConnectionRouter();
    }
    return TenantConnectionRouter.instance;
  }

  private tracker(tenantId: string): TelemetryTracker {
    let t = this.trackers.get(tenantId);
    if (!t) {
      t = new TelemetryTracker();
      this.trackers.set(tenantId, t);
    }
    return t;
  }

  // -------------------------------------------------------------------
  // Master catalog reads
  // -------------------------------------------------------------------
  private async hydrate(rows: Record<string, unknown>[], measure: 'none' | 'page' | 'all' = 'page'): Promise<Tenant[]> {
    return withDbConfig(rows.map(r => fromRow<Omit<Tenant, 'dbConfig'>>({}, r)), measure);
  }

  /** Request hot path: a tenant row per request would be a query per request, so it is cached for a few seconds. */
  private tenantCache = new TtlCache<Tenant>(5_000, 2_000);
  private slugCache = new TtlCache<Tenant>(5_000, 2_000);

  /** Call after any write to the tenants table. */
  public invalidateTenant(): void {
    this.tenantCache.clear();
    this.slugCache.clear();
    sessionCache.clear();
  }

  /** Every organization with platform-wide storage totals (telemetry only; use getTenantsPage for lists). */
  public async getAllTenants(db: Queryable = getPool()): Promise<Tenant[]> {
    const { rows } = await db.query('select * from public.tenants order by created_at asc, id asc');
    return this.hydrate(rows, 'all');
  }

  /** Searchable, paginated catalog for the Conta Mãe; storage is measured only for the returned page. */
  public async getTenantsPage(opts: { search?: string; page?: number; pageSize?: number }): Promise<{
    tenants: Tenant[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const pageSize = Math.min(Math.max(Math.trunc(opts.pageSize || 25), 1), 100);
    const page = Math.max(Math.trunc(opts.page || 1), 1);
    const term = (opts.search ?? '').trim().toLowerCase().replace(/[\\%_]/g, m => '\\' + m);
    const { rows } = await getPool().query(
      `select *, count(*) over ()::int as total_rows
         from public.tenants
        where $1 = '' or lower(name) like '%' || $1 || '%' or slug like '%' || $1 || '%'
              or lower(contact_email) like '%' || $1 || '%'
        order by created_at asc, id asc
        limit $2 offset $3`,
      [term, pageSize, (page - 1) * pageSize]
    );
    const total = rows[0]?.total_rows ?? 0;
    return { tenants: await this.hydrate(rows.map(({ total_rows: _t, ...r }) => r)), total, page, pageSize };
  }

  public async getTenantById(id: string, db?: Queryable): Promise<Tenant | undefined> {
    if (!db) {
      const hit = this.tenantCache.get(id);
      if (hit) return hit;
    }
    const { rows } = await (db ?? getPool()).query('select * from public.tenants where id = $1', [id]);
    const tenant = (await this.hydrate(rows, 'none'))[0];
    if (tenant && !db) this.tenantCache.set(id, tenant);
    return tenant;
  }

  public async getTenantBySlug(slug: string, db?: Queryable): Promise<Tenant | undefined> {
    const key = slug.toLowerCase();
    if (!db) {
      const hit = this.slugCache.get(key);
      if (hit) return hit;
    }
    const { rows } = await (db ?? getPool()).query('select * from public.tenants where slug = $1', [key]);
    const tenant = (await this.hydrate(rows, 'none'))[0];
    if (tenant && !db) this.slugCache.set(key, tenant);
    return tenant;
  }

  /** Full facts (storage measured for this one organization) for the Conta Mãe screens. */
  public async getTenantDetail(id: string): Promise<Tenant | undefined> {
    const { rows } = await getPool().query('select * from public.tenants where id = $1', [id]);
    return (await this.hydrate(rows))[0];
  }

  /**
   * Resolves the tenant and returns a repository hard-scoped to it.
   * Organization users are PINNED to the active organization of their session (headers are ignored).
   * The SuperAdmin (Conta Mãe) has no route into organization data at all: it only reaches /api/master/*.
   */
  public async routeConnection(req: Request, principal: AuthenticatedSession): Promise<TenantConnectionContext> {
    const startTime = Date.now();

    if (principal.type !== 'tenant_user') {
      throw new ForbiddenError('A Conta Mãe não acessa dados de organizações. Use o ambiente da plataforma.');
    }
    const tenant = await this.getTenantById(principal.tenantId!);
    if (!tenant) throw new NotFoundError('Organização da sessão não encontrada.');
    const resolved = { strategy: 'TOKEN_SESSION' as const, sourceValue: `session: ${principal.email}` };

    if (tenant.status === 'suspended') {
      throw new ForbiddenError(`Tenant '${tenant.name}' is currently suspended. Access denied.`);
    }

    const latencyMs = Date.now() - startTime; // real round-trip to the tenant catalog
    const tracker = this.tracker(tenant.id);
    tracker.record(latencyMs);

    return {
      tenant,
      db: new TenantRepository(tenant.id),
      telemetry: tracker.snapshot(tenant),
      resolution: {
        strategy: resolved.strategy,
        sourceValue: resolved.sourceValue,
        resolvedTenantId: tenant.id,
        targetDatabase: tenant.dbConfig.dbName,
        timestamp: new Date().toISOString(),
        latencyMs
      }
    };
  }

  /** Public (unauthenticated) lookup: only active organizations are visible. */
  public async getPublicTenant(slug: string): Promise<Tenant | undefined> {
    const tenant = await this.getTenantBySlug(slug);
    return tenant && tenant.status === 'active' ? tenant : undefined;
  }

  // -------------------------------------------------------------------
  // SuperAdmin / Conta Mãe - tenant provisioning
  // -------------------------------------------------------------------
  public async provisionNewOrganization(
    params: {
      name: string;
      tradingName: string;
      slug: string;
      document: string;
      contactEmail: string;
      plan: Tenant['plan'];
      adminUserName: string;
      adminUserEmail: string;
      /** Defaults to the plan's routines. */
      enabledRoutines?: string[];
    },
    actor: Actor
  ): Promise<{
    tenant: Tenant;
    databaseConfig: DatabaseConfig;
    /** `tempPassword` is empty when the e-mail already had an account (it was linked, password unchanged). */
    adminCredentials: { email: string; tempPassword: string; linkedExisting: boolean };
  }> {
    const normalizedSlug = params.slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!normalizedSlug) throw new ValidationError('Identificador (slug) inválido.');

    const plan = params.plan;
    if (!PLANS.includes(plan)) throw new ValidationError(`Plano inválido. Use: ${PLANS.join(', ')}.`);
    const adminEmail = params.adminUserEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(adminEmail)) throw new ValidationError('E-mail do administrador inválido.');

    const tenantId = `tenant-${normalizedSlug}-${randomUUID().slice(0, 6)}`;
    const now = new Date().toISOString();
    const routines = params.enabledRoutines ? normalizeRoutines(params.enabledRoutines) : { routines: PLAN_ROUTINES[plan], invalid: [] };
    if (routines.invalid.length) throw new ValidationError(`Módulos desconhecidos: ${routines.invalid.join(', ')}`);
    const enabledRoutines = routines.routines;
    const features = featuresFor(enabledRoutines);
    const adminId = `usr-${tenantId}-admin`;

    let tempPassword = '';
    let linkedExistingAdmin = false;
    try {
      await withTransaction(async tx => {
        await tx.query(
          `insert into public.tenants
             (id, slug, name, trading_name, document, contact_email, status, plan, created_at, features, enabled_routines)
           values ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10)`,
          [
            tenantId, normalizedSlug, params.name, params.tradingName, params.document, params.contactEmail,
            plan, now, JSON.stringify(features), enabledRoutines
          ]
        );

        await seedTenantData(tx, tenantId, {
          dna: {
            tenantId,
            mission: `Promover o crescimento da ${params.tradingName} através de talentos de alto nível.`,
            vision: 'Construir uma equipe de alta performance e clima colaborativo.',
            archetype: 'Inovador & Ágil',
            cultureSummary: `Pilares culturais fundadores da ${params.tradingName}.`,
            coreValues: ['Integridade', 'Foco no Cliente', 'Inovação', 'Espírito de Equipe'],
            pillars: [
              {
                id: 'p1',
                name: 'Compromisso com o Resultado',
                description: 'Capacidade de cumprir acordos com excelência e qualidade.',
                weight: 5,
                expectedBehaviors: ['Entrega no prazo', 'Assume protagonismo'],
                undesiredBehaviors: ['Desculpa-se sem agir']
              },
              {
                id: 'p2',
                name: 'Trabalho em Equipe',
                description: 'Colaboração transparente e respeito às diferenças.',
                weight: 4,
                expectedBehaviors: ['Comunica-se com empatia', 'Ajuda os colegas'],
                undesiredBehaviors: ['Postura individualista']
              }
            ],
            culturalFitThreshold: 75,
            updatedAt: now
          },
          // A new organization starts with no history: real zeros, not invented benchmarks.
          indicators: {
            tenantId,
            period: currentPeriod(),
            timeToHireDays: 0,
            costPerHire: 0,
            earlyTurnover90DaysRate: 0,
            averageCulturalFit: 0,
            openPositionsCount: 0,
            totalHiresThisQuarter: 0,
            retentionRate12Months: 0,
            candidateNPS: 0,
            recruitmentFunnel: { applied: 0, screened: 0, interviewed: 0, offered: 0, hired: 0 }
          }
        });

        // First administrator: links an existing person (keeps their password) or creates a new identity
        const admin = await AccessService.addMember(tx, tenantId, {
          id: adminId,
          name: params.adminUserName,
          email: adminEmail,
          profileId: ADMIN_PROFILE_ID,
          jobTitle: 'Administrador da Organização'
        });
        linkedExistingAdmin = !admin.identityCreated;
        if (admin.identityCreated) {
          tempPassword = await AuthService.getInstance().issueTempPassword(admin.identityId, tx);
        }

        await logAudit(
          {
            tenantId,
            userId: actor.id,
            userName: actor.name,
            action: 'ORGANIZATION_CREATED',
            category: 'DB_PROVISIONING',
            details: `Organização '${params.name}' (${normalizedSlug}) criada com administrador ${adminEmail}`,
            ipAddress: actor.ip,
            databaseAffected: `tenant:${normalizedSlug}`
          },
          tx
        );
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        const c = (err as { constraint?: string }).constraint ?? '';
        if (c.includes('slug')) {
          throw new ConflictError(`O identificador (slug) '${normalizedSlug}' já está em uso por outra organização.`);
        }
      }
      throw err;
    }

    invalidateStorageCache();
    this.invalidateTenant();
    const tenant = (await this.getTenantDetail(tenantId))!;
    return {
      tenant,
      databaseConfig: tenant.dbConfig,
      adminCredentials: { email: adminEmail, tempPassword, linkedExisting: linkedExistingAdmin }
    };
  }

  public async updateOrganizationStatus(tenantId: string, status: Tenant['status'], actor: Actor): Promise<Tenant> {
    if (!STATUSES.includes(status)) throw new ValidationError(`Status inválido. Use: ${STATUSES.join(', ')}.`);
    await withTransaction(async tx => {
      const { rows } = await tx.query('update public.tenants set status = $2 where id = $1 returning name, slug', [tenantId, status]);
      if (!rows[0]) throw new NotFoundError('Organização não encontrada');
      await logAudit(
        {
          tenantId,
          userId: actor.id,
          userName: actor.name,
          action: 'TENANT_STATUS_UPDATED',
          category: 'ACCESS_CONTROL',
          details: `Status da organização '${rows[0].name}' alterado para '${status}'`,
          ipAddress: actor.ip,
          databaseAffected: `tenant:${rows[0].slug}`
        },
        tx
      );
    });
    this.invalidateTenant();
    return (await this.getTenantDetail(tenantId))!;
  }

  /** Edits registration data, plan and the modules (routines) the organization may use. */
  public async updateOrganization(
    tenantId: string,
    patch: {
      name?: unknown;
      tradingName?: unknown;
      document?: unknown;
      contactEmail?: unknown;
      logoUrl?: unknown;
      plan?: unknown;
      enabledRoutines?: unknown;
    },
    actor: Actor
  ): Promise<Tenant> {
    const str = (v: unknown, label: string, current: string) => {
      if (v === undefined) return current;
      if (typeof v !== 'string' || !v.trim()) throw new ValidationError(`Campo inválido: ${label}`);
      return v.trim();
    };
    await withTransaction(async tx => {
      const { rows } = await tx.query('select * from public.tenants where id = $1 for update', [tenantId]);
      const cur = rows[0];
      if (!cur) throw new NotFoundError('Organização não encontrada');

      const name = str(patch.name, 'name', cur.name);
      const tradingName = str(patch.tradingName, 'tradingName', cur.trading_name);
      const document = str(patch.document, 'document', cur.document);
      const contactEmail = str(patch.contactEmail, 'contactEmail', cur.contact_email);
      if (!EMAIL_RE.test(contactEmail)) throw new ValidationError('E-mail de contato inválido.');
      const plan = patch.plan === undefined ? (cur.plan as Tenant['plan']) : (patch.plan as Tenant['plan']);
      if (!PLANS.includes(plan)) throw new ValidationError(`Plano inválido. Use: ${PLANS.join(', ')}.`);
      const logoUrl = patch.logoUrl === undefined ? cur.logo_url : (typeof patch.logoUrl === 'string' && patch.logoUrl.trim() ? patch.logoUrl.trim() : null);
      if (logoUrl && !/^https?:\/\//i.test(logoUrl)) throw new ValidationError('A URL do logo deve começar com http:// ou https://');

      let routines: string[] = cur.enabled_routines;
      if (patch.enabledRoutines !== undefined) {
        const n = normalizeRoutines(patch.enabledRoutines);
        if (n.invalid.length) throw new ValidationError(`Módulos desconhecidos: ${n.invalid.join(', ')}`);
        routines = n.routines;
      }

      await tx.query(
        `update public.tenants
            set name = $2, trading_name = $3, document = $4, contact_email = $5, logo_url = $6, plan = $7,
                enabled_routines = $8, features = $9
          where id = $1`,
        [tenantId, name, tradingName, document, contactEmail, logoUrl, plan, routines, JSON.stringify(featuresFor(routines))]
      );

      const changes: string[] = [];
      if (cur.name !== name) changes.push('nome');
      if (cur.trading_name !== tradingName) changes.push('nome fantasia');
      if (cur.document !== document) changes.push('documento');
      if (cur.contact_email !== contactEmail) changes.push('e-mail de contato');
      if ((cur.logo_url ?? null) !== (logoUrl ?? null)) changes.push('logo');
      if (cur.plan !== plan) changes.push(`plano ${cur.plan} → ${plan}`);
      const before = new Set<string>(cur.enabled_routines);
      const added = routines.filter(k => !before.has(k));
      const removed = [...before].filter(k => !routines.includes(k));
      if (added.length) changes.push(`módulos liberados: ${added.join(', ')}`);
      if (removed.length) changes.push(`módulos bloqueados: ${removed.join(', ')}`);

      await logAudit(
        {
          tenantId,
          userId: actor.id,
          userName: actor.name,
          action: 'TENANT_UPDATED',
          category: 'ACCESS_CONTROL',
          details: `Organização '${cur.name}' atualizada${changes.length ? `: ${changes.join('; ')}` : ' (sem alterações)'}`,
          ipAddress: actor.ip,
          databaseAffected: `tenant:${cur.slug}`
        },
        tx
      );
    });
    invalidateStorageCache();
    this.invalidateTenant();
    return (await this.getTenantDetail(tenantId))!;
  }

  /** SuperAdmin support action: new temporary password for an organization user (default: first ORG_ADMIN). */
  public async resetOrganizationUserPassword(
    tenantId: string,
    userId: string | undefined,
    actor: Actor
  ): Promise<{ user: { id: string; name: string; email: string }; tempPassword: string }> {
    return withTransaction(async tx => {
      const tenant = await this.getTenantById(tenantId, tx);
      if (!tenant) throw new NotFoundError('Organização não encontrada');
      const { rows } = await tx.query(
        `select tu.id, tu.name, tu.email, tu.user_id
           from public.tenant_users tu
           join public.access_profiles ap on ap.tenant_id = tu.tenant_id and ap.id = tu.profile_id
          where tu.tenant_id = $1 and ($2::text is null or tu.id = $2) and ($2::text is not null or (ap.is_admin and tu.active))
          order by tu.seq limit 1`,
        [tenantId, userId ?? null]
      );
      const member = rows[0];
      if (!member) throw new NotFoundError('Usuário administrador não encontrado nesta organização.');
      const user = { id: member.id as string, name: member.name as string, email: member.email as string };
      const tempPassword = await AuthService.getInstance().issueTempPassword(member.user_id, tx);
      await logAudit(
        {
          tenantId,
          userId: actor.id,
          userName: actor.name,
          action: 'PASSWORD_RESET_ISSUED',
          category: 'ACCESS_CONTROL',
          details: `Senha temporária emitida para ${user.email} (${tenant.name})`,
          ipAddress: actor.ip,
          databaseAffected: `tenant:${tenant.slug}`
        },
        tx
      );
      return { user, tempPassword };
    });
  }

  // -------------------------------------------------------------------
  // Audit & telemetry
  // -------------------------------------------------------------------
  /**
   * Audit trail, newest first, filtered and paginated in the database (keyset on timestamp + id, so deep pages
   * stay cheap). `nextCursor` is passed back as `before` to load the next page.
   */
  public async getMasterAuditLogs(opts: {
    limit?: number;
    before?: string;
    category?: string;
    q?: string;
    tenantId?: string;
  } = {}): Promise<{ logs: SystemAuditLog[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(Math.trunc(opts.limit || 50), 1), 200);
    const where: string[] = [];
    const args: unknown[] = [];
    const add = (sql: string, value: unknown) => { args.push(value); where.push(sql.replace('?', `$${args.length}`)); };

    if (opts.category) add('category = ?', opts.category);
    if (opts.tenantId) add('tenant_id = ?', opts.tenantId);
    if (opts.q?.trim()) {
      const term = '%' + opts.q.trim().toLowerCase().replace(/[\\%_]/g, m => '\\' + m) + '%';
      add('(lower(action) like ? or lower(user_name) like ? or lower(details) like ?)', term);
      where[where.length - 1] = where[where.length - 1].replace(/\?/g, `$${args.length}`);
    }
    if (opts.before) {
      const [ts, id] = opts.before.split('|');
      if (!ts || !id || Number.isNaN(Date.parse(ts))) throw new ValidationError('Cursor de paginação inválido.');
      args.push(ts, id);
      where.push(`(timestamp, id) < ($${args.length - 1}::timestamptz, $${args.length})`);
    }
    args.push(limit + 1);
    const { rows } = await getPool().query(
      `select * from public.platform_audit_logs ${where.length ? 'where ' + where.join(' and ') : ''}
        order by timestamp desc, id desc limit $${args.length}`,
      args
    );
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      logs: page.map(r => ({ ...fromRow<SystemAuditLog>({ exposeTenantId: true }, r), tenantId: (r.tenant_id as string | null) ?? '' })),
      nextCursor: rows.length > limit && last ? `${new Date(last.timestamp).toISOString()}|${last.id}` : null
    };
  }

  public async logMasterAudit(entry: AuditEntry, db: Queryable = getPool()): Promise<void> {
    await logAudit(entry, db);
  }

  public async getGlobalTelemetry() {
    const tenants = await this.getAllTenants();
    let totalStorageUsedMb = 0;
    let totalStorageMaxMb = 0;
    let totalQueriesPerMinute = 0;
    const latencies: number[] = [];

    const tenantBreakdowns = tenants.map(t => {
      const telemetry = this.tracker(t.id).snapshot(t);

      totalStorageUsedMb += t.dbConfig.storageUsedMb;
      totalStorageMaxMb += t.dbConfig.maxStorageMb;
      totalQueriesPerMinute += telemetry.queriesPerMinute;
      if (telemetry.queriesPerMinute > 0) latencies.push(telemetry.latencyMs);

      return {
        tenantId: t.id,
        tenantName: t.name,
        slug: t.slug,
        status: t.status,
        dbName: t.dbConfig.dbName,
        engineType: t.dbConfig.engineType,
        region: t.dbConfig.region,
        telemetry
      };
    });

    const pool = getPool();
    return {
      totalTenants: tenants.length,
      activeTenants: tenants.filter(t => t.status === 'active').length,
      totalStorageUsedMb: Number(totalStorageUsedMb.toFixed(2)),
      totalStorageMaxMb,
      totalActiveConnections: Math.max(0, pool.totalCount - pool.idleCount),
      totalQueriesPerMinute,
      // Kept for API compatibility: every organization is isolated by the same logical engine
      activeIsolationEngines: tenants.length,
      averageLatencyMs: latencies.length
        ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1))
        : 0,
      // bounded: the busiest organizations first (the full list lives in the paginated catalog)
      tenantBreakdowns: tenantBreakdowns
        .sort((x, y) => y.telemetry.queriesPerMinute - x.telemetry.queriesPerMinute || x.tenantName.localeCompare(y.tenantName))
        .slice(0, 50)
    };
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Feature flags mirror the enabled routines (kept for compatibility with the tenant record). */
function featuresFor(routines: readonly string[]): Tenant['features'] {
  return {
    aiEvaluationEnabled: routines.includes('ai_evaluation'),
    onboardingChecklistEnabled: routines.includes('onboarding'),
    retentionPredictorEnabled: routines.includes('retention'),
    advancedIndicatorsEnabled: routines.includes('indicators')
  };
}

/** e.g. '2026-Q3' */
function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}
