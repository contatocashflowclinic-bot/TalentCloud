import { randomUUID } from 'node:crypto';

/** Collision-safe, human-readable id, e.g. newId('cand') -> 'cand-9f3a1c2b'. */
export function newId(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}
