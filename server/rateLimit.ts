import { createHash } from 'node:crypto';
import { getPool, Queryable } from './db/pool.js';
import { TooManyRequestsError } from './errors.js';

/**
 * Rate limiting shared by every server instance (table public.rate_limits). Counters must live in the database:
 * on Vercel each request may run on a different short-lived instance, so process memory would never accumulate.
 * Keys are hashed, so no e-mail / IP is stored in clear text.
 */
const keyOf = (parts: string[]) => createHash('sha256').update(parts.join('|')).digest('hex');

export interface FailureLockPolicy {
  /** failures inside `windowSeconds` that trigger the lock */
  maxFailures: number;
  windowSeconds: number;
  lockSeconds: number;
}

export class FailureLimiter {
  constructor(private readonly bucket: string, private readonly policy: FailureLockPolicy) {}

  key(...parts: string[]) {
    return keyOf(parts);
  }

  /** Throws 429 while the key is locked. */
  async assertAllowed(key: string, db: Queryable = getPool()): Promise<void> {
    const { rows } = await db.query(
      `select extract(epoch from (locked_until - now()))::float8 as seconds
         from public.rate_limits where bucket = $1 and key = $2 and locked_until > now()`,
      [this.bucket, key]
    );
    if (rows[0]) {
      const minutes = Math.max(1, Math.ceil(Number(rows[0].seconds) / 60));
      throw new TooManyRequestsError(`Muitas tentativas de login. Tente novamente em ${minutes} minuto(s).`);
    }
  }

  /** Records a failure (atomic). Failures older than the window, or from an expired lock, start a new count. */
  async fail(key: string, db: Queryable = getPool()): Promise<void> {
    const { maxFailures, windowSeconds, lockSeconds } = this.policy;
    // A previous count is stale when its lock has expired or its window has elapsed
    const stale = `((r.locked_until is not null and r.locked_until <= now()) or r.window_start <= now() - make_interval(secs => $3))`;
    const nextHits = `((case when ${stale} then 0 else r.hits end) + 1)`;
    await db.query(
      `insert into public.rate_limits as r (bucket, key, hits, window_start, locked_until)
       values ($1, $2, 1, now(), case when 1 >= $4 then now() + make_interval(secs => $5) end)
       on conflict (bucket, key) do update set
         hits         = ${nextHits},
         window_start = case when ${stale} then now() else r.window_start end,
         locked_until = case when ${nextHits} >= $4 then now() + make_interval(secs => $5) end`,
      [this.bucket, key, windowSeconds, maxFailures, lockSeconds]
    );
  }

  async reset(key: string, db: Queryable = getPool()): Promise<void> {
    await db.query('delete from public.rate_limits where bucket = $1 and key = $2', [this.bucket, key]);
  }
}

/**
 * Fixed-window counter: counts one use of `bucket`/`key` and throws 429 once `limit` uses happened inside the window.
 * Pass a transaction client to make the count roll back together with the operation it protects.
 */
export async function consumeQuota(
  bucket: string,
  keyParts: string[],
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
  message: string,
  db: Queryable = getPool()
): Promise<void> {
  const { rows } = await db.query(
    `insert into public.rate_limits as r (bucket, key, hits, window_start)
     values ($1, $2, 1, now())
     on conflict (bucket, key) do update set
       hits         = case when r.window_start <= now() - make_interval(secs => $3) then 1 else r.hits + 1 end,
       window_start = case when r.window_start <= now() - make_interval(secs => $3) then now() else r.window_start end
     returning hits`,
    [bucket, keyOf(keyParts), windowSeconds]
  );
  if (Number(rows[0].hits) > limit) throw new TooManyRequestsError(message);
}

/** Housekeeping: drops counters that can no longer matter. Best effort, called from time to time. */
export async function purgeStaleRateLimits(db: Queryable = getPool()): Promise<void> {
  await db.query(
    `delete from public.rate_limits
      where window_start < now() - interval '1 day' and (locked_until is null or locked_until < now())`
  );
}
