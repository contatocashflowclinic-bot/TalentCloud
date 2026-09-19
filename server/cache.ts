import type { AuthenticatedSession } from './auth/AuthService.js';

/**
 * Tiny in-process TTL cache (bounded). Used on the request hot path (sessions, tenant catalog rows) so a
 * request needs no lookup query. Every write that changes what is cached calls `clear()`/`delete()`, so
 * changes are immediate on the instance that made them; with several instances the staleness is bounded by
 * the TTL (a few seconds).
 */
export class TtlCache<T> {
  private map = new Map<string, { at: number; value: T }>();

  constructor(private readonly ttlMs: number, private readonly max = 5000) {}

  get(key: string): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.map.size >= this.max) {
      // drop the oldest entry (Map keeps insertion order)
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { at: Date.now(), value });
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

/** Sessions resolved from a token (permissions included). Cleared by any access-control change. */
export const sessionCache = new TtlCache<AuthenticatedSession>(5_000, 10_000);
