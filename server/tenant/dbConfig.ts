import type { DatabaseConfig, Tenant } from '../../src/types.js';
import { TtlCache } from '../cache.js';
import { getPool } from '../db/pool.js';
import { TABLES } from '../db/tables.js';

/** Storage quota per plan (informational: shown in the console, not enforced). */
const QUOTA_MB: Record<Tenant['plan'], number> = { Starter: 1024, Scale: 2048, Enterprise: 4096 };

const CACHE_TTL_MS = 60_000;
const TENANT_TABLES = [...Object.values(TABLES).map(t => t.table), 'organizational_dna', 'tenant_indicators'];

const perTenantStorage = new TtlCache<number>(CACHE_TTL_MS, 20_000);
let allStorageCache: { at: number; mb: Map<string, number> } | null = null;
let schemaCache: { at: number; version: string } | null = null;

const sizeUnion = (where: string) =>
  TENANT_TABLES.map(t => `select tenant_id, pg_column_size(x.*) as bytes from public."${t}" x ${where}`).join(' union all ');

/**
 * Estimated size (pg_column_size) of ONLY the given tenants' rows. Every table is filtered by tenant_id
 * (leading column of the primary keys), so the cost follows the page size, not the number of tenants.
 */
async function storageFor(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const missing: string[] = [];
  for (const id of ids) {
    const hit = perTenantStorage.get(id);
    if (hit === undefined) missing.push(id);
    else out.set(id, hit);
  }
  if (missing.length) {
    const { rows } = await getPool().query(
      `select tenant_id, sum(bytes)::float8 as bytes from (${sizeUnion('where tenant_id = any($1)')}) s group by tenant_id`,
      [missing]
    );
    const found = new Map<string, number>(rows.map(r => [r.tenant_id as string, Number(r.bytes) / (1024 * 1024)]));
    for (const id of missing) {
      const mb = found.get(id) ?? 0;
      perTenantStorage.set(id, mb);
      out.set(id, mb);
    }
  }
  return out;
}

/** Platform-wide totals (overview only, never on a request hot path): full scan, cached for 60s. */
export async function storageByTenant(): Promise<Map<string, number>> {
  if (allStorageCache && Date.now() - allStorageCache.at < CACHE_TTL_MS) return allStorageCache.mb;
  const { rows } = await getPool().query(
    `select tenant_id, sum(bytes)::float8 as bytes from (${sizeUnion('')}) s group by tenant_id`
  );
  const mb = new Map<string, number>(rows.map(r => [r.tenant_id as string, Number(r.bytes) / (1024 * 1024)]));
  allStorageCache = { at: Date.now(), mb };
  return mb;
}

async function schemaVersion(): Promise<string> {
  if (schemaCache && Date.now() - schemaCache.at < CACHE_TTL_MS) return schemaCache.version;
  const { rows } = await getPool().query('select name from public.schema_migrations order by name desc limit 1');
  const version = rows[0] ? String(rows[0].name).replace(/\.sql$/, '') : 'n/a';
  schemaCache = { at: Date.now(), version };
  return version;
}

export function invalidateStorageCache() {
  perTenantStorage.clear();
  allStorageCache = null;
}

/**
 * Builds the (read-only) database facts for tenants. Nothing here is stored or invented:
 * storage, pool size and schema version are measured; quota comes from the plan.
 * `measure: 'none'` (request hot path) skips the storage measurement and reports 0 for it; 'page' measures just
 * these tenants; 'all' reuses the platform-wide scan (telemetry).
 */
export async function withDbConfig<T extends Omit<Tenant, 'dbConfig'>>(
  tenants: T[],
  measure: 'none' | 'page' | 'all' = 'page'
): Promise<(T & { dbConfig: DatabaseConfig })[]> {
  if (tenants.length === 0) return [];
  const [storage, version] = await Promise.all([
    measure === 'none' ? Promise.resolve(new Map<string, number>()) : measure === 'all' ? storageByTenant() : storageFor(tenants.map(t => t.id)),
    schemaVersion()
  ]);
  return tenants.map(t => ({
    ...t,
    dbConfig: {
      dbId: `part-${t.slug}`,
      dbName: `tenant:${t.slug}`,
      host: 'Supabase Postgres (cluster compartilhado)',
      port: 5432,
      engineType: 'Shared-Postgres-RLS',
      maxPoolSize: Number(process.env.DB_POOL_MAX) || 10,
      sslEnabled: true,
      region: 'Supabase (gerenciado)',
      schemaVersion: version,
      encryptionKeyId: 'supabase-managed (criptografia em repouso)',
      storageUsedMb: Number((storage.get(t.id) ?? 0).toFixed(2)),
      maxStorageMb: QUOTA_MB[t.plan]
    }
  }));
}
