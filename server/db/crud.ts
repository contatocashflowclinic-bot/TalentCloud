import { getPool, Queryable } from './pool.js';

/**
 * Declarative description of a tenant-owned table.
 * `columns` are the camelCase API field names (tenant_id / seq are implicit).
 * Column identifiers only ever come from these static specs, never from
 * request input, and are always quoted.
 */
export interface TableSpec {
  table: string;
  columns: readonly string[];
  json?: readonly string[];
  orderBy?: string;
  exposeTenantId?: boolean;
}

export const toSnake = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z]+)/g, (_, a: string, b: string) => a + '_' + b.toLowerCase())
    .replace(/([a-z])(\d+)/g, '$1_$2');
export const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
// Columns whose camelCase API name is not derivable from the snake_case column.
const READ_ALIASES: Record<string, string> = { candidateNps: 'candidateNPS' };
const q = (ident: string) => `"${ident}"`;

/** Explicit allow-list of columns: secrets (e.g. password_hash) can never leak through generic reads. */
const selectList = (spec: TableSpec) => ['tenant_id', ...spec.columns.map(c => q(toSnake(c)))].join(', ');

/** DB row -> API object (snake_case -> camelCase, NULL columns omitted). */
export function fromRow<T>(spec: Pick<TableSpec, 'exposeTenantId'>, row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'seq') continue;
    if (key === 'tenant_id' && !spec.exposeTenantId) continue;
    if (value === null || value === undefined) continue;
    const camel = toCamel(key);
    out[READ_ALIASES[camel] ?? camel] = value;
  }
  return out as T;
}

function toParam(spec: TableSpec, field: string, value: unknown): unknown {
  if (value === undefined) return null;
  if (spec.json?.includes(field) && value !== null) return JSON.stringify(value);
  return value;
}

export async function listRows<T>(spec: TableSpec, tenantId: string, db: Queryable = getPool()): Promise<T[]> {
  const { rows } = await db.query(
    `select ${selectList(spec)} from public.${q(spec.table)} where tenant_id = $1 order by ${spec.orderBy ?? 'seq asc'}`,
    [tenantId]
  );
  return rows.map(r => fromRow<T>(spec, r));
}

export async function getRow<T>(
  spec: TableSpec,
  tenantId: string,
  id: string,
  db: Queryable = getPool(),
  lock = false
): Promise<T | undefined> {
  const { rows } = await db.query(
    `select ${selectList(spec)} from public.${q(spec.table)} where tenant_id = $1 and id = $2${lock ? ' for update' : ''}`,
    [tenantId, id]
  );
  return rows[0] ? fromRow<T>(spec, rows[0]) : undefined;
}

export async function insertRow<T>(
  spec: TableSpec,
  tenantId: string,
  obj: Record<string, unknown>,
  db: Queryable = getPool()
): Promise<T> {
  const fields = spec.columns.filter(c => obj[c] !== undefined);
  const cols = ['tenant_id', ...fields.map(f => q(toSnake(f)))];
  const values = [tenantId, ...fields.map(f => toParam(spec, f, obj[f]))];
  const placeholders = values.map((_, i) => `$${i + 1}`);
  const { rows } = await db.query(
    `insert into public.${q(spec.table)} (${cols.join(', ')}) values (${placeholders.join(', ')}) returning ${selectList(spec)}`,
    values
  );
  return fromRow<T>(spec, rows[0]);
}

export async function updateRow<T>(
  spec: TableSpec,
  tenantId: string,
  id: string,
  patch: Record<string, unknown>,
  db: Queryable = getPool()
): Promise<T | undefined> {
  const fields = spec.columns.filter(c => c !== 'id' && patch[c] !== undefined);
  if (fields.length === 0) return getRow<T>(spec, tenantId, id, db);
  const sets = fields.map((f, i) => `${q(toSnake(f))} = $${i + 3}`);
  const { rows } = await db.query(
    `update public.${q(spec.table)} set ${sets.join(', ')} where tenant_id = $1 and id = $2 returning ${selectList(spec)}`,
    [tenantId, id, ...fields.map(f => toParam(spec, f, patch[f]))]
  );
  return rows[0] ? fromRow<T>(spec, rows[0]) : undefined;
}

export async function deleteRow(
  spec: TableSpec,
  tenantId: string,
  id: string,
  db: Queryable = getPool()
): Promise<boolean> {
  const { rowCount } = await db.query(`delete from public.${q(spec.table)} where tenant_id = $1 and id = $2`, [tenantId, id]);
  return (rowCount ?? 0) > 0;
}
