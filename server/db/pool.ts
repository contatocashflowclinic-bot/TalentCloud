import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';

// Return JS-friendly values: ISO strings for timestamptz, numbers for numeric/bigint.
pg.types.setTypeParser(1184, (v: string) => new Date(v).toISOString());
pg.types.setTypeParser(1700, (v: string) => parseFloat(v));
pg.types.setTypeParser(20, (v: string) => parseInt(v, 10));

export type Queryable = pg.Pool | pg.PoolClient;

let pool: pg.Pool | null = null;

/**
 * Drops the TLS-related parameters of the URL. The `ssl` option below is the single source of truth: a
 * `?sslmode=require` in the string would override it (newer `pg` treats it as verify-full and rejects Supabase's chain).
 */
function normalizeConnectionString(raw: string): string {
  try {
    const url = new URL(raw);
    for (const p of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(p);
    return url.toString();
  } catch {
    return raw;
  }
}

/** TLS is always on. Set DB_SSL_CA (PEM, "\n" allowed) to also verify the server certificate (recommended). */
function sslOptions(): pg.PoolConfig['ssl'] {
  const ca = process.env.DB_SSL_CA?.replace(/\\n/g, '\n');
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

/**
 * Lazy singleton Postgres pool (Supabase). Lazy so that env files are loaded
 * before the connection string is read.
 *
 * On Vercel each function instance owns its own pool, so it is kept small and idle connections are released quickly;
 * `attachDatabasePool` closes them before the instance is suspended. Point SUPABASE_DB_URL at the Supabase
 * connection pooler (Supavisor, port 6543), never at the direct host: that one is IPv6-only and Vercel is IPv4.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.SUPABASE_DB_URL;
    if (!url) {
      throw new Error('SUPABASE_DB_URL não definida. Configure o .env.local (veja .env.example) ou as variáveis do projeto na Vercel.');
    }
    const onVercel = Boolean(process.env.VERCEL);
    if (onVercel && /@db\.[a-z0-9]+\.supabase\.co[:/]/i.test(url)) {
      console.warn(
        '[db] SUPABASE_DB_URL usa o host direto do Supabase (somente IPv6): a Vercel não consegue conectar. ' +
        'Use a string do "Connection pooler" (Dashboard > Connect > Transaction pooler, porta 6543).'
      );
    }
    pool = new pg.Pool({
      connectionString: normalizeConnectionString(url),
      ssl: sslOptions(),
      max: Number(process.env.DB_POOL_MAX) || (onVercel ? 5 : 10),
      idleTimeoutMillis: onVercel ? 5_000 : 30_000,
      connectionTimeoutMillis: 10_000
    });
    pool.on('error', err => console.error('[db] erro em conexão ociosa:', err.message));
    if (onVercel) attachDatabasePool(pool);
  }
  return pool;
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
