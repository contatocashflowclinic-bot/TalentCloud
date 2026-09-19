import pg from 'pg';

// Return JS-friendly values: ISO strings for timestamptz, numbers for numeric/bigint.
pg.types.setTypeParser(1184, (v: string) => new Date(v).toISOString());
pg.types.setTypeParser(1700, (v: string) => parseFloat(v));
pg.types.setTypeParser(20, (v: string) => parseInt(v, 10));

export type Queryable = pg.Pool | pg.PoolClient;

let pool: pg.Pool | null = null;

/**
 * Lazy singleton Postgres pool (Supabase). Lazy so that env files are loaded
 * before the connection string is read.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.SUPABASE_DB_URL;
    if (!url) {
      throw new Error('SUPABASE_DB_URL não definida. Configure o .env.local (veja .env.example).');
    }
    pool = new pg.Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: Number(process.env.DB_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    });
    pool.on('error', err => console.error('[db] erro em conexão ociosa:', err.message));
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
