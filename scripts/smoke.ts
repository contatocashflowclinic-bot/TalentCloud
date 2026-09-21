/**
 * End-to-end smoke test against a RUNNING server and the real database.
 *   npm run dev                       (or PORT=3100 npm run dev)
 *   BASE_URL=http://localhost:3000 npm run test:smoke
 *
 * Covers: SuperAdmin login, organization provisioning + temporary passwords, forced password
 * change, session pinning, RBAC per role, public careers portal, tenant isolation, audit trail,
 * secret leakage, brute-force lock and fidelity of the seeded demo data. Temporary organizations
 * and their audit rows are removed at the end.
 *
 * SuperAdmin credentials: SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD (default: the seeded admin).
 */
import { config } from 'dotenv';
import { isDeepStrictEqual } from 'node:util';
import {
  getTechCorpSeedData,
  getVarejoBrSeedData,
  getBioSaudeSeedData
} from '../server/tenant/masterSeed.js';
import { closePool, getPool } from '../server/db/pool.js';
import { PLAN_ROUTINES } from '../src/access.js';
import { TenantRepository } from '../server/tenant/TenantRepository.js';
import { AccessService } from '../server/auth/AccessService.js';
import { removeFile } from '../server/storage.js';

config({ path: ['.env.local', '.env'], quiet: true });

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || 'admin@admin.com.br';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || 'Admin@123';

const storedFiles = new Set<string>();
let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failures.push(detail === undefined ? name : `${name} -> ${JSON.stringify(detail)}`);
}

interface Opts { token?: string; tenant?: string; body?: unknown; headers?: Record<string, string> }

async function api(method: string, path: string, opts: Opts = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.tenant) headers['X-Tenant-Slug'] = opts.tenant;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });
  const json: any = await res.json().catch(() => ({}));
  return { status: res.status, json, headers: res.headers };
}

async function login(email: string, password: string, tenant?: string) {
  return api('POST', '/api/auth/login', { body: { email, password, tenant } });
}

/** Canonical form: ISO timestamps normalised, undefined/null-valued keys dropped, keys sorted. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined && x !== null)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, canon(x)])
    );
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v)) {
    return new Date(v).toISOString();
  }
  return v;
}
const sameData = (a: unknown, b: unknown) => isDeepStrictEqual(canon(a), canon(b));

/** Logs in an organization user with a temporary password, sets a final one, returns the session token. */
async function activateUser(slug: string, email: string, tempPassword: string, finalPassword: string) {
  const first = await login(email, tempPassword, slug);
  if (!first.json.success) return { token: '', first };
  const change = await api('POST', '/api/auth/change-password', {
    token: first.json.token,
    body: { currentPassword: tempPassword, newPassword: finalPassword }
  });
  return { token: change.status === 200 ? (first.json.token as string) : '', first, change };
}

async function seedFidelity() {
  const seeds: Array<[string, any]> = [
    ['techcorp', getTechCorpSeedData()],
    ['varejobr', getVarejoBrSeedData()],
    ['biosaude', getBioSaudeSeedData()]
  ];
  for (const [slug, seed] of seeds) {
    const repo = new TenantRepository(`tenant-${slug}`);
    const users = await AccessService.listMembers(getPool(), `tenant-${slug}`);
    const linkFields = ({ userId: _u, profileName: _n, permissions: _p, grantedPermissions: _g, revokedPermissions: _r, ...rest }: any) => rest;
    check(`[${slug}] users`, sameData(users.map(linkFields), seed.users), users.map(linkFields));
    check(`[${slug}] users expose no credential fields`, users.every((u: any) => !('passwordHash' in u) && !('password_hash' in u) && !('mustChangePassword' in u)));
    check(`[${slug}] dna`, sameData(await repo.getDna(), seed.dna));
    check(`[${slug}] departments`, sameData(await repo.departments.list(), seed.departments));
    check(`[${slug}] positions`, sameData(await repo.positions.list(), seed.positions));
    check(`[${slug}] openings`, sameData(await repo.openings.list(), seed.openings));
    check(`[${slug}] candidates`, sameData(await repo.candidates.list(), seed.candidates.map((c: any) => ({ dataOrigin: 'rh', archived: false, ...c }))));
    check(`[${slug}] applications`, sameData(await repo.applications.list(), seed.applications));
    check(`[${slug}] aiEvaluations`, sameData(await repo.aiEvaluations.list(), [...(seed.aiEvaluations ?? [])].reverse()));
    check(`[${slug}] interviews`, sameData(await repo.interviews.list(), seed.interviews ?? []));
    check(`[${slug}] offers`, sameData(await repo.offers.list(), seed.offers ?? []));
    check(`[${slug}] onboardings`, sameData(await repo.onboardings.list(), (seed.onboardings ?? []).map((o: any) => ({ admission: [], ...o }))));
    check(`[${slug}] development`, sameData(await repo.development.list(), seed.developmentRecords ?? []));
    check(`[${slug}] climateSurveys`, sameData(await repo.climateSurveys.list(), seed.climateSurveys ?? []));
    check(`[${slug}] turnoverAlerts`, sameData(await repo.turnoverAlerts.list(), seed.turnoverAlerts ?? []));
    check(`[${slug}] indicators`, sameData(await repo.getIndicators(), seed.indicators));
  }
}

