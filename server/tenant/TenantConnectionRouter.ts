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
 * 1. Dynamic tenant identification (header, query, subdomain)
 * 2. Tenant-scoped data access (TenantRepository) over the shared Supabase Postgres
 * 3. SuperAdmin "Conta Mãe": tenant catalog, provisioning, status, audit and telemetry
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
  private async hydrate(rows: Record<string, unknown>[]): Promise<Tenant[]> {
    return withDbConfig(rows.map(r => fromRow<Omit<Tenant, 'dbConfig'>>({}, r)));
  }

  public async getAllTenants(db: Queryable = getPool()): Promise<Tenant[]> {
    const { rows } = await db.query('select * from public.tenants order by created_at asc, id asc');
    return this.hydrate(rows);
  }

  public async getTenantById(id: string, db: Queryable = getPool()): Promise<Tenant | undefined> {
    const { rows } = await db.query('select * from public.tenants where id = $1', [id]);
    return (await this.hydrate(rows))[0];
  }

  public async getTenantBySlug(slug: string, db: Queryable = getPool()): Promise<Tenant | undefined> {
    const { rows } = await db.query('select * from public.tenants where slug = $1', [slug.toLowerCase()]);
    return (await this.hydrate(rows))[0];
  }

  /**
   * Dynamic Tenant Identification Strategy:
   * 1. HTTP header 'x-tenant-id' or 'x-tenant-slug'
   * 2. Query parameter '?tenant=slug' / '?tenantId=id'
   * 3. Host subdomain (e.g. techcorp.talentcloud.app)
   * 4. Only when NO identifier was supplied at all: first active tenant (preview convenience)
   *
   * An identifier that was supplied but does not match any organization is rejected:
   * silently serving another tenant's data would defeat isolation.
   */
  public async resolveTenantFromRequest(req: Request): Promise<{
    strategy: TenantRoutingResolution['strategy'];
    sourceValue: string;
    tenant: Tenant;
  }> {
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined;
    if (headerTenantId) {
      const tenant = await this.getTenantById(headerTenantId);
      if (!tenant) throw new NotFoundError(`Organização '${headerTenantId}' não encontrada.`);
      return { strategy: 'HEADER_INJECTION', sourceValue: `x-tenant-id: ${headerTenantId}`, tenant };
    }

    const headerTenantSlug = req.headers['x-tenant-slug'] as string | undefined;
    if (headerTenantSlug) {
      const tenant = await this.getTenantBySlug(headerTenantSlug);
      if (!tenant) throw new NotFoundError(`Organização '${headerTenantSlug}' não encontrada.`);
      return { strategy: 'HEADER_INJECTION', sourceValue: `x-tenant-slug: ${headerTenantSlug}`, tenant };
    }

    const queryTenant = (req.query.tenant as string) || (req.query.tenantId as string);
    if (queryTenant) {
      const tenant = (await this.getTenantById(queryTenant)) || (await this.getTenantBySlug(queryTenant));
      if (!tenant) throw new NotFoundError(`Organização '${queryTenant}' não encontrada.`);
      return { strategy: 'TOKEN_SESSION', sourceValue: `query: ${queryTenant}`, tenant };
    }

    const hostParts = (req.headers.host || '').split(':')[0].split('.');
    if (hostParts.length > 2 && hostParts[0] !== 'www') {
      const subdomain = hostParts[0].toLowerCase();
      const tenant = await this.getTenantBySlug(subdomain);
      if (tenant) {
        return { strategy: 'SUBDOMAIN_DYNAMIC', sourceValue: `subdomain: ${subdomain}`, tenant };
      }
    }

    const { rows } = await getPool().query(
      `select * from public.tenants where status = 'active' order by created_at asc, id asc limit 1`
    );
    if (!rows[0]) {
      throw new NotFoundError('Nenhuma organização ativa. Crie uma organização pelo painel SuperAdmin.');
    }
    return {
      strategy: 'SUPERADMIN_IMPERSONATION',
      sourceValue: 'system_default_route',
      tenant: (await this.hydrate(rows))[0]
    };
  }

  /**
   * Resolves the tenant and returns a repository hard-scoped to it.
   * - Organization users are PINNED to the organization of their session (headers are ignored).
   * - SuperAdmin picks the organization via header/query (support & impersonation).
   */
  public async routeConnection(req: Request, principal: AuthenticatedSession): Promise<TenantConnectionContext> {
    const startTime = Date.now();

    let resolved: { strategy: TenantRoutingResolution['strategy']; sourceValue: string; tenant: Tenant };
    if (principal.type === 'tenant_user') {
      const own = await this.getTenantById(principal.tenantId!);
      if (!own) throw new NotFoundError('Organização da sessão não encontrada.');
      resolved = { strategy: 'TOKEN_SESSION', sourceValue: `session: ${principal.email}`, tenant: own };
    } else {
      resolved = await this.resolveTenantFromRequest(req);
    }
    const tenant = resolved.tenant;

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
    },
    actor: Actor
  ): Promise<{ tenant: Tenant; databaseConfig: DatabaseConfig; adminCredentials: { email: string; tempPassword: string } }> {
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
    const features: Tenant['features'] = {
      aiEvaluationEnabled: true,
      onboardingChecklistEnabled: true,
      retentionPredictorEnabled: plan !== 'Starter',
      advancedIndicatorsEnabled: true
    };
    const adminId = `usr-${tenantId}-admin`;

    let tempPassword = '';
    try {
      await withTransaction(async tx => {
        await tx.query(
          `insert into public.tenants
             (id, slug, name, trading_name, document, contact_email, status, plan, created_at, features)
           values ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9)`,
          [
            tenantId, normalizedSlug, params.name, params.tradingName, params.document, params.contactEmail,
            plan, now, JSON.stringify(features)
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
          users: [
            {
              id: adminId,
              name: params.adminUserName,
              email: adminEmail,
              role: 'ORG_ADMIN',
              jobTitle: 'Administrador da Organização',
              active: true,
              lastLoginAt: now,
              permissions: ['ALL_ORG_PERMISSIONS']
            }
          ],
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

        tempPassword = await AuthService.getInstance().issueTempPassword(tenantId, adminId, tx);

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
    const tenant = (await this.getTenantById(tenantId))!;
    return { tenant, databaseConfig: tenant.dbConfig, adminCredentials: { email: adminEmail, tempPassword } };
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
    return (await this.getTenantById(tenantId))!;
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
      const { rows } = userId
        ? await tx.query('select id, name, email from public.tenant_users where tenant_id = $1 and id = $2', [tenantId, userId])
        : await tx.query(
            `select id, name, email from public.tenant_users where tenant_id = $1 and role = 'ORG_ADMIN' and active order by seq limit 1`,
            [tenantId]
          );
      const user = rows[0];
      if (!user) throw new NotFoundError('Usuário administrador não encontrado nesta organização.');
      const tempPassword = await AuthService.getInstance().issueTempPassword(tenantId, user.id, tx);
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
  public async getMasterAuditLogs(limit = 500): Promise<SystemAuditLog[]> {
    const { rows } = await getPool().query(
      'select * from public.platform_audit_logs order by timestamp desc, id desc limit $1',
      [limit]
    );
    return rows.map(r => ({ ...fromRow<SystemAuditLog>({ exposeTenantId: true }, r), tenantId: (r.tenant_id as string | null) ?? '' }));
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
      tenantBreakdowns
    };
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** e.g. '2026-Q3' */
function currentPeriod(d = new Date()): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}
