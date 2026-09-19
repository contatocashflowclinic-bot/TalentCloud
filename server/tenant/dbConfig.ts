import type { DatabaseConfig, Tenant } from '../../src/types.js';
import { getPool } from '../db/pool.js';
import { TABLES } from '../db/tables.js';

/** Storage quota per plan (informational: shown in the console, not enforced). */
const QUOTA_MB: Record<Tenant['plan'], number> = { Starter: 1024, Scale: 2048, Enterprise: 4096 };

const CACHE_TTL_MS = 60_000;
const TENANT_TABLES = [...Object.values(TABLES).map(t => t.table), 'organizational_dna', 'tenant_indicators'];

let storageCache: { at: number; mb: Map<string, number> } | null = null;
let schemaCache: { at: number; version: string } | null = null;

/** Estimated size of each tenant's rows (pg_column_size), cached for 60s. */
async function storageByTenant(): Promise<Map<string, number>> {
  if (storageCache && Date.now() - storageCache.at < CACHE_TTL_MS) return storageCache.mb;
  const union = TENANT_TABLES
    .map(t => `select tenant_id, pg_column_size(x.*) as bytes from public."${t}" x`)
    .join(' union all ');
  const { rows } = await getPool().query(
    `select tenant_id, sum(bytes)::float8 as bytes from (${union}) s group by tenant_id`
  );
  const mb = new Map<string, number>(rows.map(r => [r.tenant_id as string, Number(r.bytes) / (1024 * 1024)]));
  storageCache = { at: Date.now(), mb };
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
  storageCache = null;
}

/**
 * Builds the (read-only) database facts for tenants. Nothing here is stored or invented:
 * storage, pool size and schema version are measured; quota comes from the plan.
 */
export async function withDbConfig<T extends Omit<Tenant, 'dbConfig'>>(tenants: T[]): Promise<(T & { dbConfig: DatabaseConfig })[]> {
  if (tenants.length === 0) return [];
  const [storage, version] = await Promise.all([storageByTenant(), schemaVersion()]);
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
