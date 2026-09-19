import type { SystemAuditLog } from '../src/types.js';
import { getPool, Queryable } from './db/pool.js';
import { newId } from './ids.js';

export type AuditEntry = Omit<SystemAuditLog, 'id' | 'timestamp'> & { id?: string; timestamp?: string };

/** Appends to the platform audit trail (pass a transaction client to make it atomic with the action). */
export async function logAudit(entry: AuditEntry, db: Queryable = getPool()): Promise<void> {
  await db.query(
    `insert into public.platform_audit_logs
       (id, timestamp, tenant_id, user_id, user_name, action, category, details, ip_address, database_affected)
     values ($1, coalesce($2::timestamptz, now()), $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.id ?? newId('audit'), entry.timestamp ?? null, entry.tenantId || null, entry.userId, entry.userName,
      entry.action, entry.category, entry.details, entry.ipAddress, entry.databaseAffected
    ]
  );
}