async function main() {
  const health = await api('GET', '/api/health');
  check('health/database', health.json.database === 'ok', health.json);

  // =====================================================================
  // AUTHENTICATION - basics
  // =====================================================================
  check('no token -> 401 (master)', (await api('GET', '/api/master/tenants')).status === 401);
  check('no token -> 401 (tenant API)', (await api('GET', '/api/v1/users', { tenant: 'techcorp' })).status === 401);
  check('garbage token -> 401', (await api('GET', '/api/v1/users', { token: 'not-a-real-token' })).status === 401);
  check('unknown route stays JSON 404', (await api('GET', '/api/nope')).status === 404);

  const wrongPw = await login(ADMIN_EMAIL, 'definitivamente-errada');
  const unknownUser = await login(`ninguem-${Date.now()}@smoke.test`, 'qualquer-coisa-1');
  check('wrong password -> 401', wrongPw.status === 401, wrongPw.json);
  check('unknown user -> same 401 + same message (no enumeration)', unknownUser.status === 401 && unknownUser.json.error === wrongPw.json.error, [unknownUser.json, wrongPw.json]);
  check('login without fields -> 400', (await api('POST', '/api/auth/login', { body: {} })).status === 400);

  const adminLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  check('SuperAdmin default login works', adminLogin.status === 200 && adminLogin.json.user?.type === 'super_admin' && adminLogin.json.user.permissions?.length > 0, adminLogin.json);
  const adminToken: string = adminLogin.json.token;
  if (!adminToken) throw new Error('SuperAdmin login failed; set SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD');
  const me = await api('GET', '/api/auth/me', { token: adminToken });
  check('/me returns the principal without secrets', me.json.user?.email === ADMIN_EMAIL && !('tokenHash' in me.json.user) && !('passwordHash' in me.json.user), me.json);

  // Brute-force lock (unique email so the real admin is never locked)
  const bruteEmail = `brute-${Date.now()}@smoke.test`;
  let lastStatus = 0;
  for (let i = 0; i < 6; i++) lastStatus = (await login(bruteEmail, 'errada-errada-1')).status;
  check('brute force locks after repeated failures -> 429', lastStatus === 429, lastStatus);

  // Sessions are stored hashed
  {
    const { rows } = await getPool().query('select token_hash from public.auth_sessions where token_hash = $1', [adminToken]);
    check('raw session token is NOT stored (only its hash)', rows.length === 0);
  }

  await seedFidelity();

  // Real (non-invented) DB facts
  const catalog = (await api('GET', '/api/master/tenants', { token: adminToken })).json.tenants as any[];
  const tc = catalog.find(t => t.slug === 'techcorp');
  check('dbConfig is derived: shared engine, real storage > 0', tc.dbConfig.engineType === 'Shared-Postgres-RLS' && tc.dbConfig.storageUsedMb > 0, tc.dbConfig);
  check('dbConfig reports the real applied schema version', /^\d{14}_/.test(tc.dbConfig.schemaVersion), tc.dbConfig.schemaVersion);

  // =====================================================================
  // SUPERADMIN: provisioning, credentials, isolation
  // =====================================================================
  const suffix = Math.random().toString(36).slice(2, 7);
  const slugA = `smoke-a-${suffix}`;
  const slugB = `smoke-b-${suffix}`;
  const createdTenantIds: string[] = [];
  const emailA = `admin-a-${suffix}@smoke.test`;
  const emailB = `admin-b-${suffix}@smoke.test`;

  try {
    check('provision validation -> 400', (await api('POST', '/api/master/tenants/provision', { token: adminToken, body: { name: 'X' } })).status === 400);
    check('provision invalid plan -> 400', (await api('POST', '/api/master/tenants/provision', { token: adminToken, body: { name: 'X', slug: `x-${suffix}`, contactEmail: 'a@b.co', plan: 'Gold' } })).status === 400);
    check('provision invalid admin e-mail -> 400', (await api('POST', '/api/master/tenants/provision', { token: adminToken, body: { name: 'X', slug: `x-${suffix}`, contactEmail: 'a@b.co', adminUserEmail: 'nao-e-email' } })).status === 400);

    const provA = await api('POST', '/api/master/tenants/provision', {
      token: adminToken,
      body: { name: `Smoke A ${suffix}`, slug: slugA, contactEmail: emailA, adminUserName: 'Admin A', adminUserEmail: emailA, plan: 'Scale' }
    });
    check('provision A -> 201 with one-time admin credentials', provA.status === 201 && provA.json.adminCredentials?.tempPassword?.length >= 12, provA.json);
    createdTenantIds.push(provA.json.tenant?.id);
    const provB = await api('POST', '/api/master/tenants/provision', {
      token: adminToken,
      body: { name: `Smoke B ${suffix}`, slug: slugB, contactEmail: emailB, adminUserName: 'Admin B', adminUserEmail: emailB, plan: 'Scale' }
    });
    check('provision B -> 201', provB.status === 201, provB.json);
    createdTenantIds.push(provB.json.tenant?.id);

    check('duplicate slug -> 409', (await api('POST', '/api/master/tenants/provision', { token: adminToken, body: { name: 'Dup', slug: slugA, contactEmail: 'd@smoke.test' } })).status === 409);
    check('new tenant reports plan quota + shared engine', provA.json.tenant.dbConfig.maxStorageMb === 2048 && provA.json.tenant.dbConfig.engineType === 'Shared-Postgres-RLS', provA.json.tenant?.dbConfig);

    // ---- Temporary password flow -------------------------------------------
    const tempA: string = provA.json.adminCredentials.tempPassword;
    const stored = await getPool().query('select password_hash, must_change_password from public.app_users where lower(email) = $1', [emailA]);
    check('no credentials left on the organization link table', !(await getPool().query("select 1 from information_schema.columns where table_name = 'tenant_users' and column_name in ('password_hash','must_change_password')")).rowCount);
    check('temp password stored only as scrypt hash', stored.rows[0].password_hash?.startsWith('scrypt$') && !stored.rows[0].password_hash.includes(tempA) && stored.rows[0].must_change_password === true, stored.rows[0]);

    check('org login works without the organization identifier (single link)', (await login(emailA, tempA)).json.user?.tenantId === provA.json.tenant.id);
    check('org login with WRONG organization -> 401', (await login(emailA, tempA, slugB)).status === 401);
    const first = await login(emailA, tempA, slugA);
    check('org admin logs in with temp password', first.status === 200 && first.json.user?.mustChangePassword === true && first.json.user?.profileId === 'admin' && first.json.user.permissions?.includes('users:create'), first.json);
    const firstToken: string = first.json.token;

    const blocked = await api('GET', '/api/v1/users', { token: firstToken });
    check('business API blocked until password changed (403 PASSWORD_CHANGE_REQUIRED)', blocked.status === 403 && blocked.json.code === 'PASSWORD_CHANGE_REQUIRED', blocked.json);
    check('master API blocked for org users', (await api('GET', '/api/master/tenants', { token: firstToken })).status === 403);
    check('weak new password rejected', (await api('POST', '/api/auth/change-password', { token: firstToken, body: { currentPassword: tempA, newPassword: 'curta1' } })).status === 400);
    check('no-digit password rejected', (await api('POST', '/api/auth/change-password', { token: firstToken, body: { currentPassword: tempA, newPassword: 'somenteletras' } })).status === 400);
    check('wrong current password rejected', (await api('POST', '/api/auth/change-password', { token: firstToken, body: { currentPassword: 'errada-1234', newPassword: 'Nova#Senha42' } })).status === 401);
    const changed = await api('POST', '/api/auth/change-password', { token: firstToken, body: { currentPassword: tempA, newPassword: 'Nova#Senha42' } });
    check('password change succeeds', changed.status === 200, changed.json);
    check('same token works after change', (await api('GET', '/api/v1/users', { token: firstToken })).status === 200);
    check('old (temp) password no longer works', (await login(emailA, tempA, slugA)).status === 401);
    const adminA = (await login(emailA, 'Nova#Senha42', slugA)).json.token as string;
    const okB = await activateUser(slugB, emailB, provB.json.adminCredentials.tempPassword, 'Outra#Senha77');
    const adminB = okB.token;
    check('org B admin activated', !!adminB, okB.first?.json);

    // Login on a clean org: must be case-insensitive on e-mail
    check('e-mail login is case-insensitive', (await login(emailA.toUpperCase(), 'Nova#Senha42', slugA)).status === 200);

    // ---- Pinned session: headers cannot cross organizations ------------------
    const ctxA = await api('GET', '/api/v1/context', { token: adminA, tenant: slugB });
    check('org user pinned to own org even with X-Tenant-Slug of another org', ctxA.json.tenant?.slug === slugA && ctxA.json.routingResolution?.strategy === 'TOKEN_SESSION', ctxA.json.tenant?.slug);
    const ctxByQuery = await fetch(`${BASE}/api/v1/context?tenant=${slugB}`, { headers: { Authorization: `Bearer ${adminA}`, 'X-Tenant-Id': provB.json.tenant.id } });
    check('org user pinned even with X-Tenant-Id / ?tenant of another org', ((await ctxByQuery.json()) as any).tenant?.slug === slugA);

    // New org starts with a clean slate (real zeros, no invented benchmarks)
    const usersA = await api('GET', '/api/v1/users', { token: adminA });
    check('new org has only its admin', usersA.json.users?.length === 1 && usersA.json.users[0].profileId === 'admin', usersA.json);
    const indA = (await api('GET', '/api/v1/indicators', { token: adminA })).json.indicators;
    check('new org indicators are real zeros', indA?.timeToHireDays === 0 && indA.costPerHire === 0 && indA.recruitmentFunnel.applied === 0, indA);

    const A = (method: string, path: string, body?: unknown) => api(method, path, { token: adminA, body });
    const B = (method: string, path: string, body?: unknown) => api(method, path, { token: adminB, body });

    // ---- Users, temp passwords, RBAC -----------------------------------------
    const roles = ['RECRUITER', 'HIRING_MANAGER', 'INTERVIEWER', 'COLLABORATOR'] as const;
    const tokens: Record<string, string> = {};
    for (const role of roles) {
      const email = `${role.toLowerCase()}-${suffix}@smoke.test`;
      const created = await A('POST', '/api/v1/users', { name: `U ${role}`, email, profileId: role.toLowerCase(), jobTitle: role });
      check(`create ${role} user returns a one-time temp password`, created.status === 201 && created.json.tempPassword?.length >= 12 && !('passwordHash' in created.json.user), created.json);
      const act = await activateUser(slugA, email, created.json.tempPassword, `Senha#${role}9`);
      tokens[role] = act.token;
      check(`${role} can activate the account`, !!act.token, act.first?.json);
    }
    check('duplicate user email -> 409', (await A('POST', '/api/v1/users', { name: 'Dup', email: `recruiter-${suffix}@smoke.test`, profileId: 'recruiter' })).status === 409);
    check('unknown profile rejected', (await A('POST', '/api/v1/users', { name: 'Evil', email: `evil-${suffix}@smoke.test`, profileId: 'SUPER_ADMIN' })).status === 400);
    check('profile of another org rejected', (await B('POST', '/api/v1/users', { name: 'Evil', email: `evil2-${suffix}@smoke.test`, profileId: 'prf-nope' })).status === 400);
    check('user requires name -> 400', (await A('POST', '/api/v1/users', { email: 'x@y.z' })).status === 400);

    const R = (role: string, method: string, path: string, body?: unknown) => api(method, path, { token: tokens[role], body });
    // RBAC matrix (sampled on the routes that matter)
    check('RBAC: RECRUITER cannot create users', (await R('RECRUITER', 'POST', '/api/v1/users', { name: 'x', email: 'x@smoke.test' })).status === 403);
    check('RBAC: RECRUITER cannot edit DNA', (await R('RECRUITER', 'PUT', '/api/v1/dna', { mission: 'hack' })).status === 403);
    check('RBAC: RECRUITER can read candidates', (await R('RECRUITER', 'GET', '/api/v1/candidates')).status === 200);
    check('RBAC: HIRING_MANAGER cannot create candidates', (await R('HIRING_MANAGER', 'POST', '/api/v1/candidates', { name: 'x', email: 'x@smoke.test' })).status === 403);
    check('RBAC: HIRING_MANAGER can read offers', (await R('HIRING_MANAGER', 'GET', '/api/v1/offers')).status === 200);
    check('RBAC: INTERVIEWER can read candidates + interviews', (await R('INTERVIEWER', 'GET', '/api/v1/candidates')).status === 200 && (await R('INTERVIEWER', 'GET', '/api/v1/interviews')).status === 200);
    check('RBAC: INTERVIEWER keeps supporting reads (applications, AI evaluations) but has no Processo Seletivo / Avaliação IA routine', (await R('INTERVIEWER', 'GET', '/api/v1/applications')).status === 200 && (await R('INTERVIEWER', 'GET', '/api/v1/ai/evaluations')).status === 200 && !(await api('GET', '/api/auth/me', { token: tokens.INTERVIEWER })).json.user.permissions.some((p: string) => p.startsWith('selection:') || p.startsWith('ai_evaluation:')));
    check('RBAC: INTERVIEWER cannot move applications or decide AI evaluations', (await R('INTERVIEWER', 'PATCH', '/api/v1/applications/x/stage', { stageId: 'stg-2' })).status === 403 && (await R('INTERVIEWER', 'PATCH', '/api/v1/ai/evaluations/x/human-decision', { decision: 'APPROVED' })).status === 403);
    check('RBAC: INTERVIEWER cannot read offers', (await R('INTERVIEWER', 'GET', '/api/v1/offers')).status === 403);
    check('RBAC: INTERVIEWER cannot read indicators', (await R('INTERVIEWER', 'GET', '/api/v1/indicators')).status === 403);
    check('RBAC: INTERVIEWER cannot create candidates', (await R('INTERVIEWER', 'POST', '/api/v1/candidates', { name: 'x', email: 'x@smoke.test' })).status === 403);
    check('RBAC: COLLABORATOR cannot read candidates', (await R('COLLABORATOR', 'GET', '/api/v1/candidates')).status === 403);
    check('RBAC: COLLABORATOR cannot read users', (await R('COLLABORATOR', 'GET', '/api/v1/users')).status === 403);
    check('RBAC: COLLABORATOR cannot read development records', (await R('COLLABORATOR', 'GET', '/api/v1/development')).status === 403);
    check('RBAC: COLLABORATOR can read DNA + context + openings', (await R('COLLABORATOR', 'GET', '/api/v1/dna')).status === 200 && (await R('COLLABORATOR', 'GET', '/api/v1/context')).status === 200 && (await R('COLLABORATOR', 'GET', '/api/v1/openings')).status === 200);

    // ---- Password reset by ORG_ADMIN -------------------------------------------
    const recruiterUser = (usersA.json.users, (await A('GET', '/api/v1/users')).json.users.find((u: any) => u.profileId === 'recruiter'));
    const reset = await A('POST', `/api/v1/users/${recruiterUser.id}/reset-password`);
    check('ORG_ADMIN can issue a temp password', reset.status === 200 && reset.json.tempPassword?.length >= 12, reset.json);
    check('reset kills the user\'s existing sessions', (await R('RECRUITER', 'GET', '/api/v1/candidates')).status === 401);
    check('old password stops working after reset', (await login(recruiterUser.email, `Senha#RECRUITER9`, slugA)).status === 401);
    check('temp password works and forces change', (await login(recruiterUser.email, reset.json.tempPassword, slugA)).json.user?.mustChangePassword === true);
    check('non-admin cannot reset passwords', (await R('HIRING_MANAGER', 'POST', `/api/v1/users/${recruiterUser.id}/reset-password`)).status === 403);
    check('reset of unknown user -> 404', (await A('POST', '/api/v1/users/usr-nope/reset-password')).status === 404);

    // ---- Access profiles, per-user exceptions, privilege-escalation guards ----------
    const profilesA = await A('GET', '/api/v1/profiles');
    check('org has the 5 default profiles (admin is total)', profilesA.json.profiles?.length === 5 && profilesA.json.profiles.find((p: any) => p.id === 'admin')?.isAdmin === true, profilesA.json);
    check('RBAC: HIRING_MANAGER cannot even list profiles', (await R('HIRING_MANAGER', 'GET', '/api/v1/profiles')).status === 403);
    check('RBAC: HIRING_MANAGER cannot create profiles', (await R('HIRING_MANAGER', 'POST', '/api/v1/profiles', { name: 'x', permissions: [] })).status === 403);
    check('unknown permission key -> 400', (await A('POST', '/api/v1/profiles', { name: 'Ruim', permissions: ['openings:fly'] })).status === 400);
    check('profile requires a name -> 400', (await A('POST', '/api/v1/profiles', { permissions: [] })).status === 400);
    const onlyJobs = await A('POST', '/api/v1/profiles', { name: 'Só Vagas', description: 'teste', permissions: ['openings:create'] });
    check('custom profile created; "view" is implied by "create"', onlyJobs.status === 201 && onlyJobs.json.profile.permissions.includes('openings:view'), onlyJobs.json);
    check('duplicate profile name -> 409', (await A('POST', '/api/v1/profiles', { name: 'só vagas', permissions: [] })).status === 409);
    check('admin profile is immutable', (await A('PUT', '/api/v1/profiles/admin', { permissions: [] })).status === 403);
    check('system profile cannot be deleted', (await A('DELETE', '/api/v1/profiles/recruiter')).status === 403);

    const jobsEmail = `jobs-${suffix}@smoke.test`;
    const jobsUser = await A('POST', '/api/v1/users', { name: 'Só Vagas', email: jobsEmail, profileId: onlyJobs.json.profile.id });
    check('user linked to the custom profile', jobsUser.status === 201 && jobsUser.json.user.permissions.includes('openings:create'), jobsUser.json);
    check('profile in use cannot be deleted -> 409', (await A('DELETE', `/api/v1/profiles/${onlyJobs.json.profile.id}`)).status === 409);
    const jobsTok = (await activateUser(slugA, jobsEmail, jobsUser.json.tempPassword, 'Senha#Vagas9')).token;
    const J = (method: string, path: string, body?: unknown) => api(method, path, { token: jobsTok, body });
    check('custom profile: allowed routine works', (await J('GET', '/api/v1/openings')).status === 200);
    check('custom profile: everything else is denied', (await J('GET', '/api/v1/candidates')).status === 403 && (await J('GET', '/api/v1/dna')).status === 403);
    check('/me exposes effective permissions + profile', (await api('GET', '/api/auth/me', { token: jobsTok })).json.user?.profileName === 'Só Vagas');

    // Editing a profile applies immediately to the SAME session
    await A('PUT', `/api/v1/profiles/${onlyJobs.json.profile.id}`, { permissions: ['openings:create', 'dna:view'] });
    check('profile edit applies immediately (no re-login)', (await J('GET', '/api/v1/dna')).status === 200);

    // Individual exceptions on top of a profile
    const collab = (await A('GET', '/api/v1/users')).json.users.find((u: any) => u.profileId === 'collaborator');
    check('COLLABORATOR starts without candidates access', (await R('COLLABORATOR', 'GET', '/api/v1/candidates')).status === 403);
    const granted = await A('PATCH', `/api/v1/users/${collab.id}`, { permissions: [...collab.permissions, 'candidates:view'] });
    check('exception stored as a grant on top of the profile', granted.json.user?.grantedPermissions?.join() === 'candidates:view', granted.json);
    check('exception applies immediately', (await R('COLLABORATOR', 'GET', '/api/v1/candidates')).status === 200);
    const revoked = await A('PATCH', `/api/v1/users/${collab.id}`, { permissions: collab.permissions.filter((p: string) => p !== 'openings:view') });
    check('exception can also revoke a profile permission', revoked.json.user?.revokedPermissions?.join() === 'openings:view' && (await R('COLLABORATOR', 'GET', '/api/v1/openings')).status === 403, revoked.json);
    const toInterviewer = await A('PATCH', `/api/v1/users/${collab.id}`, { profileId: 'interviewer' });
    check('changing profile clears the exceptions', toInterviewer.json.user?.grantedPermissions?.length === 0 && toInterviewer.json.user.revokedPermissions.length === 0 && (await R('COLLABORATOR', 'GET', '/api/v1/interviews')).status === 200, toInterviewer.json);
    await A('PATCH', `/api/v1/users/${collab.id}`, { profileId: 'collaborator' });

    // Deactivating a link cuts access at once; the person can be reactivated
    const off = await A('PATCH', `/api/v1/users/${collab.id}`, { active: false });
    check('deactivated member loses the session', off.json.user?.active === false && (await R('COLLABORATOR', 'GET', '/api/v1/dna')).status === 401);
    check('deactivated member cannot log in', (await login(collab.email, 'Senha#COLLABORATOR9', slugA)).status === 403);
    check('reactivated member logs in again', ((await A('PATCH', `/api/v1/users/${collab.id}`, { active: true })).json.user?.active === true) && (await login(collab.email, 'Senha#COLLABORATOR9', slugA)).status === 200);

    // Nobody can grant what they do not hold, nor manage someone stronger, nor edit themselves
    const gmEmail = `gm-${suffix}@smoke.test`;
    const gmProfile = await A('POST', '/api/v1/profiles', { name: 'Gestor de Acesso', permissions: ['profiles:create', 'profiles:edit', 'users:create', 'users:edit', 'dna:view'] });
    const gm = await A('POST', '/api/v1/users', { name: 'GM', email: gmEmail, profileId: gmProfile.json.profile.id });
    const gmTok = (await activateUser(slugA, gmEmail, gm.json.tempPassword, 'Senha#GM99xx')).token;
    const G = (method: string, path: string, body?: unknown) => api(method, path, { token: gmTok, body });
    check('escalation: cannot create a profile with permissions you lack', (await G('POST', '/api/v1/profiles', { name: 'Poderoso', permissions: ['offers:edit'] })).status === 403);
    check('escalation: can create a profile within your own permissions', (await G('POST', '/api/v1/profiles', { name: 'Modesto', permissions: ['dna:view'] })).status === 201);
    check('escalation: cannot link a user to the admin profile', (await G('POST', '/api/v1/users', { name: 'Adm', email: `adm2-${suffix}@smoke.test`, profileId: 'admin' })).status === 403);
    check('escalation: cannot grant extra permissions through exceptions', (await G('POST', '/api/v1/users', { name: 'Ex', email: `ex-${suffix}@smoke.test`, profileId: 'collaborator', permissions: ['offers:edit'] })).status === 403);
    const adminMember = (await A('GET', '/api/v1/users')).json.users.find((u: any) => u.profileId === 'admin');
    check('escalation: cannot edit or reset an administrator', (await G('PATCH', `/api/v1/users/${adminMember.id}`, { active: false })).status === 403 && (await G('POST', `/api/v1/users/${adminMember.id}/reset-password`)).status === 403);
    check('cannot change your own access', (await A('PATCH', `/api/v1/users/${adminMember.id}`, { active: false })).status === 403);
    check('unknown user patch -> 404', (await A('PATCH', '/api/v1/users/usr-nope', { active: false })).status === 404);

    // ---- One person, several organizations ---------------------------------------------
    const multi = `multi.${suffix}@smoke.test`;
    const multiA = await A('POST', '/api/v1/users', { name: 'Multi', email: multi, profileId: 'recruiter' });
    check('multi: created in org A with a temp password', multiA.status === 201 && multiA.json.linkedExisting === false && !!multiA.json.tempPassword, multiA.json);
    await activateUser(slugA, multi, multiA.json.tempPassword, 'Senha#Multi9');
    // Only the Conta Mãe (master) can give one person access to a second organization
    const refused = await B('POST', '/api/v1/users', { name: 'Multi (B)', email: multi.toUpperCase(), profileId: 'collaborator' });
    check('multi: an ORGANIZATION admin cannot link an account that already exists (403, case-insensitive)', refused.status === 403 && /Conta Mãe/.test(refused.json.error), refused.json);
    check('multi: the refusal created nothing (still one link, one identity)', (await getPool().query('select (select count(*)::int from public.tenant_users where lower(email) = $1) l, (select count(*)::int from public.app_users where lower(email) = $1) i', [multi])).rows[0].l === 1);
    check('multi: a brand-new e-mail is still fine for an organization admin', (await B('POST', '/api/v1/users', { name: 'Novo B', email: `novob.${suffix}@smoke.test`, profileId: 'collaborator' })).status === 201);
    const multiB = await api('POST', `/api/master/tenants/${provB.json.tenant.id}/members`, { token: adminToken, body: { name: 'Multi (B)', email: multi.toUpperCase(), profileId: 'collaborator' } });
    check('multi: the Conta Mãe links the same person to org B (no new password, case-insensitive)', multiB.status === 201 && multiB.json.linkedExisting === true && multiB.json.tempPassword === undefined, multiB.json);
    check('multi: one identity, two links', (await getPool().query('select (select count(*)::int from public.app_users where lower(email) = $1) i, (select count(*)::int from public.tenant_users where lower(email) = $1) l', [multi])).rows[0].l === 2);
    const multiLogin = await login(multi, 'Senha#Multi9');
    check('multi: login lists both organizations', multiLogin.status === 200 && multiLogin.json.user?.memberships?.length === 2, multiLogin.json.user?.memberships);
    const multiTok: string = multiLogin.json.token;
    const M = (method: string, path: string, body?: unknown) => api(method, path, { token: multiTok, body });
    check('multi: enters the most recently used org (A) with the recruiter profile', multiLogin.json.user?.profileId === 'recruiter' && (await M('GET', '/api/v1/candidates')).status === 200);
    check('multi: login pinned to org B picks the B link (collaborator)', (await login(multi, 'Senha#Multi9', slugB)).json.user?.profileId === 'collaborator');
    const sw = await M('POST', '/api/auth/switch-organization', { tenantId: provB.json.tenant.id });
    check('multi: switching organization keeps the session and changes profile', sw.json.user?.tenantId === provB.json.tenant.id && sw.json.user.profileId === 'collaborator', sw.json);
    check("multi: after switching, data and permissions are org B's", (await M('GET', '/api/v1/context')).json.tenant?.slug === slugB && (await M('GET', '/api/v1/candidates')).status === 403 && (await M('GET', '/api/v1/dna')).status === 200);
    check('multi: cannot switch to an org without a link', (await M('POST', '/api/auth/switch-organization', { tenantId: 'tenant-techcorp' })).status === 403);
    const swBack = await M('POST', '/api/auth/switch-organization', { tenantId: provA.json.tenant.id });
    check('multi: can switch back', swBack.json.user?.profileId === 'recruiter');
    const multiMember = (await A('GET', '/api/v1/users')).json.users.find((u: any) => u.email === multi);
    check('multi: an org admin cannot reset the password of a shared identity -> 409', (await A('POST', `/api/v1/users/${multiMember.id}/reset-password`)).status === 409);
    const multiInB = (await B('GET', '/api/v1/users')).json.users.find((u: any) => u.email === multi);
    check('multi: org A cannot edit the link that belongs to org B', (await A('PATCH', `/api/v1/users/${multiInB.id}`, { active: true })).status === 404);
    check('multi: deactivating the link in B leaves access to A intact', (await B('PATCH', `/api/v1/users/${multiInB.id}`, { active: false })).status === 200 && (await login(multi, 'Senha#Multi9')).json.user?.tenantId === provA.json.tenant.id && (await login(multi, 'Senha#Multi9', slugB)).status === 403);

    // ---- Tenant module flow on org A ---------------------------------------------
    const dna = await A('PUT', '/api/v1/dna', { mission: 'Missão atualizada', culturalFitThreshold: 66 });
    check('update DNA', dna.json.dna?.mission === 'Missão atualizada' && dna.json.dna.culturalFitThreshold === 66, dna.json);

    const dept = await A('POST', '/api/v1/departments', { name: 'Tecnologia', headcountTarget: 20 });
    check('create department', dept.status === 201, dept.json);
    const deptId = dept.json.department.id;
    const pos = await A('POST', '/api/v1/positions', { title: 'Dev Smoke', departmentId: deptId, technicalRequirements: 'TS, Node', minSalary: 5000, maxSalary: 9000 });
    check('create position', pos.status === 201 && pos.json.position.technicalRequirements.length === 2, pos.json);
    check('position without department -> 400', (await A('POST', '/api/v1/positions', { title: 'No dept' })).status === 400);
    check('position with unknown department -> 400', (await A('POST', '/api/v1/positions', { title: 'x', departmentId: 'dep-nope' })).status === 400);
    const posId = pos.json.position.id;
    const job = await A('POST', '/api/v1/openings', { title: 'Vaga Smoke', positionId: posId, departmentId: deptId, openingsCount: 2, salaryOfferedMin: 6000, salaryOfferedMax: 8000 });
    check('create opening with 5 stages', job.status === 201 && job.json.opening.stages.length === 5, job.json);
    const jobId = job.json.opening.id;
    const cand = await A('POST', '/api/v1/candidates', { name: 'Cand Smoke', email: `cand-${suffix}@smoke.test`, skills: 'React, SQL' });
    check('create candidate', cand.status === 201 && cand.json.candidate.skills.length === 2, cand.json);
    const candId = cand.json.candidate.id;
    const app = await A('POST', '/api/v1/applications', { candidateId: candId, jobOpeningId: jobId });
    check('create application on first stage', app.status === 201 && app.json.application.currentStageId === 'stg-1', app.json);
    check('duplicate application -> 409', (await A('POST', '/api/v1/applications', { candidateId: candId, jobOpeningId: jobId })).status === 409);
    check('application unknown job -> 404', (await A('POST', '/api/v1/applications', { candidateId: candId, jobOpeningId: 'job-nope' })).status === 404);
    const appId = app.json.application.id;
    const moved = await A('PATCH', `/api/v1/applications/${appId}/stage`, { stageId: 'stg-3', status: 'advancing', note: 'Avançou' });
    check('move application', moved.json.application?.currentStageId === 'stg-3' && moved.json.application.notes.length === 2, moved.json);
    check('invalid stage -> 400', (await A('PATCH', `/api/v1/applications/${appId}/stage`, { stageId: 'stg-99' })).status === 400);
    check('invalid status -> 400', (await A('PATCH', `/api/v1/applications/${appId}/stage`, { status: 'flying' })).status === 400);
    const archivedApp = await A('PATCH', `/api/v1/applications/${appId}/stage`, { status: 'rejected', note: 'Candidatura arquivada. Motivo: perfil fora do requisito' });
    check('archive an application: status rejected, stage kept, reason in the history', archivedApp.json.application?.status === 'rejected' && archivedApp.json.application.currentStageId === 'stg-3' && /Motivo: perfil fora/.test(archivedApp.json.application.notes.at(-1)), archivedApp.json);
    const reactivated = await A('PATCH', `/api/v1/applications/${appId}/stage`, { status: 'in_review', note: 'Candidatura reativada.' });
    check('reactivate an archived application', reactivated.json.application?.status === 'in_review' && reactivated.json.application.currentStageId === 'stg-3' && reactivated.json.application.notes.length === archivedApp.json.application.notes.length + 1, reactivated.json);
    check('RBAC: only selection:edit can archive', (await R('INTERVIEWER', 'PATCH', `/api/v1/applications/${appId}/stage`, { status: 'rejected', note: 'x' })).status === 403);

    const ev = await A('POST', '/api/v1/ai/evaluate-candidate', { candidateId: candId, jobOpeningId: jobId });
    check('AI evaluation (Gemini or fallback)', ev.status === 201 && typeof ev.json.evaluation?.overallFitScore === 'number', ev.json);
    check('AI evaluation states its origin; a local estimate is labeled in the text too', ['gemini', 'heuristic'].includes(ev.json.evaluation?.source) && (ev.json.evaluation.source !== 'heuristic' || /^⚠ ESTIMATIVA LOCAL/.test(ev.json.evaluation.detailedExplanation)), ev.json);
    const evId = ev.json.evaluation?.id;
    const appAfter = (await A('GET', '/api/v1/applications')).json.applications.find((a: any) => a.id === appId);
    check('evaluation linked to application', appAfter?.aiEvaluationId === evId, appAfter);
    const reviewerName = (await A('GET', '/api/auth/me')).json.user?.name;
    const review = await A('PATCH', `/api/v1/ai/evaluations/${evId}/human-decision`, { decision: 'APPROVED', humanNotes: 'ok', reviewerName: 'Tester' });
    check('human review', review.json.evaluation?.humanReviewerDecision === 'APPROVED');
    check('human review is signed by the logged-in user, never by a name sent in the request', !!reviewerName && review.json.evaluation?.reviewedBy === reviewerName, review.json);
    check('OVERRIDDEN is an accepted human decision', (await A('PATCH', `/api/v1/ai/evaluations/${evId}/human-decision`, { decision: 'OVERRIDDEN', humanNotes: 'divergi da IA' })).json.evaluation?.humanReviewerDecision === 'OVERRIDDEN');
    check('invalid human decision -> 400', (await A('PATCH', `/api/v1/ai/evaluations/${evId}/human-decision`, { decision: 'MAYBE' })).status === 400);

    // ---- Uso da IA (Conta Mãe): consumo registrado, limites por organização, pausa e regras
    const tenantAId = provA.json.tenant.id as string;
    const SU = (method: string, path: string, body?: unknown) => api(method, path, { token: adminToken, body });
    const aiRow = async () => (await SU('GET', '/api/master/ai/overview?period=this_month')).json.overview?.organizations?.find((o: any) => o.tenantId === tenantAId);
    const ov0 = await SU('GET', '/api/master/ai/overview?period=this_month');
    const row0 = ov0.json.overview?.organizations?.find((o: any) => o.tenantId === tenantAId);
    check('AI usage panel: SuperAdmin reads it and the evaluation above was recorded for the organization', ov0.status === 200 && !!row0 && row0.evaluations + row0.withoutAi >= 1 && typeof ov0.json.overview.totals.costBrl === 'number', row0);
    check('AI usage panel: an organization admin cannot open it (403)', (await A('GET', '/api/master/ai/overview')).status === 403 && (await A('PATCH', '/api/master/ai/settings', { enabled: false })).status === 403);
    check('AI usage panel: invalid rules are refused (400)', (await SU('PATCH', '/api/master/ai/settings', { monthlyBudgetBrl: -5 })).status === 400 && (await SU('PATCH', '/api/master/ai/settings', {})).status === 400 && (await SU('PATCH', '/api/master/ai/settings', { onLimit: 'x' })).status === 400);
    check('AI usage panel: limit of an unknown organization -> 404; invalid limit -> 400', (await SU('PUT', '/api/master/ai/organizations/nao-existe/limit', { monthlyLimit: 3 })).status === 404 && (await SU('PUT', `/api/master/ai/organizations/${tenantAId}/limit`, { monthlyLimit: -1 })).status === 400);

    const policyBefore = ov0.json.overview.settings.onLimit;
    await SU('PATCH', '/api/master/ai/settings', { onLimit: 'estimate' });
    check('limit 0 for the organization is saved', (await SU('PUT', `/api/master/ai/organizations/${tenantAId}/limit`, { monthlyLimit: 0 })).status === 200);
    const capped = await A('POST', '/api/v1/ai/evaluate-candidate', { candidateId: candId, jobOpeningId: jobId });
    // A re-analysis that cannot use the AI keeps a real evaluation already on record (200 + notice); with none, the labeled estimate is saved (201)
    const estimateOrKept = (r: any, why: RegExp) => r.json.kept
      ? r.status === 200 && why.test(r.json.notice ?? '')
      : r.status === 201 && r.json.evaluation?.source === 'heuristic' && why.test(r.json.evaluation.detailedExplanation);
    check('over the limit (policy "estimate"): no AI cost; the answer is the labeled local estimate (or the previous real evaluation, kept) and says why', estimateOrKept(capped, /limite mensal/), capped.json);
    await SU('PATCH', '/api/master/ai/settings', { onLimit: 'block' });
    const overLimit = await A('POST', '/api/v1/ai/evaluate-candidate', { candidateId: candId, jobOpeningId: jobId });
    check('over the limit (policy "block"): 429 with a plain message and no evaluation created', overLimit.status === 429 && /limite mensal/.test(overLimit.json.error ?? ''), overLimit.json);
    await SU('PATCH', '/api/master/ai/settings', { onLimit: policyBefore });
    const rowCapped = await aiRow();
    check('AI usage panel: the organization shows its own limit and the attempts that did not use the AI', rowCapped?.monthlyLimit === 0 && rowCapped.limitSource === 'custom' && rowCapped.withoutAi >= 2, rowCapped);
    check('removing the organization limit brings the platform default back', (await SU('PUT', `/api/master/ai/organizations/${tenantAId}/limit`, { monthlyLimit: null })).status === 200 && (await aiRow())?.limitSource !== 'custom');

    await SU('PATCH', '/api/master/ai/settings', { enabled: false });
    const paused = await A('POST', '/api/v1/ai/evaluate-candidate', { candidateId: candId, jobOpeningId: jobId });
    check('AI paused by the platform: evaluations still work (labeled local estimate, or the previous real evaluation kept) and say why', estimateOrKept(paused, /pausada/), paused.json);
    check('AI usage panel: pause switch is reflected and can be turned back on', (await SU('PATCH', '/api/master/ai/settings', { enabled: true })).json.settings?.enabled === true);

    // Organization that does not use the AI: the contract switch hides everything (old evaluations stay stored and come back if it is turned on again)
    const listWithAI = await A('GET', '/api/v1/ai/evaluations');
    check('org with the AI module lists its evaluations', listWithAI.status === 200 && listWithAI.json.evaluations.length >= 1, listWithAI.json);
    await SU('PATCH', `/api/master/tenants/${tenantAId}`, { enabledRoutines: PLAN_ROUTINES.Scale.filter(k => k !== 'ai_evaluation') });
    const listNoAI = await A('GET', '/api/v1/ai/evaluations');
    const ctxNoAI = await A('GET', '/api/v1/context');
    check('org without the AI module: no evaluation is returned and the context says the module is off', listNoAI.status === 200 && listNoAI.json.evaluations.length === 0 && Array.isArray(ctxNoAI.json.tenant?.enabledRoutines) && !ctxNoAI.json.tenant.enabledRoutines.includes('ai_evaluation'), [listNoAI.json, ctxNoAI.json.tenant?.enabledRoutines]);
    await SU('PATCH', `/api/master/tenants/${tenantAId}`, { enabledRoutines: PLAN_ROUTINES.Scale });
    check('turning the AI module back on brings the evaluations back', (await A('GET', '/api/v1/ai/evaluations')).json.evaluations?.length >= 1);

    const intv = await A('POST', '/api/v1/interviews', { jobOpeningId: jobId, candidateId: candId });
    check('create interview', intv.status === 201, intv.json);
    check('INTERVIEWER can fill a scorecard', (await api('PATCH', `/api/v1/interviews/${intv.json.interview.id}/scorecard`, { token: tokens.INTERVIEWER, body: { scorecard: [{ competency: 'X', score: 5, notes: 'top' }], recommendation: 'STRONG_YES', overallFeedback: 'ótimo' } })).json.interview?.status === 'completed');
    const offer = await A('POST', '/api/v1/offers', { jobOpeningId: jobId, candidateId: candId, baseSalary: 8000 });
    check('create offer', offer.status === 201, offer.json);
    check('offer sent sets sentAt', !!(await A('PATCH', `/api/v1/offers/${offer.json.offer.id}/status`, { status: 'sent' })).json.offer?.sentAt);
    check('invalid offer status -> 400', (await A('PATCH', `/api/v1/offers/${offer.json.offer.id}/status`, { status: 'bogus' })).status === 400);


    // ---- Edição dos cards (PATCH) -------------------------------------------------------------
    const someUserId = (await A('GET', '/api/v1/users')).json.users[0].id;
    // the first recruiter session was killed by the password-reset check above: use a fresh recruiter for the edit checks
    const rec2Email = `recruiter2-${suffix}@smoke.test`;
    const rec2 = await A('POST', '/api/v1/users', { name: 'U RECRUITER2', email: rec2Email, profileId: 'recruiter', jobTitle: 'RECRUITER' });
    tokens.RECRUITER = (await activateUser(slugA, rec2Email, rec2.json.tempPassword, 'Senha#REC2x9')).token;
    check('fresh RECRUITER can activate', !!tokens.RECRUITER, rec2.json);
    const dp = `/api/v1/departments/${deptId}`;
    const ed = await A('PATCH', dp, { name: 'Depto Editado', headcountTarget: 25, costCenter: 'CC-777' });
    check('edit department', ed.json.department?.name === 'Depto Editado' && ed.json.department.headcountTarget === 25 && ed.json.department.costCenter === 'CC-777' && ed.json.department.code, ed.json);
    check('edit department: negative headcount -> 400', (await A('PATCH', dp, { headcountTarget: -5 })).status === 400);
    check('edit department: non numeric headcount -> 400', (await A('PATCH', dp, { headcountTarget: 'abc' })).status === 400);
    check('edit department: empty name -> 400', (await A('PATCH', dp, { name: '  ' })).status === 400);
    check('edit department: itself as parent -> 400', (await A('PATCH', dp, { parentId: deptId })).status === 400);
    const child = await A('POST', '/api/v1/departments', { name: 'Subarea Smoke' });
    check('edit department: sub-area under a parent', (await A('PATCH', `/api/v1/departments/${child.json.department.id}`, { parentId: deptId })).json.department?.parentId === deptId);
    check('edit department: cycle (parent under its own sub-area) -> 400', (await A('PATCH', dp, { parentId: child.json.department.id })).status === 400);
    check('edit department: unknown parent -> 400', (await A('PATCH', dp, { parentId: 'dep-nope' })).status === 400);
    check('edit department: unknown manager -> 400', (await A('PATCH', dp, { managerId: 'usr-nope' })).status === 400);
    check('edit department: set and clear manager', (await A('PATCH', dp, { managerId: someUserId })).json.department?.managerId === someUserId && (await A('PATCH', dp, { managerId: null })).json.department?.managerId === undefined);
    check('edit department: unknown id -> 404', (await A('PATCH', '/api/v1/departments/dep-nope', { name: 'x' })).status === 404);
    check('RBAC: RECRUITER cannot edit departments', (await R('RECRUITER', 'PATCH', dp, { name: 'x' })).status === 403);
    check('isolation: org B cannot edit org A department', (await B('PATCH', dp, { name: 'hack' })).status === 404);

    const pp = `/api/v1/positions/${posId}`;
    const ep = await A('PATCH', pp, { title: 'Dev Editado', level: 'Sênior', minSalary: 7000, maxSalary: 12000, technicalRequirements: ['Go', 'SQL'], status: 'active' });
    check('edit position', ep.json.position?.title === 'Dev Editado' && ep.json.position.level === 'Sênior' && ep.json.position.maxSalary === 12000 && ep.json.position.technicalRequirements.join() === 'Go,SQL', ep.json);
    check('edit position: max below min -> 400', (await A('PATCH', pp, { maxSalary: 1000 })).status === 400);
    check('edit position: invalid level -> 400', (await A('PATCH', pp, { level: 'Deus' })).status === 400);
    check('edit position: invalid career track -> 400', (await A('PATCH', pp, { careerTrack: 'X' })).status === 400);
    check('edit position: unknown department -> 400', (await A('PATCH', pp, { departmentId: 'dep-nope' })).status === 400);
    check('edit position: unknown id -> 404', (await A('PATCH', '/api/v1/positions/pos-nope', { title: 'x' })).status === 404);
    check('RBAC: RECRUITER cannot edit positions', (await R('RECRUITER', 'PATCH', pp, { title: 'x' })).status === 403);
    check('isolation: org B cannot edit org A position', (await B('PATCH', pp, { title: 'hack' })).status === 404);

    const op = `/api/v1/openings/${jobId}`;
    const eo = await A('PATCH', op, { title: 'Vaga Editada', slaDays: 45, workModel: 'Remoto', location: 'Curitiba', customQuestions: ['Por que nós?', 'Disponibilidade?'], salaryOfferedMin: 7000, salaryOfferedMax: 9000 });
    check('edit opening', eo.json.opening?.title === 'Vaga Editada' && eo.json.opening.slaDays === 45 && eo.json.opening.workModel === 'Remoto' && eo.json.opening.customQuestions.length === 2, eo.json);
    check('edit opening: stages are untouched', eo.json.opening?.stages?.length === 5);
    check('edit opening: zero positions -> 400', (await A('PATCH', op, { openingsCount: 0 })).status === 400);
    check('edit opening: invalid work model -> 400', (await A('PATCH', op, { workModel: 'Lua' })).status === 400);
    check('edit opening: invalid status -> 400', (await A('PATCH', op, { status: 'voando' })).status === 400);
    check('edit opening: salary max below min -> 400', (await A('PATCH', op, { salaryOfferedMax: 100 })).status === 400);
    check('edit opening: unknown recruiter -> 400', (await A('PATCH', op, { recruiterId: 'usr-nope' })).status === 400);
    check('edit opening: bad target date -> 400', (await A('PATCH', op, { targetFillDate: 'ontem' })).status === 400);
    check('edit opening: clear the offered salary', (await A('PATCH', op, { salaryOfferedMin: null, salaryOfferedMax: null })).json.opening?.salaryOfferedMin === undefined);
    check('edit opening: unknown id -> 404', (await A('PATCH', '/api/v1/openings/job-nope', { title: 'x' })).status === 404);
    check('RBAC: RECRUITER can edit openings', (await R('RECRUITER', 'PATCH', op, { location: 'Recife' })).json.opening?.location === 'Recife');
    check('RBAC: HIRING_MANAGER cannot edit openings', (await R('HIRING_MANAGER', 'PATCH', op, { location: 'x' })).status === 403);
    check('isolation: org B cannot edit org A opening', (await B('PATCH', op, { title: 'hack' })).status === 404);

    const cp = `/api/v1/candidates/${candId}`;
    const ec = await A('PATCH', cp, { name: 'Candidata Editada', skills: ['React', 'Node'], linkedinUrl: 'https://linkedin.com/in/teste', yearsOfExperience: 8 });
    check('edit candidate', ec.json.candidate?.name === 'Candidata Editada' && ec.json.candidate.skills.join() === 'React,Node' && ec.json.candidate.yearsOfExperience === 8 && ec.json.candidate.linkedinUrl, ec.json);
    check('edit candidate: invalid e-mail -> 400', (await A('PATCH', cp, { email: 'sem-arroba' })).status === 400);
    check('edit candidate: LinkedIn without protocol -> 400', (await A('PATCH', cp, { linkedinUrl: 'linkedin.com/in/x' })).status === 400);
    check('edit candidate: negative experience -> 400', (await A('PATCH', cp, { yearsOfExperience: -1 })).status === 400);
    check('edit candidate: clear LinkedIn', (await A('PATCH', cp, { linkedinUrl: '' })).json.candidate?.linkedinUrl === undefined);
    check('edit candidate: unknown id -> 404', (await A('PATCH', '/api/v1/candidates/cand-nope', { name: 'x' })).status === 404);
    check('RBAC: RECRUITER can edit candidates', (await R('RECRUITER', 'PATCH', cp, { location: 'Salvador' })).json.candidate?.location === 'Salvador');
    check('RBAC: HIRING_MANAGER and INTERVIEWER cannot edit candidates', (await R('HIRING_MANAGER', 'PATCH', cp, { location: 'x' })).status === 403 && (await R('INTERVIEWER', 'PATCH', cp, { location: 'x' })).status === 403);
    check('isolation: org B cannot edit org A candidate', (await B('PATCH', cp, { name: 'hack' })).status === 404);

    const offer2 = await A('POST', '/api/v1/offers', { jobOpeningId: jobId, candidateId: candId, baseSalary: 9000, benefits: ['VR'] });
    const o2 = `/api/v1/offers/${offer2.json.offer.id}`;
    const eof = await A('PATCH', o2, { baseSalary: 9500, benefits: ['VR', 'VA'], contractType: 'PJ', startDate: '2027-01-10', notes: 'ajustada' });
    check('edit offer while pending approval', eof.json.offer?.baseSalary === 9500 && eof.json.offer.contractType === 'PJ' && eof.json.offer.startDate === '2027-01-10' && eof.json.offer.benefits.join() === 'VR,VA' && eof.json.offer.status === 'pending_approval', eof.json);
    check('edit offer: invalid contract -> 400', (await A('PATCH', o2, { contractType: 'MEI' })).status === 400);
    check('edit offer: invalid start date -> 400', (await A('PATCH', o2, { startDate: '10/01/2027' })).status === 400);
    check('edit offer: negative salary -> 400', (await A('PATCH', o2, { baseSalary: -1 })).status === 400);
    await A('PATCH', `${o2}/status`, { status: 'approved' });
    check('edit offer: changing terms of an approved offer sends it back to approval', (await A('PATCH', o2, { baseSalary: 10000 })).json.offer?.status === 'pending_approval');
    await A('PATCH', `${o2}/status`, { status: 'approved' });
    check('edit offer: only notes keeps the approval', (await A('PATCH', o2, { notes: 'só uma nota' })).json.offer?.status === 'approved');
    await A('PATCH', `${o2}/status`, { status: 'sent' });
    check('edit offer: a sent offer is locked -> 400', (await A('PATCH', o2, { baseSalary: 1 })).status === 400);
    check('edit offer: the accepted/sent offer of the hire flow is locked too', (await A('PATCH', `/api/v1/offers/${offer.json.offer.id}`, { baseSalary: 1 })).status === 400);
    check('edit offer: unknown id -> 404', (await A('PATCH', '/api/v1/offers/off-nope', { baseSalary: 1 })).status === 404);
    check('RBAC: INTERVIEWER cannot edit offers', (await R('INTERVIEWER', 'PATCH', o2, { notes: 'x' })).status === 403);
    check('isolation: org B cannot edit org A offer', (await B('PATCH', o2, { notes: 'hack' })).status === 404);
    const recruiterMe = await api('GET', '/api/auth/me', { token: tokens.RECRUITER });
    check('profile defaults: RECRUITER holds openings:edit + candidates:edit and not structure:edit', (recruiterMe.json.user?.permissions ?? []).filter((p: string) => ['openings:edit', 'candidates:edit', 'structure:edit', 'positions:edit'].includes(p)).sort().join() === 'candidates:edit,openings:edit', recruiterMe);

    // ---- Contratação: o aceite abre o onboarding + pasta de admissão -----------------
    const accepted = await A('PATCH', `/api/v1/offers/${offer.json.offer.id}/status`, { status: 'accepted' });
    check('accept offer', accepted.json.offer?.status === 'accepted', accepted.json);
    const journeys = (await A('GET', '/api/v1/onboardings')).json.onboardings ?? [];
    const journey = journeys.find((j: any) => j.candidateId === candId);
    check('accepted offer opens the onboarding journey', !!journey && !!journey.jobTitle && !!journey.hireDate, journey);
    check('journey has an admission folder (CLT items, contract included, no PJ-only items)',
      journey?.admission?.length > 0 && journey.admission.some((i: any) => i.title === 'Contrato de trabalho assinado') && !journey.admission.some((i: any) => /prestação de serviços/.test(i.title)), journey?.admission?.length);
    await A('PATCH', `/api/v1/offers/${offer.json.offer.id}/status`, { status: 'accepted' });
    check('accepting twice does not duplicate the journey', ((await A('GET', '/api/v1/onboardings')).json.onboardings ?? []).filter((j: any) => j.candidateId === candId).length === 1);
    check('application marked as hired', (await A('GET', '/api/v1/applications')).json.applications.find((a: any) => a.id === appId)?.status === 'hired');
    check('opening seat counted once', (await A('GET', '/api/v1/openings')).json.openings.find((o: any) => o.id === jobId)?.filledCount === 1);

    const upload = (token: string, jid: string, iid: string, body: Buffer | string, type: string, name = 'doc.pdf') =>
      fetch(`${BASE}/api/v1/onboardings/${jid}/admission/${iid}/file?name=${encodeURIComponent(name)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': type }, body: body as any
      }).then(async r => ({ status: r.status, json: (await r.json().catch(() => ({}))) as any }));
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    const docItem = journey.admission.find((i: any) => i.requiresDocument && i.required);
    const stepItem = journey.admission.find((i: any) => !i.requiresDocument);
    const jp = `/api/v1/onboardings/${journey.id}/admission`;

    const up = await upload(adminA, journey.id, docItem.id, pdf, 'application/pdf', 'Meu RG ç.pdf');
    const upItem = up.json.onboarding?.admission?.find((i: any) => i.id === docItem.id);
    check('upload PDF -> item in review with file metadata', up.status === 201 && upItem?.status === 'submitted' && upItem.file?.size === pdf.length, up.json);
    if (upItem?.file?.path) storedFiles.add(upItem.file.path);
    check('upload: disallowed type -> 400', (await upload(adminA, journey.id, docItem.id, 'x=1', 'text/plain')).status === 400);
    check('upload: content that is not a PDF -> 400', (await upload(adminA, journey.id, docItem.id, 'nao sou pdf', 'application/pdf')).status === 400);
    check('upload: empty body -> 400', (await upload(adminA, journey.id, docItem.id, '', 'application/pdf')).status === 400);
    check('upload to a step item -> 400', (await upload(adminA, journey.id, stepItem.id, pdf, 'application/pdf')).status === 400);
    check('upload: unknown item -> 404', (await upload(adminA, journey.id, 'adi-nope', pdf, 'application/pdf')).status === 404);
    check('upload denied without onboarding:edit', (await upload(tokens.INTERVIEWER, journey.id, docItem.id, pdf, 'application/pdf')).status === 403);
    const dl = await fetch(`${BASE}${jp}/${docItem.id}/file`, { headers: { Authorization: `Bearer ${adminA}` } });
    const dlBytes = Buffer.from(await dl.arrayBuffer());
    check('download returns the same bytes as a private attachment', dl.status === 200 && dlBytes.equals(pdf) && /attachment/.test(dl.headers.get('content-disposition') ?? '') && /no-store/.test(dl.headers.get('cache-control') ?? ''), dl.status);
    check('download denied without onboarding:view', (await fetch(`${BASE}${jp}/${docItem.id}/file`, { headers: { Authorization: `Bearer ${tokens.INTERVIEWER}` } })).status === 403);
    check('download: item without file -> 404', (await fetch(`${BASE}${jp}/${stepItem.id}/file`, { headers: { Authorization: `Bearer ${adminA}` } })).status === 404);

    check('review: reject needs a reason -> 400', (await A('PATCH', `${jp}/${docItem.id}`, { action: 'reject' })).status === 400);
    check('review: invalid action -> 400', (await A('PATCH', `${jp}/${docItem.id}`, { action: 'explode' })).status === 400);
    const rejected = (await A('PATCH', `${jp}/${docItem.id}`, { action: 'reject', note: 'ilegível' })).json.onboarding?.admission.find((i: any) => i.id === docItem.id);
    check('review: reject stores the reason', rejected?.status === 'rejected' && rejected.reviewNote === 'ilegível', rejected);
    check('review: cannot approve a rejected document without a new upload -> 400', (await A('PATCH', `${jp}/${docItem.id}`, { action: 'approve' })).status === 400);
    const reup = await upload(adminA, journey.id, docItem.id, pdf, 'application/pdf', 'novo.pdf');
    const reItem = reup.json.onboarding?.admission?.find((i: any) => i.id === docItem.id);
    check('re-upload replaces the file and goes back to review', reup.status === 201 && reItem?.status === 'submitted' && reItem.file?.name === 'novo.pdf' && !reItem.reviewNote, reup.json);
    if (reItem?.file?.path) storedFiles.add(reItem.file.path);
    const approved = (await A('PATCH', `${jp}/${docItem.id}`, { action: 'approve' })).json.onboarding?.admission.find((i: any) => i.id === docItem.id);
    check('review: approve + history recorded', approved?.status === 'approved' && approved.history.length >= 4, approved?.history);
    check('step item: cannot be rejected -> 400', (await A('PATCH', `${jp}/${stepItem.id}`, { action: 'reject', note: 'x' })).status === 400);
    check('step item: mark as done', (await A('PATCH', `${jp}/${stepItem.id}`, { action: 'approve' })).json.onboarding?.admission.find((i: any) => i.id === stepItem.id)?.status === 'approved');
    check('reopen sends a step back to pending', (await A('PATCH', `${jp}/${stepItem.id}`, { action: 'reopen' })).json.onboarding?.admission.find((i: any) => i.id === stepItem.id)?.status === 'pending');

    const extraItem = await A('POST', jp, { title: 'Declaração extra', category: 'Contratuais', responsible: 'Jurídico', requiresDocument: true });
    check('add a custom item to one hire', extraItem.status === 201 && extraItem.json.onboarding.admission.length === journey.admission.length + 1, extraItem.json);
    check('custom item: invalid category -> 400', (await A('POST', jp, { title: 'x', category: 'Inexistente' })).status === 400);
    // Modelo: o RH escolhe quais itens levar; nada entra sem ser escolhido
    check('available: all starter CLT items are already in the folder', ((await A('GET', `${jp}/available`)).json.templates ?? []).length === 0);
    const extraTpl = await A('POST', '/api/v1/admission-templates', { name: 'Exame toxicológico', category: 'Exames', contractTypes: ['CLT'], required: false });
    const avail = (await A('GET', `${jp}/available`)).json.templates ?? [];
    check('available: a new CLT catalog item is offered (and PJ-only ones are not)', avail.length === 1 && avail[0].id === extraTpl.json.template?.id, avail);
    check('apply-template without templateIds -> 400', (await A('POST', `${jp}/apply-template`, {})).status === 400);
    check('apply-template with an empty selection -> 400', (await A('POST', `${jp}/apply-template`, { templateIds: [] })).status === 400);
    check('apply-template with an unavailable item -> 400', (await A('POST', `${jp}/apply-template`, { templateIds: ['adt-nope'] })).status === 400);
    const chosen = await A('POST', `${jp}/apply-template`, { templateIds: [extraTpl.json.template.id] });
    check('apply-template brings only the chosen item', chosen.json.onboarding?.admission.length === journey.admission.length + 2 && chosen.json.onboarding.admission.some((i: any) => i.title === 'Exame toxicológico'), chosen.json);
    check('apply-template twice does not duplicate -> 400', (await A('POST', `${jp}/apply-template`, { templateIds: [extraTpl.json.template.id] })).status === 400);
    const toxId = chosen.json.onboarding.admission.find((i: any) => i.title === 'Exame toxicológico').id;
    check('org B cannot list or apply the folder items of org A', (await B('GET', `${jp}/available`)).status === 404 && (await B('POST', `${jp}/apply-template`, { templateIds: [extraTpl.json.template.id] })).status === 404);
    check('remove: a document with a file cannot be removed -> 400', (await A('DELETE', `${jp}/${docItem.id}`)).status === 400);
    check('remove: unknown item -> 404', (await A('DELETE', `${jp}/adi-nope`)).status === 404);
    check('remove denied without onboarding:edit', (await R('INTERVIEWER', 'DELETE', `${jp}/${toxId}`)).status === 403);
    check('remove: a pending item without file is removed', (await A('DELETE', `${jp}/${toxId}`)).json.onboarding?.admission.length === journey.admission.length + 1);
    check('removed item is offered again by the model', ((await A('GET', `${jp}/available`)).json.templates ?? []).some((t: any) => t.id === extraTpl.json.template.id));

    const tpls = await A('GET', '/api/v1/admission-templates');
    check('catalog starts with the starter set (CLT + PJ + steps)', tpls.json.templates?.length >= 20 && tpls.json.templates.some((t: any) => !t.requiresDocument), tpls.json.templates?.length);
    check('catalog: invalid category -> 400', (await A('POST', '/api/v1/admission-templates', { name: 'x', category: 'Nada' })).status === 400);
    check('catalog: no contract type -> 400', (await A('POST', '/api/v1/admission-templates', { name: 'x', category: 'Exames', contractTypes: [] })).status === 400);
    check('catalog: due days out of range -> 400', (await A('POST', '/api/v1/admission-templates', { name: 'x', category: 'Exames', dueDaysBeforeStart: 500 })).status === 400);
    const newTpl = await A('POST', '/api/v1/admission-templates', { name: 'Curso NR-10', category: 'Exames', contractTypes: ['PJ'], responsible: 'RH' });
    check('catalog: create item', newTpl.status === 201 && newTpl.json.template.active === true, newTpl.json);
    check('catalog: duplicate name -> 409', (await A('POST', '/api/v1/admission-templates', { name: 'curso nr-10', category: 'Exames' })).status === 409);
    check('catalog: deactivate item', (await A('PATCH', `/api/v1/admission-templates/${newTpl.json.template.id}`, { active: false })).json.template?.active === false);
    check('catalog edit denied without onboarding:edit', (await R('INTERVIEWER', 'POST', '/api/v1/admission-templates', { name: 'y', category: 'Exames' })).status === 403);

    check('isolation: org B cannot see org A admission catalog items', !(await B('GET', '/api/v1/admission-templates')).json.templates?.some((t: any) => t.id === newTpl.json.template.id));
    check('isolation: org B cannot download org A documents', (await fetch(`${BASE}${jp}/${docItem.id}/file`, { headers: { Authorization: `Bearer ${adminB}` } })).status === 404);
    check('isolation: org B cannot review org A documents', (await B('PATCH', `${jp}/${docItem.id}`, { action: 'reopen' })).status === 404);
    check('isolation: org B cannot upload to org A journey', (await upload(adminB, journey.id, docItem.id, pdf, 'application/pdf')).status === 404);

    // ---- Checklist de Integração: modelo por organização + itens escolhidos por contratação --------
    const ck = `/api/v1/onboardings/${journey.id}/checklist`;
    const fresh = async () => ((await A('GET', '/api/v1/onboardings')).json.onboardings ?? []).find((j: any) => j.candidateId === candId);
    const j0 = await fresh();
    check('hire creates the checklist from the model (8 tasks, sorted by due day, none about the contract)',
      j0.checklists.length === 8 && j0.checklists.every((c: any) => c.templateId && c.status === 'pending') &&
      j0.checklists.every((c: any, i: number, arr: any[]) => i === 0 || arr[i - 1].dueDateDay <= c.dueDateDay) &&
      !j0.checklists.some((c: any) => /contrato/i.test(c.title)), j0.checklists.map((c: any) => c.title));
    const c1 = j0.checklists[0], c2 = j0.checklists[1];
    check('checklist: toggle an item still works', (await A('PATCH', `${ck}/${c1.id}`, { status: 'completed' })).json.onboarding?.checklists.find((c: any) => c.id === c1.id)?.status === 'completed');
    check('checklist: a started item cannot be removed -> 400', (await A('DELETE', `${ck}/${c1.id}`)).status === 400);
    check('checklist: unknown item -> 404', (await A('DELETE', `${ck}/chk-nope`)).status === 404);
    check('checklist: remove denied without onboarding:edit', (await R('INTERVIEWER', 'DELETE', `${ck}/${c2.id}`)).status === 403);
    check('checklist: a pending item is removed', (await A('DELETE', `${ck}/${c2.id}`)).json.onboarding?.checklists.length === 7);
    const avail2 = (await A('GET', `/api/v1/onboardings/${journey.id}/checklist-available`)).json.templates ?? [];
    check('checklist: the removed task is offered again by the model (only it)', avail2.length === 1 && avail2[0].id === c2.templateId, avail2);
    const capply = `/api/v1/onboardings/${journey.id}/checklist-apply`;
    check('checklist: apply without templateIds -> 400', (await A('POST', capply, {})).status === 400);
    check('checklist: apply with an empty selection -> 400', (await A('POST', capply, { templateIds: [] })).status === 400);
    check('checklist: apply with an unavailable item -> 400', (await A('POST', capply, { templateIds: ['igt-nope'] })).status === 400);
    check('checklist: apply brings only the chosen task back', (await A('POST', capply, { templateIds: [c2.templateId] })).json.onboarding?.checklists.length === 8);
    check('checklist: applying twice does not duplicate -> 400', (await A('POST', capply, { templateIds: [c2.templateId] })).status === 400);
    check('checklist: apply denied without onboarding:edit', (await R('INTERVIEWER', 'POST', capply, { templateIds: [c2.templateId] })).status === 403);
    const custom = await A('POST', ck, { title: 'Treinamento da ferramenta X', category: 'Treinamento Técnico', assignedToRole: 'RH', dueDateDay: 10 });
    check('checklist: add a one-off task', custom.status === 201 && custom.json.onboarding.checklists.length === 9 && custom.json.onboarding.checklists.some((c: any) => c.title === 'Treinamento da ferramenta X' && c.dueDateDay === 10), custom.json);
    check('checklist: one-off task with invalid category -> 400', (await A('POST', ck, { title: 'x', category: 'Nada' })).status === 400);
    check('checklist: one-off task with invalid due day -> 400', (await A('POST', ck, { title: 'x', dueDateDay: 999 })).status === 400);
    check('checklist: one-off task with invalid responsible -> 400', (await A('POST', ck, { title: 'x', assignedToRole: 'Ninguém' })).status === 400);

    const itpls = await A('GET', '/api/v1/integration-templates');
    check('integration model starts with the starter set', itpls.json.templates?.length === 8, itpls.json.templates?.length);
    check('integration model: invalid category -> 400', (await A('POST', '/api/v1/integration-templates', { name: 'x', category: 'Nada' })).status === 400);
    check('integration model: invalid responsible -> 400', (await A('POST', '/api/v1/integration-templates', { name: 'x', category: 'Documentação', responsible: 'Ninguém' })).status === 400);
    check('integration model: negative due day -> 400', (await A('POST', '/api/v1/integration-templates', { name: 'x', category: 'Documentação', dueDay: -1 })).status === 400);
    const itpl = await A('POST', '/api/v1/integration-templates', { name: 'Almoço com o time', category: 'Cultura & Boas-Vindas', responsible: 'Gestor', dueDay: 5 });
    check('integration model: create task', itpl.status === 201 && itpl.json.template.active === true && itpl.json.template.dueDay === 5, itpl.json);
    check('integration model: duplicate name -> 409', (await A('POST', '/api/v1/integration-templates', { name: 'almoço com o time', category: 'Documentação' })).status === 409);
    check('integration model: new task is offered to open journeys', ((await A('GET', `/api/v1/onboardings/${journey.id}/checklist-available`)).json.templates ?? []).some((t: any) => t.id === itpl.json.template.id));
    check('integration model: deactivated task is no longer offered', (await A('PATCH', `/api/v1/integration-templates/${itpl.json.template.id}`, { active: false })).json.template?.active === false && !((await A('GET', `/api/v1/onboardings/${journey.id}/checklist-available`)).json.templates ?? []).some((t: any) => t.id === itpl.json.template.id));
    check('integration model: edit denied without onboarding:edit', (await R('INTERVIEWER', 'POST', '/api/v1/integration-templates', { name: 'y', category: 'Documentação' })).status === 403);
    check('isolation: org B cannot see org A integration model items', !((await B('GET', '/api/v1/integration-templates')).json.templates ?? []).some((t: any) => t.id === itpl.json.template.id));
    check('isolation: org B cannot touch org A checklist', (await B('GET', `/api/v1/onboardings/${journey.id}/checklist-available`)).status === 404 && (await B('DELETE', `${ck}/${c1.id}`)).status === 404 && (await B('POST', ck, { title: 'x' })).status === 404);
    check('turnover alert', (await A('POST', '/api/v1/retention/alert', { collaboratorName: 'Fulano', riskLevel: 'Alto', earlyWarningSignals: 'faltas, queda', suggestedActions: '1:1' })).status === 201);

    // ---- Desenvolvimento (PDI): PDI da contratação, metas, andamento e 1:1s ------------------
    const devList = await A('GET', '/api/v1/development');
    const hirePdi = (devList.json.developmentRecords ?? []).find((r: any) => r.collaboratorId === candId);
    check('the hire opens an empty PDI automatically', !!hirePdi && hirePdi.goals.length === 0 && hirePdi.oneOnOnes.length === 0 && hirePdi.lastReviewDate === '' && hirePdi.nextReviewDate === '' && !!hirePdi.hireDate && !!hirePdi.jobTitle, hirePdi);
    check('accepting twice does not duplicate the PDI', (devList.json.developmentRecords ?? []).filter((r: any) => r.collaboratorId === candId).length === 1);
    check('PDI list carries the department/manager names', Array.isArray(devList.json.lookups?.departments) && devList.json.lookups?.members?.some((m: any) => m.id === recruiterUser.id), devList.json.lookups);
    const dv = `/api/v1/development/${hirePdi.id}`;
    const peopleRes = await A('GET', '/api/v1/development/people');
    check('people list: excludes who already has a PDI, offers the members', peopleRes.status === 200 && !(peopleRes.json.people ?? []).some((p: any) => p.id === candId) && (peopleRes.json.people ?? []).some((p: any) => p.origin === 'member'), peopleRes.json);
    check('RBAC: INTERVIEWER cannot read PDIs nor the people list', (await R('INTERVIEWER', 'GET', '/api/v1/development')).status === 403 && (await R('INTERVIEWER', 'GET', '/api/v1/development/people')).status === 403);

    // PDI record: create / edit / delete
    const newRec = await A('POST', '/api/v1/development', { collaboratorName: ' Ana PDI ', jobTitle: 'Analista', hireDate: '2026-01-05', departmentId: deptId, managerId: recruiterUser.id });
    const ana = newRec.json.developmentRecord;
    check('create a PDI by hand', newRec.status === 201 && ana.collaboratorName === 'Ana PDI' && ana.collaboratorId.startsWith('colab-') && ana.managerId === recruiterUser.id && ana.goals.length === 0, newRec.json);
    check('create PDI: name, cargo and admission date are required -> 400', (await A('POST', '/api/v1/development', { jobTitle: 'x', hireDate: '2026-01-05' })).status === 400 && (await A('POST', '/api/v1/development', { collaboratorName: 'x', hireDate: '2026-01-05' })).status === 400 && (await A('POST', '/api/v1/development', { collaboratorName: 'x', jobTitle: 'y' })).status === 400);
    check('create PDI: impossible date -> 400', (await A('POST', '/api/v1/development', { collaboratorName: 'x', jobTitle: 'y', hireDate: '2026-02-30' })).status === 400);
    check('create PDI: unknown department / manager -> 400', (await A('POST', '/api/v1/development', { collaboratorName: 'x', jobTitle: 'y', hireDate: '2026-01-05', departmentId: 'dep-nope' })).status === 400 && (await A('POST', '/api/v1/development', { collaboratorName: 'x', jobTitle: 'y', hireDate: '2026-01-05', managerId: 'usr-nope' })).status === 400);
    check('create PDI for someone who already has one -> 409', (await A('POST', '/api/v1/development', { collaboratorId: candId, collaboratorName: 'x', jobTitle: 'y', hireDate: '2026-01-05' })).status === 409);
    const race = await Promise.all([1, 2].map(() => A('POST', '/api/v1/development', { collaboratorId: 'colab-race', collaboratorName: 'Corrida', jobTitle: 'y', hireDate: '2026-01-05' })));
    check('simultaneous PDI creation for the same person keeps a single record', race.map(r => r.status).sort().join() === '201,409', race.map(r => r.status));
    check('RBAC: INTERVIEWER cannot create PDIs', (await R('INTERVIEWER', 'POST', '/api/v1/development', { collaboratorName: 'x', jobTitle: 'y', hireDate: '2026-01-05' })).status === 403);
    const editRec = await A('PATCH', `/api/v1/development/${ana.id}`, { jobTitle: 'Analista Sr', managerId: null, nextReviewDate: '2099-02-01' });
    check('edit PDI data (clear manager, schedule next 1:1)', editRec.json.developmentRecord?.jobTitle === 'Analista Sr' && editRec.json.developmentRecord.managerId === undefined && editRec.json.developmentRecord.nextReviewDate === '2099-02-01' && editRec.json.developmentRecord.collaboratorName === 'Ana PDI', editRec.json);
    check('edit PDI: invalid next date / empty name -> 400', (await A('PATCH', `/api/v1/development/${ana.id}`, { nextReviewDate: 'amanhã' })).status === 400 && (await A('PATCH', `/api/v1/development/${ana.id}`, { collaboratorName: '  ' })).status === 400);
    check('edit PDI: unknown id -> 404', (await A('PATCH', '/api/v1/development/dev-nope', { jobTitle: 'x' })).status === 404);
    check('an empty PDI can be deleted', (await A('DELETE', `/api/v1/development/${ana.id}`)).status === 200 && !((await A('GET', '/api/v1/development')).json.developmentRecords ?? []).some((r: any) => r.id === ana.id));
    check('delete PDI: unknown id -> 404', (await A('DELETE', '/api/v1/development/dev-nope')).status === 404);

    // Goals
    const goalRes = await A('POST', `${dv}/goals`, { title: 'Certificação Cloud', competency: 'Arquitetura', description: 'Passar no exame', deadline: '2099-12-31' });
    const g1 = goalRes.json.goal;
    const gp = `${dv}/goals/${g1?.id}`;
    check('create goal: starts "not started" at 0%, description kept', goalRes.status === 201 && g1.status === 'not_started' && g1.progressPercentage === 0 && g1.competency === 'Arquitetura' && g1.description === 'Passar no exame' && goalRes.json.developmentRecord.goals.length === 1, goalRes.json);
    const gDefault = (await A('POST', `${dv}/goals`, { title: 'Sem competência' })).json.goal;
    check('create goal: competency defaults to "Geral" and deadline to about 90 days', gDefault?.competency === 'Geral' && /^\d{4}-\d{2}-\d{2}$/.test(gDefault.deadline) && Math.abs((new Date(`${gDefault.deadline}T12:00:00Z`).getTime() - Date.now()) / 86400000 - 90) < 2, gDefault);
    check('create goal: title required / impossible deadline -> 400', (await A('POST', `${dv}/goals`, { title: '  ' })).status === 400 && (await A('POST', `${dv}/goals`, { title: 'x', deadline: '2026-02-30' })).status === 400);
    check('create goal: unknown PDI -> 404 and RBAC (INTERVIEWER -> 403)', (await A('POST', '/api/v1/development/dev-nope/goals', { title: 'x' })).status === 404 && (await R('INTERVIEWER', 'POST', `${dv}/goals`, { title: 'x' })).status === 403);
    const goalOf = (res: any, id = g1?.id) => res.json.developmentRecord?.goals?.find((x: any) => x.id === id);
    let mv = await A('PATCH', gp, { progressPercentage: 40, note: 'Curso iniciado' });
    check('progress 40% -> in progress, one history entry with note and author', goalOf(mv)?.status === 'in_progress' && goalOf(mv).progressPercentage === 40 && goalOf(mv).history?.length === 1 && goalOf(mv).history[0].note === 'Curso iniciado' && !!goalOf(mv).history[0].by, mv.json);
    mv = await A('PATCH', gp, { progressPercentage: 40 });
    check('same progress without note does not add history', goalOf(mv)?.history?.length === 1);
    mv = await A('PATCH', gp, { title: 'Certificação Cloud Pro', deadline: '2099-06-30', competency: '' });
    check('edit goal fields keeps the progress; empty competency becomes "Geral"', goalOf(mv)?.title === 'Certificação Cloud Pro' && goalOf(mv).deadline === '2099-06-30' && goalOf(mv).competency === 'Geral' && goalOf(mv).progressPercentage === 40, mv.json);
    check('progress out of range / not integer / invalid status -> 400', (await A('PATCH', gp, { progressPercentage: 101 })).status === 400 && (await A('PATCH', gp, { progressPercentage: 12.5 })).status === 400 && (await A('PATCH', gp, { progressPercentage: '' })).status === 400 && (await A('PATCH', gp, { status: 'feito' })).status === 400);
    mv = await A('PATCH', gp, { progressPercentage: 100 });
    check('100% -> achieved, with completion date', goalOf(mv)?.status === 'achieved' && goalOf(mv).progressPercentage === 100 && !!goalOf(mv).completedAt, mv.json);
    check('reopening a goal that is still at 100% (no lower progress given) is refused -> 400', (await A('PATCH', gp, { status: 'in_progress' })).status === 400);
    mv = await A('PATCH', gp, { status: 'in_progress', progressPercentage: 80, note: 'Falta a prova' });
    check('reopened goal is in progress again without completion date', goalOf(mv)?.status === 'in_progress' && goalOf(mv).progressPercentage === 80 && goalOf(mv).completedAt === undefined, mv.json);
    check('a goal with progress cannot be deleted (cancel instead) -> 400', (await A('DELETE', gp)).status === 400);
    mv = await A('PATCH', gp, { status: 'cancelled', note: 'Prioridade mudou' });
    check('cancel keeps the progress and the history', goalOf(mv)?.status === 'cancelled' && goalOf(mv).progressPercentage === 80 && goalOf(mv).history?.length >= 4, mv.json);
    check('progress of a cancelled goal is refused until it is reopened -> 400', (await A('PATCH', gp, { progressPercentage: 90 })).status === 400);
    mv = await A('PATCH', gp, { status: 'in_progress' });
    check('reopen a cancelled goal', goalOf(mv)?.status === 'in_progress' && goalOf(mv).progressPercentage === 80, mv.json);
    check('update: unknown goal -> 404, INTERVIEWER -> 403', (await A('PATCH', `${dv}/goals/g-nope`, { progressPercentage: 10 })).status === 404 && (await R('INTERVIEWER', 'PATCH', gp, { progressPercentage: 10 })).status === 403);
    check('RBAC: HIRING_MANAGER (development:edit) can add and move goals', (await R('HIRING_MANAGER', 'POST', `${dv}/goals`, { title: 'Meta do gestor' })).status === 201);
    const untouched = (await A('POST', `${dv}/goals`, { title: 'Criada por engano' })).json.goal;
    const delGoal = await A('DELETE', `${dv}/goals/${untouched.id}`);
    check('an untouched goal can be deleted', delGoal.status === 200 && !delGoal.json.developmentRecord.goals.some((x: any) => x.id === untouched.id), delGoal.json);
    check('delete goal: unknown -> 404, INTERVIEWER -> 403', (await A('DELETE', `${dv}/goals/g-nope`)).status === 404 && (await R('INTERVIEWER', 'DELETE', gp)).status === 403);
    check('a PDI with goals cannot be deleted -> 400', (await A('DELETE', dv)).status === 400);

    // 1:1s
    const one = `${dv}/one-on-ones`;
    const m1 = await A('POST', one, { date: '2026-03-16', keyTakeaways: ' Boa conversa ', actionItems: ['Configurar dashboard', ' ', 'Marcar mentoria'], nextMeetingDate: '2099-01-10' });
    check('register 1:1: text and actions kept, last review set, next scheduled', m1.status === 201 && m1.json.meeting.keyTakeaways === 'Boa conversa' && m1.json.meeting.actionItems.length === 2 && !!m1.json.meeting.registeredBy && m1.json.developmentRecord.lastReviewDate === '2026-03-16' && m1.json.developmentRecord.nextReviewDate === '2099-01-10', m1.json);
    check('register 1:1: future date, empty text, next not after the meeting, too many actions -> 400',
      (await A('POST', one, { date: '2099-01-01', keyTakeaways: 'x' })).status === 400 && (await A('POST', one, { date: '2026-03-16', keyTakeaways: ' ' })).status === 400 &&
      (await A('POST', one, { date: '2026-03-16', keyTakeaways: 'x', nextMeetingDate: '2026-03-16' })).status === 400 && (await A('POST', one, { date: '2026-03-16', keyTakeaways: 'x', actionItems: Array(21).fill('a') })).status === 400);
    check('register 1:1: unknown PDI -> 404, INTERVIEWER -> 403', (await A('POST', '/api/v1/development/dev-nope/one-on-ones', { date: '2026-03-16', keyTakeaways: 'x' })).status === 404 && (await R('INTERVIEWER', 'POST', one, { date: '2026-03-16', keyTakeaways: 'x' })).status === 403);
    const m2 = await A('POST', one, { date: '2026-03-30', keyTakeaways: 'Segundo 1:1' });
    check('a newer 1:1 moves the last review and keeps a future next date', m2.json.developmentRecord?.lastReviewDate === '2026-03-30' && m2.json.developmentRecord.nextReviewDate === '2099-01-10' && m2.json.developmentRecord.oneOnOnes.length === 2, m2.json);
    const both = await Promise.all([1, 2].map(i => A('POST', one, { date: '2026-04-01', keyTakeaways: `Simultâneo ${i}` })));
    check('simultaneous 1:1s are both kept (row lock)', both.every(r => r.status === 201) && ((await A('GET', '/api/v1/development')).json.developmentRecords.find((r: any) => r.id === hirePdi.id)?.oneOnOnes.length === 4));
    const editM = await A('PATCH', `${one}/${m1.json.meeting.id}`, { keyTakeaways: 'Conversa corrigida', actionItems: ['Nova ação'], date: '2026-03-20' });
    const em = editM.json.developmentRecord?.oneOnOnes.find((x: any) => x.id === m1.json.meeting.id);
    check('edit 1:1 (text, actions, date); the author is kept', em?.keyTakeaways === 'Conversa corrigida' && em.actionItems.join() === 'Nova ação' && em.date === '2026-03-20' && !!em.registeredBy, editM.json);
    check('edit 1:1: unknown -> 404, future date -> 400, INTERVIEWER -> 403', (await A('PATCH', `${one}/1on1-nope`, { keyTakeaways: 'x' })).status === 404 && (await A('PATCH', `${one}/${m1.json.meeting.id}`, { date: '2099-01-01' })).status === 400 && (await R('INTERVIEWER', 'PATCH', `${one}/${m1.json.meeting.id}`, { keyTakeaways: 'x' })).status === 403);
    let cleaned: any;
    for (const meeting of (await A('GET', '/api/v1/development')).json.developmentRecords.find((r: any) => r.id === hirePdi.id).oneOnOnes) cleaned = await A('DELETE', `${one}/${meeting.id}`);
    check('deleting every 1:1 clears the last review and keeps the scheduled next', cleaned?.json.developmentRecord?.oneOnOnes.length === 0 && cleaned.json.developmentRecord.lastReviewDate === '' && cleaned.json.developmentRecord.nextReviewDate === '2099-01-10', cleaned?.json);
    check('delete 1:1: unknown -> 404, INTERVIEWER -> 403', (await A('DELETE', `${one}/1on1-nope`)).status === 404 && (await R('INTERVIEWER', 'DELETE', `${one}/1on1-nope`)).status === 403);

    // Isolation between organizations
    check('isolation: org B sees no PDI of org A and cannot touch it', ((await B('GET', '/api/v1/development')).json.developmentRecords ?? []).length === 0
      && (await B('PATCH', dv, { jobTitle: 'hack' })).status === 404 && (await B('DELETE', dv)).status === 404
      && (await B('POST', `${dv}/goals`, { title: 'x' })).status === 404 && (await B('PATCH', gp, { progressPercentage: 1 })).status === 404 && (await B('POST', one, { date: '2026-03-16', keyTakeaways: 'x' })).status === 404);
    check('isolation: a manager or department of another org is refused -> 400', (await B('POST', '/api/v1/development', { collaboratorName: 'x', jobTitle: 'y', hireDate: '2026-01-05', managerId: recruiterUser.id })).status === 400 && (await B('POST', '/api/v1/development', { collaboratorName: 'x', jobTitle: 'y', hireDate: '2026-01-05', departmentId: deptId })).status === 400);

    // ---- Isolation between organizations -------------------------------------------
    for (const [label, path, key] of [
      ['candidates', '/api/v1/candidates', 'candidates'],
      ['openings', '/api/v1/openings', 'openings'],
      ['applications', '/api/v1/applications', 'applications'],
      ['departments', '/api/v1/departments', 'departments'],
      ['positions', '/api/v1/positions', 'positions'],
      ['interviews', '/api/v1/interviews', 'interviews'],
      ['offers', '/api/v1/offers', 'offers'],
      ['ai evaluations', '/api/v1/ai/evaluations', 'evaluations']
    ] as const) {
      check(`isolation: org B sees no ${label} of org A`, (await B('GET', path)).json[key]?.length === 0);
    }
    check('isolation: org B cannot read A users', !(await B('GET', '/api/v1/users')).json.users.some((u: any) => u.email.endsWith(`-${suffix}@smoke.test`) && u.email !== emailB));
    check('isolation: A DNA update did not touch B', (await B('GET', '/api/v1/dna')).json.dna.mission !== 'Missão atualizada');
    check('isolation: cross-tenant application blocked', (await B('POST', '/api/v1/applications', { candidateId: candId, jobOpeningId: jobId })).status === 404);
    check('isolation: cross-tenant offer blocked (FK)', (await B('POST', '/api/v1/offers', { candidateId: candId, jobOpeningId: jobId })).status === 400);
    check('isolation: cross-tenant interview blocked (FK)', (await B('POST', '/api/v1/interviews', { candidateId: candId, jobOpeningId: jobId })).status === 400);
    check('isolation: cross-tenant AI evaluation blocked', (await B('POST', '/api/v1/ai/evaluate-candidate', { candidateId: candId, jobOpeningId: jobId })).status === 404);
    check('isolation: cross-tenant review blocked', (await B('PATCH', `/api/v1/ai/evaluations/${evId}/human-decision`, { decision: 'REJECTED' })).status === 404);
    check('isolation: cross-tenant offer status blocked', (await B('PATCH', `/api/v1/offers/${offer.json.offer.id}/status`, { status: 'declined' })).status === 404);
    check('isolation: cross-tenant position with foreign dept blocked', (await B('POST', '/api/v1/positions', { title: 'x', departmentId: deptId })).status === 400);
    check('isolation: cross-tenant password reset blocked', (await B('POST', `/api/v1/users/${recruiterUser.id}/reset-password`)).status === 404);

    // ---- Public careers portal ---------------------------------------------------------
    const pub = await api('GET', `/api/public/${slugA}/careers`);
    check('public careers portal works without login', pub.status === 200 && pub.json.openings?.length === 1 && pub.json.tenant?.slug === slugA, pub.json);
    const pubText = JSON.stringify(pub.json);
    check('public portal exposes no salary bands / internal ids / thresholds', !/minSalary|maxSalary|hiringManagerId|recruiterId|culturalFitThreshold|undesiredBehaviors|passwordHash/.test(pubText), pubText.slice(0, 200));
    check('public portal: unknown org -> 404', (await api('GET', '/api/public/nao-existe/careers')).status === 404);

    const applyBody = { jobOpeningId: jobId, name: 'Candidata Pública', email: `publica-${suffix}@smoke.test`, currentRole: 'Dev', yearsOfExperience: 4, skills: 'Go, SQL', tags: ['admin-only'], status: 'hired', dataOrigin: 'rh' };
    const applied = await api('POST', `/api/public/${slugA}/apply`, { body: applyBody });
    check('public apply -> 201 with protocol', applied.status === 201 && !!applied.json.applicationId, applied.json);
    const pubCand = (await A('GET', '/api/v1/candidates')).json.candidates.find((c: any) => c.email === `publica-${suffix}@smoke.test`);
    check('public application landed in the org (candidate + tags forced server-side)', !!pubCand && pubCand.tags.includes('Candidatura Portal Público') && !pubCand.tags.includes('admin-only'), pubCand);
    const pubApp = (await A('GET', '/api/v1/applications')).json.applications.find((a: any) => a.candidateId === pubCand?.id);
    check('public application starts in review on the first stage (cannot self-approve)', pubApp?.status === 'in_review' && pubApp.currentStageId === 'stg-1', pubApp);

    // ---- Origem dos dados do candidato: declarados no portal = protegidos; correção só com motivo ------
    check('data origin: portal candidate is marked as declared by the candidate (body cannot change it)', pubCand?.dataOrigin === 'candidate', pubCand?.dataOrigin);
    check('data origin: candidate created by the RH is marked as RH', (await A('GET', '/api/v1/candidates')).json.candidates.find((c: any) => c.id === candId)?.dataOrigin === 'rh');
    const pc = `/api/v1/candidates/${pubCand.id}`;
    const locked = await A('PATCH', pc, { name: 'Nome Reescrito' });
    check('declared data cannot be edited (409 DECLARED_DATA_LOCKED)', locked.status === 409 && locked.json.code === 'DECLARED_DATA_LOCKED', locked.json);
    for (const [field, value] of [['email', 'novo@smoke.test'], ['phone', '000'], ['location', 'Lugar'], ['currentRole', 'CEO'], ['yearsOfExperience', 20], ['education', 'PhD'], ['resumeSummary', 'reescrito'], ['skills', ['X']], ['linkedinUrl', 'https://x.com']] as const) {
      check(`declared field "${field}" is locked`, (await A('PATCH', pc, { [field]: value })).status === 409);
    }
    check('declared data is unchanged after the blocked attempts', (await A('GET', '/api/v1/candidates')).json.candidates.find((c: any) => c.id === pubCand.id)?.name === 'Candidata Pública');
    const okEdit = await A('PATCH', pc, { languages: ['Português (Nativo)', 'Inglês (Fluente)'], tags: ['Triagem OK'] });
    check('RH-owned fields of a portal candidate stay editable', okEdit.status === 200 && okEdit.json.candidate.tags.join() === 'Triagem OK' && okEdit.json.candidate.languages.length === 2, okEdit.json);

    const corr = `${pc}/corrections`;
    check('correction without reason -> 400', (await A('POST', corr, { changes: { phone: '+55 11 90000-0001' } })).status === 400);
    check('correction with a too short reason -> 400', (await A('POST', corr, { changes: { phone: '+55 11 90000-0001' }, reason: 'erro' })).status === 400);
    check('correction without fields -> 400', (await A('POST', corr, { changes: {}, reason: 'Candidato pediu por e-mail' })).status === 400);
    check('correction of a non declared field -> 400', (await A('POST', corr, { changes: { tags: ['x'] }, reason: 'Candidato pediu por e-mail' })).status === 400);
    check('correction with an invalid value -> 400', (await A('POST', corr, { changes: { email: 'sem-arroba' }, reason: 'Candidato pediu por e-mail' })).status === 400);
    check('correction that changes nothing -> 400', (await A('POST', corr, { changes: { name: 'Candidata Pública' }, reason: 'Candidato pediu por e-mail' })).status === 400);
    const before = (await A('GET', '/api/v1/candidates')).json.candidates.find((c: any) => c.id === pubCand.id);
    const done = await A('POST', corr, { changes: { phone: '+55 11 90000-0001', currentRole: 'Tech Lead' }, reason: 'Candidato pediu a correção por e-mail em 12/03' });
    check('justified correction is applied', done.status === 201 && done.json.candidate.phone === '+55 11 90000-0001' && done.json.candidate.currentRole === 'Tech Lead' && done.json.changedFields.length === 2, done.json);
    const hist = (await A('GET', `${pc}/history`)).json.changes ?? [];
    const phoneChange = hist.find((h: any) => h.field === 'phone' && h.kind === 'correction');
    check('history keeps the ORIGINAL value, the new one, who, when and why',
      phoneChange?.oldValue === before.phone && phoneChange.newValue === '+55 11 90000-0001' && phoneChange.reason?.includes('12/03') && !!phoneChange.changedBy && !!phoneChange.changedAt, phoneChange);
    check('history has one row per changed field, newest first', hist.filter((h: any) => h.kind === 'correction').length === 2 && hist[0].changedAt >= hist[hist.length - 1].changedAt);
    check('history also records the RH-owned edit', hist.some((h: any) => h.field === 'tags' && h.kind === 'update'));
    const archived = (await A('GET', '/api/v1/candidates')).json.candidates.find((c: any) => c.id === pubCand.id);
    check('the corrected value is what the system now shows', archived.phone === '+55 11 90000-0001');
    let trailImmutable = false;
    try { await getPool().query(`update public.candidate_changes set new_value = '"forjado"' where candidate_id = $1`, [pubCand.id]); } catch { trailImmutable = true; }
    check('history is append-only (the database refuses to rewrite it)', trailImmutable);
    check('RBAC: HIRING_MANAGER cannot correct candidate data', (await R('HIRING_MANAGER', 'POST', corr, { changes: { phone: '1' }, reason: 'tentativa sem permissão' })).status === 403);
    check('RBAC: INTERVIEWER can read the history but not correct', (await R('INTERVIEWER', 'GET', `${pc}/history`)).status === 200 && (await R('INTERVIEWER', 'POST', corr, { changes: { phone: '1' }, reason: 'tentativa sem permissão' })).status === 403);
    check('correction: unknown candidate -> 404', (await A('POST', '/api/v1/candidates/cand-nope/corrections', { changes: { phone: '1' }, reason: 'não existe candidato' })).status === 404);
    check('history: unknown candidate -> 404', (await A('GET', '/api/v1/candidates/cand-nope/history')).status === 404);
    check('isolation: org B cannot read the history of an org A candidate', (await B('GET', `${pc}/history`)).status === 404);
    check('isolation: org B cannot correct an org A candidate', (await B('POST', corr, { changes: { phone: '1' }, reason: 'tentativa de outra organização' })).status === 404);


    // ---- Arquivar perfil no Banco de Talentos (nada é apagado; motivo e autor no histórico) ---------
    const arch = `${pc}/archive`;
    check('archive: patch cannot flip the archived flag', (await A('PATCH', pc, { archived: true })).json.candidate?.archived === false);
    check('archive without reason -> 400', (await A('POST', arch, {})).status === 400);
    check('archive with a too short reason -> 400', (await A('POST', arch, { reason: 'sair' })).status === 400);
    check('RBAC: HIRING_MANAGER cannot archive', (await R('HIRING_MANAGER', 'POST', arch, { reason: 'tentativa sem permissão' })).status === 403);
    check('archive: unknown candidate -> 404', (await A('POST', '/api/v1/candidates/cand-nope/archive', { reason: 'não existe candidato' })).status === 404);
    check('isolation: org B cannot archive an org A candidate', (await B('POST', arch, { reason: 'tentativa de outra organização' })).status === 404);
    const archivedOk = await A('POST', arch, { reason: 'Candidato pediu para sair do banco de talentos' });
    check('archive: the profile is archived', archivedOk.json.candidate?.archived === true, archivedOk.json);
    const archHist = ((await A('GET', `${pc}/history`)).json.changes ?? []).find((h: any) => h.field === 'archived');
    check('archive: history records who, why, and the flag change', archHist?.oldValue === false && archHist.newValue === true && /sair do banco/.test(archHist.reason) && !!archHist.changedBy, archHist);
    check('archive: the candidate keeps every other field (nothing is deleted)', (await A('GET', '/api/v1/candidates')).json.candidates.find((c: any) => c.id === pubCand.id)?.name === 'Candidata Pública');
    check('archive: already archived -> 400', (await A('POST', arch, { reason: 'segunda tentativa de arquivar' })).status === 400);
    check('archived profile cannot enter a new selection process (RH)', (await A('POST', '/api/v1/applications', { candidateId: pubCand.id, jobOpeningId: jobId })).status === 400);
    check('archived profile keeps its existing application', ((await A('GET', '/api/v1/applications')).json.applications ?? []).some((a: any) => a.candidateId === pubCand.id));
    check('unarchive: not archived -> 400 (on a fresh RH candidate)', (await A('POST', `/api/v1/candidates/${candId}/unarchive`, {})).status === 400);
    check('RBAC: HIRING_MANAGER cannot unarchive', (await R('HIRING_MANAGER', 'POST', `${pc}/unarchive`, {})).status === 403);
    check('isolation: org B cannot unarchive an org A candidate', (await B('POST', `${pc}/unarchive`, {})).status === 404);
    // a new application sent by the candidate through the portal reactivates the profile
    const job2 = await A('POST', '/api/v1/openings', { title: 'Segunda Vaga Smoke', positionId: posId, departmentId: deptId });
    const reapply = await api('POST', `/api/public/${slugA}/apply`, { body: { ...applyBody, jobOpeningId: job2.json.opening.id } });
    check('portal: a new application from an archived candidate is accepted', reapply.status === 201, reapply.json);
    check('portal: it reactivates the profile and logs it', (await A('GET', '/api/v1/candidates')).json.candidates.find((c: any) => c.id === pubCand.id)?.archived === false
      && ((await A('GET', `${pc}/history`)).json.changes ?? []).some((h: any) => h.field === 'archived' && h.newValue === false && h.changedBy === 'Portal Público de Vagas'));
    const reArch = await A('POST', arch, { reason: 'Arquivado novamente para testar a reativação manual' });
    const unarch = await A('POST', `${pc}/unarchive`, { reason: 'Candidato voltou a ter interesse' });
    check('unarchive: the profile is active again, with the reason in the history', reArch.status === 200 && unarch.json.candidate?.archived === false
      && ((await A('GET', `${pc}/history`)).json.changes ?? []).some((h: any) => h.field === 'archived' && h.newValue === false && /voltou a ter interesse/.test(h.reason ?? '')));

    // RH-registered candidates stay editable (declared fields included) but every change is logged
    const rhHist = (await A('GET', `/api/v1/candidates/${candId}/history`)).json.changes ?? [];
    check('RH-registered candidate: edits are logged as updates', rhHist.length > 0 && rhHist.every((h: any) => h.kind === 'update') && rhHist.some((h: any) => h.field === 'name'), rhHist.length);
    const rhCorr = await A('POST', `/api/v1/candidates/${candId}/corrections`, { changes: { education: 'Mestrado' }, reason: 'Diploma conferido pelo RH' });
    check('RH-registered candidate: a correction with a reason is also accepted', rhCorr.status === 201);

    check('public duplicate application -> 409', (await api('POST', `/api/public/${slugA}/apply`, { body: applyBody })).status === 409);
    check('public apply invalid e-mail -> 400', (await api('POST', `/api/public/${slugA}/apply`, { body: { ...applyBody, email: 'nope' } })).status === 400);
    check('public apply unknown job -> 404', (await api('POST', `/api/public/${slugA}/apply`, { body: { ...applyBody, email: `x-${suffix}@smoke.test`, jobOpeningId: 'job-nope' } })).status === 404);
    check('public apply to another org\'s job -> 404', (await api('POST', `/api/public/${slugB}/apply`, { body: { ...applyBody, email: `y-${suffix}@smoke.test` } })).status === 404);
    check('public apply oversize field -> 400', (await api('POST', `/api/public/${slugA}/apply`, { body: { ...applyBody, email: `z-${suffix}@smoke.test`, resumeSummary: 'x'.repeat(5000) } })).status === 400);
    check('org B saw nothing of the public application', (await B('GET', '/api/v1/candidates')).json.candidates.length === 0);

    // ---- SuperAdmin: impersonation, status, reset ------------------------------------------
    // The Conta Mãe has no route into organization data (header, query or session): only /api/master/*
    check('Conta Mãe is refused on organization data (session)', (await api('GET', '/api/v1/context', { token: adminToken })).status === 403);
    check('Conta Mãe is refused even when naming an organization (header)', (await api('GET', '/api/v1/users', { token: adminToken, tenant: slugA })).status === 403 && (await api('GET', '/api/v1/context', { token: adminToken, tenant: 'does-not-exist' })).status === 403);
    check('Conta Mãe cannot switch organization', (await api('POST', '/api/auth/switch-organization', { token: adminToken, body: { tenantId: provA.json.tenant.id } })).status === 400);
    check('Conta Mãe still has the platform routines', (await api('GET', '/api/master/tenants', { token: adminToken })).status === 200 && (await api('GET', '/api/master/telemetry', { token: adminToken })).status === 200);

    // ---- Conta Mãe: editing organizations, plans and module entitlements -------------------
    const T = (method: string, path: string, body?: unknown) => api(method, path, { token: adminToken, body });
    const tA = provA.json.tenant.id, tB = provB.json.tenant.id;
    check('new Scale orgs start with every module enabled', provA.json.tenant.enabledRoutines?.length === 15 && provB.json.tenant.enabledRoutines?.length === 15, [provA.json.tenant.enabledRoutines?.length, provB.json.tenant.enabledRoutines?.length]);
    const toStarter = await T('PATCH', `/api/master/tenants/${tB}`, { plan: 'Starter', enabledRoutines: PLAN_ROUTINES.Starter });
    check('plan preset: Starter has 11 modules and no AI / development / retention / indicators', toStarter.status === 200 && toStarter.json.tenant.enabledRoutines.length === 11 && !toStarter.json.tenant.enabledRoutines.some((k: string) => ['ai_evaluation', 'development', 'retention', 'indicators'].includes(k)), toStarter.json);
    const provStarter = await api('POST', '/api/master/tenants/provision', { token: adminToken, body: { name: `Smoke C ${suffix}`, slug: `smoke-c-${suffix}`, contactEmail: `admin-c-${suffix}@smoke.test`, adminUserName: 'Admin C', plan: 'Starter' } });
    createdTenantIds.push(provStarter.json.tenant?.id);
    check('provisioning a Starter org applies the Starter preset by default', provStarter.status === 201 && provStarter.json.tenant.enabledRoutines.length === 11, provStarter.json);
    check('provisioning accepts an explicit module list (core forced in)', (await api('POST', '/api/master/tenants/provision', { token: adminToken, body: { name: 'Bad', slug: `bad-${suffix}`, contactEmail: `bad-${suffix}@smoke.test`, enabledRoutines: ['nope'] } })).status === 400);
    check('Starter org: blocked modules do not answer even for its admin', (await B('GET', '/api/v1/indicators')).status === 403 && (await B('GET', '/api/v1/retention')).status === 403 && (await B('POST', '/api/v1/ai/evaluate-candidate', { candidateId: 'x', jobOpeningId: 'y' })).status === 403);
    check('Starter org: enabled modules still work for its admin', (await B('GET', '/api/v1/candidates')).status === 200 && (await B('GET', '/api/v1/dna')).status === 200);
    const meB = (await api('GET', '/api/auth/me', { token: adminB })).json.user;
    check('/me permissions of the admin are limited to the enabled modules', !meB.permissions.some((p: string) => p.startsWith('indicators:')) && meB.permissions.includes('users:create'), meB.permissions.length);

    check('edit org: non-SuperAdmin -> 403', (await A('PATCH', `/api/master/tenants/${tA}`, { name: 'x' })).status === 403);
    check('edit org: invalid module -> 400', (await T('PATCH', `/api/master/tenants/${tA}`, { enabledRoutines: ['dna', 'teleport'] })).status === 400);
    check('edit org: invalid plan -> 400', (await T('PATCH', `/api/master/tenants/${tA}`, { plan: 'Gold' })).status === 400);
    check('edit org: invalid contact e-mail -> 400', (await T('PATCH', `/api/master/tenants/${tA}`, { contactEmail: 'nope' })).status === 400);
    check('edit org: invalid logo URL -> 400', (await T('PATCH', `/api/master/tenants/${tA}`, { logoUrl: 'javascript:alert(1)' })).status === 400);
    check('edit org: unknown org -> 404', (await T('PATCH', '/api/master/tenants/tenant-nope', { name: 'x' })).status === 404);
    const edited = await T('PATCH', `/api/master/tenants/${tA}`, { tradingName: 'Smoke A Editada', plan: 'Starter', enabledRoutines: ['dna', 'openings'] });
    check('edit org: data + plan updated; core modules (users, profiles) forced on', edited.status === 200 && edited.json.tenant.tradingName === 'Smoke A Editada' && edited.json.tenant.plan === 'Starter' && ['users', 'profiles', 'dna', 'openings'].every(k => edited.json.tenant.enabledRoutines.includes(k)) && edited.json.tenant.enabledRoutines.length === 4, edited.json);
    check('module block applies at once to a live session (no re-login)', (await A('GET', '/api/v1/candidates')).status === 403 && (await A('GET', '/api/v1/offers')).status === 403 && (await A('GET', '/api/v1/dna')).status === 200 && (await A('GET', '/api/v1/users')).status === 200);
    check('blocked module also blocks writes', (await A('POST', '/api/v1/candidates', { name: 'x', email: 'x@smoke.test' })).status === 403);
    const meA = (await api('GET', '/api/auth/me', { token: adminA })).json.user;
    check('/me reflects only the enabled modules', meA.permissions.every((p: string) => ['users', 'profiles', 'dna', 'openings'].includes(p.split(':')[0])), meA.permissions);
    check('org admin cannot hand out a blocked module (grant limit)', (await A('POST', '/api/v1/profiles', { name: 'Bloqueado', permissions: ['offers:view'] })).status === 403);
    check('storage quota follows the new plan (Starter)', (await T('GET', `/api/master/tenants/${tA}`)).json.tenant.dbConfig.maxStorageMb === 1024);
    const restored = await T('PATCH', `/api/master/tenants/${tA}`, { plan: 'Scale', enabledRoutines: ['users', 'profiles', 'dna', 'structure', 'positions', 'openings', 'candidates', 'selection', 'ai_evaluation', 'interviews', 'offers', 'onboarding', 'development', 'retention', 'indicators'] });
    check('modules re-enabled: access returns immediately', restored.status === 200 && (await A('GET', '/api/v1/candidates')).status === 200 && (await A('GET', '/api/v1/offers')).status === 200);
    check('audit trail records the module change with a diff', (await T('GET', '/api/master/audit-logs?q=' + encodeURIComponent('módulos bloqueados') + '&category=ACCESS_CONTROL')).json.logs.some((l: any) => l.action === 'TENANT_UPDATED' && l.tenantId === tA));

    // ---- Conta Mãe: paginated / searched catalog ---------------------------------------------
    const cat1 = await T('GET', '/api/master/tenants?pageSize=1&page=1');
    const cat2 = await T('GET', '/api/master/tenants?pageSize=1&page=2');
    check('catalog is paginated in the database', cat1.json.tenants.length === 1 && cat1.json.total >= 5 && cat2.json.tenants.length === 1 && cat1.json.tenants[0].id !== cat2.json.tenants[0].id, [cat1.json.total, cat1.json.pageSize]);
    check('catalog search by identifier', (await T('GET', `/api/master/tenants?search=${slugA}`)).json.total === 1);
    check('catalog search is LIKE-safe (% and _ are literal)', (await T('GET', '/api/master/tenants?search=%25')).json.total === 0);
    check('catalog page size is capped', (await T('GET', '/api/master/tenants?pageSize=100000')).json.pageSize === 100);
    check('audit filter by category + search + pagination', (await T('GET', '/api/master/audit-logs?category=ACCESS_CONTROL&limit=1')).json.logs.length === 1 && (await T('GET', '/api/master/audit-logs?limit=1')).json.nextCursor !== null);
    check('audit bad cursor -> 400', (await T('GET', '/api/master/audit-logs?before=garbage')).status === 400);
    const pgUsers = await A('GET', '/api/v1/users?page=1&pageSize=1');
    check('org member list is paginated too', pgUsers.json.users.length === 1 && pgUsers.json.total > 1 && pgUsers.json.pageSize === 1, pgUsers.json.total);
    const gmSearch = await A('GET', '/api/v1/users?search=gm');
    check('org member search by name prefix', gmSearch.json.users.length >= 1 && gmSearch.json.users.every((u: any) => u.name.toLowerCase().startsWith('gm') || u.email.toLowerCase().startsWith('gm')), gmSearch.json.users.map((u: any) => u.name));

    // ---- Conta Mãe: users of an organization (access metadata only) ---------------------------
    check('master members: non-SuperAdmin -> 403', (await A('GET', `/api/master/tenants/${tA}/members`)).status === 403);
    check('master members: unknown org -> 404', (await T('GET', '/api/master/tenants/tenant-nope/members')).status === 404);
    const mA = await T('GET', `/api/master/tenants/${tA}/members?pageSize=100`);
    check('master members: lists only that organization', mA.status === 200 && mA.json.users.length > 5 && mA.json.users.every((u: any) => u.tenantId === tA), mA.json.total);
    const mnew = `master-${suffix}@smoke.test`;
    const created = await T('POST', `/api/master/tenants/${tA}/members`, { name: 'Criado pela Conta Mãe', email: mnew, profileId: 'recruiter' });
    check('master creates a user in an organization (one-time temp password)', created.status === 201 && !!created.json.tempPassword && created.json.user.tenantId === tA, created.json);
    const mTok = (await activateUser(slugA, mnew, created.json.tempPassword, 'Senha#Master9')).token;
    check('user created by the Conta Mãe can work with the assigned profile', !!mTok && (await api('GET', '/api/v1/candidates', { token: mTok })).status === 200 && (await api('GET', '/api/v1/dna', { token: mTok })).status === 200);
    const changedProfile = await T('PATCH', `/api/master/tenants/${tA}/members/${created.json.user.id}`, { profileId: 'collaborator' });
    check('master changes profile: immediate on the live session', changedProfile.json.user?.profileId === 'collaborator' && (await api('GET', '/api/v1/candidates', { token: mTok })).status === 403);
    const withExc = await T('PATCH', `/api/master/tenants/${tA}/members/${created.json.user.id}`, { permissions: [...changedProfile.json.user.permissions, 'offers:view'] });
    check('master grants an individual exception', withExc.json.user?.grantedPermissions?.join() === 'offers:view' && (await api('GET', '/api/v1/offers', { token: mTok })).status === 200);
    check('master cannot touch a member through another organization\'s path (isolation)', (await T('PATCH', `/api/master/tenants/${tB}/members/${created.json.user.id}`, { active: false })).status === 404 && (await T('POST', `/api/master/tenants/${tB}/members/${created.json.user.id}/reset-password`)).status === 404);
    check('master: a profile of another organization is rejected', (await T('POST', `/api/master/tenants/${tB}/members`, { name: 'x', email: `iso-${suffix}@smoke.test`, profileId: 'prf-of-org-a' })).status === 400);
    const mprof = await T('POST', `/api/master/tenants/${tA}/profiles`, { name: 'Perfil da Conta Mãe', permissions: ['dna:view'] });
    check('master creates / edits / deletes profiles of an organization', mprof.status === 201 && (await T('PUT', `/api/master/tenants/${tA}/profiles/${mprof.json.profile.id}`, { permissions: ['dna:view', 'openings:view'] })).json.profile.permissions.length === 2 && (await T('DELETE', `/api/master/tenants/${tA}/profiles/${mprof.json.profile.id}`)).status === 200);
    check('master profile listing is per organization', (await T('GET', `/api/master/tenants/${tB}/profiles`)).json.profiles.every((p: any) => p.id !== mprof.json.profile.id));
    const mreset = await T('POST', `/api/master/tenants/${tA}/members/${created.json.user.id}/reset-password`);
    check('master resets a password (sessions revoked)', mreset.status === 200 && mreset.json.tempPassword?.length >= 12 && (await api('GET', '/api/v1/dna', { token: mTok })).status === 401);
    check('master can deactivate a member; login refused', (await T('PATCH', `/api/master/tenants/${tA}/members/${created.json.user.id}`, { active: false })).json.user?.active === false && (await login(mnew, mreset.json.tempPassword, slugA)).status === 403);

    // ---- Conta Mãe: people across the platform ----------------------------------------------------
    const gEmail = `global-${suffix}@smoke.test`;
    check('global users: non-SuperAdmin -> 403', (await A('GET', '/api/master/users')).status === 403);
    const gNo = await T('POST', '/api/master/users', { name: 'Global Sem Vinculo', email: gEmail });
    check('global user created without links (temp password once)', gNo.status === 201 && gNo.json.user.links.length === 0 && !!gNo.json.tempPassword, gNo.json);
    check('global user without any active link cannot log in yet', (await login(gEmail, gNo.json.tempPassword)).status === 403);
    check('duplicate global user -> 409 (password never replaced)', (await T('POST', '/api/master/users', { name: 'Dup', email: gEmail.toUpperCase() })).status === 409);
    check('global user validation', (await T('POST', '/api/master/users', { name: 'X', email: 'nope' })).status === 400 && (await T('POST', '/api/master/users', { email: 'a@b.co' })).status === 400);
    const gLink = await T('POST', `/api/master/tenants/${tB}/members`, { name: 'Global Sem Vinculo', email: gEmail, profileId: 'collaborator' });
    check('link an existing person to an organization (password kept)', gLink.status === 201 && gLink.json.linkedExisting === true && gLink.json.tempPassword === undefined, gLink.json);
    check('...and it appears in the platform list with its link', (await T('GET', `/api/master/users?search=global-${suffix}`)).json.users[0]?.links?.some((l: any) => l.tenantId === tB && l.profileId === 'collaborator'));
    const gWith = await T('POST', '/api/master/users', { name: 'Global Com Vinculo', email: `global2-${suffix}@smoke.test`, link: { tenantId: tA, profileId: 'recruiter' } });
    check('global user created already linked to an organization', gWith.status === 201 && gWith.json.user.links.length === 1 && gWith.json.user.links[0].tenantId === tA, gWith.json);
    check('...and is visible only inside that organization', (await T('GET', `/api/master/tenants/${tA}/members?search=global2-${suffix}`)).json.total === 1 && (await T('GET', `/api/master/tenants/${tB}/members?search=global2-${suffix}`)).json.total === 0);
    check('link with a profile of another organization is refused and rolled back', (await T('POST', '/api/master/users', { name: 'Rollback', email: `rb-${suffix}@smoke.test`, link: { tenantId: tB, profileId: 'nao-existe' } })).status === 400 && (await T('GET', `/api/master/users?search=rb-${suffix}`)).json.total === 0);
    const gPg = await T('GET', '/api/master/users?pageSize=1&page=1');
    check('global user list paginated + capped', gPg.json.users.length === 1 && gPg.json.total >= 5 && (await T('GET', '/api/master/users?pageSize=100000')).json.pageSize === 100);
    check('global search is a LIKE-safe prefix', (await T('GET', '/api/master/users?search=%25')).json.total === 0);
    const gTok = (await activateUser(slugB, gEmail, gNo.json.tempPassword, 'Senha#Global9')).token;
    check('global user works after activation in the linked org', !!gTok && (await api('GET', '/api/v1/dna', { token: gTok })).status === 200);
    const gOff = await T('PATCH', `/api/master/users/${gNo.json.user.id}`, { active: false });
    check('global deactivation: session dropped and login refused everywhere', gOff.json.user?.active === false && (await api('GET', '/api/v1/dna', { token: gTok })).status === 401 && (await login(gEmail, 'Senha#Global9', slugB)).status === 403);
    check('global reactivation restores access', (await T('PATCH', `/api/master/users/${gNo.json.user.id}`, { active: true })).json.user?.active === true && (await login(gEmail, 'Senha#Global9', slugB)).status === 200);
    const gReset = await T('POST', `/api/master/users/${gNo.json.user.id}/reset-password`);
    check('global password reset', gReset.status === 200 && gReset.json.tempPassword?.length >= 12 && (await login(gEmail, 'Senha#Global9', slugB)).status === 401);
    check('global unknown user -> 404', (await T('PATCH', '/api/master/users/acc-nope', { active: false })).status === 404 && (await T('POST', '/api/master/users/acc-nope/reset-password')).status === 404);

    const susp = await api('PATCH', `/api/master/tenants/${provA.json.tenant.id}/status`, { token: adminToken, body: { status: 'suspended' } });
    check('suspend tenant', susp.json.tenant?.status === 'suspended', susp.json);
    check('suspended org: existing session blocked -> 403', (await A('GET', '/api/v1/users')).status === 403);
    check('suspended org: new login blocked -> 403', (await login(emailA, 'Nova#Senha42', slugA)).status === 403);
    check('suspended org: public portal hidden -> 404', (await api('GET', `/api/public/${slugA}/careers`)).status === 404);
    check('other org unaffected by suspension', (await B('GET', '/api/v1/users')).status === 200);
    check('invalid status -> 400', (await api('PATCH', `/api/master/tenants/${provA.json.tenant.id}/status`, { token: adminToken, body: { status: 'bogus' } })).status === 400);
    check('unknown tenant status update -> 404', (await api('PATCH', '/api/master/tenants/tenant-nope/status', { token: adminToken, body: { status: 'active' } })).status === 404);
    check('reactivate tenant', (await api('PATCH', `/api/master/tenants/${provA.json.tenant.id}/status`, { token: adminToken, body: { status: 'active' } })).json.tenant?.status === 'active' && (await A('GET', '/api/v1/users')).status === 200);

    const resetAdmin = await api('POST', `/api/master/tenants/${provB.json.tenant.id}/reset-admin-password`, { token: adminToken, body: {} });
    check('SuperAdmin issues a new temp password to an org admin', resetAdmin.status === 200 && resetAdmin.json.user?.email === emailB && resetAdmin.json.tempPassword?.length >= 12, resetAdmin.json);
    check('...and the org admin session is revoked', (await B('GET', '/api/v1/users')).status === 401);
    check('reset for unknown org -> 404', (await api('POST', '/api/master/tenants/tenant-nope/reset-admin-password', { token: adminToken, body: {} })).status === 404);

    // ---- Logout ---------------------------------------------------------------------------------
    const tmpLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    check('logout revokes the token', (await api('POST', '/api/auth/logout', { token: tmpLogin.json.token })).status === 200 && (await api('GET', '/api/auth/me', { token: tmpLogin.json.token })).status === 401);

    // ---- Audit trail -------------------------------------------------------------------------------
    // whole trail via keyset pagination (also exercises nextCursor)
    const logs: any[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const pg: any = (await api('GET', `/api/master/audit-logs?limit=200${cursor ? `&before=${encodeURIComponent(cursor)}` : ''}`, { token: adminToken })).json;
      logs.push(...pg.logs);
      cursor = pg.nextCursor;
      if (!cursor) break;
    }
    const has = (action: string, pred: (l: any) => boolean = () => true) => logs.some(l => l.action === action && pred(l));
    check('audit: ORGANIZATION_CREATED by the real actor', has('ORGANIZATION_CREATED', l => l.tenantId === provA.json.tenant.id && l.userId === 'super-01' && l.userName === 'SuperAdmin Root'));
    check('audit: TENANT_STATUS_UPDATED', has('TENANT_STATUS_UPDATED', l => l.tenantId === provA.json.tenant.id));
    check('audit: AI_EVALUATION_COMPLETED attributed to the real user', has('AI_EVALUATION_COMPLETED', l => l.tenantId === provA.json.tenant.id && l.userName === 'Admin A'));
    check('audit: user/profile changes recorded', has('USER_CREATED', l => l.tenantId === provA.json.tenant.id) && has('PROFILE_CREATED') && has('USER_ACCESS_UPDATED') && has('ORGANIZATION_SWITCHED'));
    check('audit: PASSWORD_RESET_ISSUED recorded', has('PASSWORD_RESET_ISSUED', l => l.tenantId === provA.json.tenant.id) && has('PASSWORD_RESET_ISSUED', l => l.tenantId === provB.json.tenant.id));
    check('audit: LOGIN_SUCCEEDED + LOGIN_FAILED recorded', has('LOGIN_SUCCEEDED') && has('LOGIN_FAILED'));
    check('audit: PUBLIC_APPLICATION_RECEIVED recorded', has('PUBLIC_APPLICATION_RECEIVED', l => l.tenantId === provA.json.tenant.id));
    check('audit: no secret material in details', !logs.some(l => /Nova#Senha42|Admin@123|scrypt\$/.test(l.details)));
    check('audit: newest first', logs.every((l, i) => i === 0 || new Date(logs[i - 1].timestamp) >= new Date(l.timestamp)));
    const tel = (await api('GET', '/api/master/telemetry', { token: adminToken })).json.telemetry;
    check('telemetry covers all tenants with real numbers', tel.totalTenants >= 5 && tel.tenantBreakdowns.length === Math.min(tel.totalTenants, 50) && tel.totalStorageUsedMb > 0, tel.totalTenants);

    // ---- Physical checks --------------------------------------------------------------------------------
    const { rows } = await getPool().query('select count(*)::int as n from public.candidates where tenant_id = $1', [provA.json.tenant.id]);
    check('data physically stored in Postgres', rows[0].n === 2, rows[0]);

    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      const anon = { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}` };
      for (const table of ['tenants', 'tenant_users', 'auth_sessions', 'platform_admins', 'app_users', 'access_profiles']) {
        const rest = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?select=*`, { headers: anon });
        const body: any = await rest.json().catch(() => null);
        check(`RLS: anon key gets no rows from ${table}`, rest.status >= 400 || (Array.isArray(body) && body.length === 0), { status: rest.status });
      }
    }
  } finally {
    for (const path of storedFiles) await removeFile(path);
    // ---- Cleanup: remove temporary orgs (cascade users/sessions) and their audit rows ----
    const ids = createdTenantIds.filter(Boolean);
    await getPool().query(`delete from public.platform_audit_logs where user_name like '%@smoke.test' or details like '%@smoke.test%'`);
    if (ids.length) {
      await getPool().query('delete from public.platform_audit_logs where tenant_id = any($1)', [ids]);
      await getPool().query('delete from public.tenants where id = any($1)', [ids]);
      // identities are global (not cascaded by the tenant): remove the ones the test created
      await getPool().query(`delete from public.app_users where email like '%@smoke.test'`);
      const left = await getPool().query('select (select count(*)::int from public.candidates where tenant_id = any($1)) c, (select count(*)::int from public.tenant_users where tenant_id = any($1)) u, (select count(*)::int from public.auth_sessions where tenant_id = any($1)) s', [ids]);
      check('cleanup cascade removed tenant data, users and sessions', left.rows[0].c === 0 && left.rows[0].u === 0 && left.rows[0].s === 0, left.rows[0]);
    }
    await closePool();
  }

  console.log(`\n${passed} verificações OK, ${failures.length} falha(s)`);
  for (const f of failures) console.log('  FALHA:', f);
  process.exit(failures.length ? 1 : 0);
}

main().catch(async err => {
  console.error('Smoke test abortado:', err);
  await closePool();
  process.exit(1);
});
