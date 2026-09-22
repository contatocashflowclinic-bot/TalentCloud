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
import { SYSTEM_TEMPLATES, hasHints, noHints, suggestPositions } from '../src/surveyTemplates.js';
import { parseBlocks } from '../server/tenant/surveyBlocks.js';
import { TenantRepository } from '../server/tenant/TenantRepository.js';
import { AccessService } from '../server/auth/AccessService.js';
import { removeFile, RESUME_BUCKET } from '../server/storage.js';
import { zipSync, strToU8 } from 'fflate';

config({ path: ['.env.local', '.env'], quiet: true });

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || 'admin@admin.com.br';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || 'Admin@123';

const storedFiles = new Set<string>();
const storedResumeFiles = new Set<string>();
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
    check(`[${slug}] offers`, sameData(await repo.offers.list(), (seed.offers ?? []).map((o: any) => ({ documents: [], ...o })))); // documents: the column default (migration 16) is [] and the seed does not carry the field
    check(`[${slug}] onboardings`, sameData(await repo.onboardings.list(), (seed.onboardings ?? []).map((o: any) => ({ admission: [], ...o }))));
    check(`[${slug}] development`, sameData(await repo.development.list(), seed.developmentRecords ?? []));
    check(`[${slug}] climateSurveys`, sameData(await repo.climateSurveys.list(), (seed.climateSurveys ?? []).map((s: any) => ({ commentHidden: false, blockAnswers: {}, hiddenTexts: [], ...s }))));
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

    // =====================================================================
    // Triagem Inteligente de Currículos
    // =====================================================================
    // Set below only when a fake/real Gemini is actually configured on the server: the analyze call then creates a
    // real candidate for org A, which the later "data physically stored" count must account for.
    let screeningCreatedCandidate = false;
    {
      const screeningPdf = (marker: string) => Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\n% marker: ${marker} ${Math.random()}\ntrailer<<>>\n%%EOF`);
      const uploadResume = (token: string, jid: string, body: Buffer, mime: string, name = 'curriculo.pdf') =>
        fetch(`${BASE}/api/v1/screening/jobs/${jid}/files?name=${encodeURIComponent(name)}`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': mime }, body: body as any
        }).then(async r => ({ status: r.status, json: (await r.json().catch(() => ({}))) as any }));

      const board0 = await A('GET', `/api/v1/screening/jobs/${jobId}`);
      check('screening board: no blockers for a vaga with Cargo and DNA', board0.status === 200 && Array.isArray(board0.json.board?.criteria?.blockers) && board0.json.board.criteria.blockers.length === 0, board0.json.board?.criteria);
      check('screening board: unknown vaga -> 404', (await A('GET', '/api/v1/screening/jobs/job-nope')).status === 404);

      const validPdf = screeningPdf('smoke');
      const up1 = await uploadResume(adminA, jobId, validPdf, 'application/pdf', 'curriculo-smoke.pdf');
      check('upload a valid PDF -> 201, status uploaded', up1.status === 201 && up1.json.file?.status === 'uploaded', up1.json);
      const fileId = up1.json.file?.id;
      // storagePath is deliberately not part of the API response (server/tenant/screening.ts fileOf), so the uploaded
      // blob cannot be tracked for cleanup from here; it is an orphan in the disposable test storage, same known gap
      // as a deleted tenant not clearing its Storage files (documented risk, not specific to the smoke test).

      check('duplicate upload (same bytes) -> 409', (await uploadResume(adminA, jobId, validPdf, 'application/pdf', 'curriculo-smoke.pdf')).status === 409);
      check('upload: type not PDF/DOCX -> 400', (await uploadResume(adminA, jobId, Buffer.from('não sou um currículo'), 'text/plain')).status === 400);
      const oldDoc = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(16)]);
      check('upload: old .doc -> 400 with a friendly message', (await uploadResume(adminA, jobId, oldDoc, 'application/msword')).status === 400);
      const docx = Buffer.from(zipSync({
        'word/document.xml': strToU8('<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Currículo em Word para o smoke test.</w:t></w:r></w:p></w:body></w:document>')
      }));
      const upDocx = await uploadResume(adminA, jobId, docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'curriculo-smoke.docx');
      check('upload a valid .docx -> 201', upDocx.status === 201 && upDocx.json.file?.mime?.includes('wordprocessingml'), upDocx.json);

      check('RBAC: INTERVIEWER cannot view the screening board', (await R('INTERVIEWER', 'GET', `/api/v1/screening/jobs/${jobId}`)).status === 403);
      check('RBAC: INTERVIEWER cannot upload', (await uploadResume(tokens.INTERVIEWER, jobId, screeningPdf('interviewer'), 'application/pdf')).status === 403);
      check('RBAC: HIRING_MANAGER can view the board (view permissions), but cannot upload (lacks candidates:create/selection:create)', (await R('HIRING_MANAGER', 'GET', `/api/v1/screening/jobs/${jobId}`)).status === 200 && (await uploadResume(tokens.HIRING_MANAGER, jobId, screeningPdf('hm'), 'application/pdf')).status === 403);

      const allowance = await A('GET', '/api/v1/screening/allowance');
      check('allowance endpoint answers', allowance.status === 200 && typeof allowance.json.allowance?.available === 'boolean', allowance.json);
      const aiConfigured = allowance.json.allowance?.reason !== 'not_configured';

      const an1 = await A('POST', `/api/v1/screening/files/${fileId}/analyze`, {});
      check('analyze -> 200 either way (never a hard error just because the AI is busy/unavailable)', an1.status === 200, an1.json);

      if (!aiConfigured) {
        check('AI not configured: the file stays "uploaded" with a plain-language notice, no candidate is invented', an1.json.file?.status === 'uploaded' && !!an1.json.notice && !an1.json.file?.candidateId, an1.json);
      } else {
        check('AI configured: analysis creates a candidate, an application and a real (gemini) evaluation — never a local estimate', an1.json.file?.status === 'analyzed' && !!an1.json.file?.candidateId && !!an1.json.file?.applicationId, an1.json);
        screeningCreatedCandidate = true;
        const board1 = await A('GET', `/api/v1/screening/jobs/${jobId}`);
        const row1 = board1.json.board?.rows?.find((r: any) => r.applicationId === an1.json.file.applicationId);
        check('the new candidate appears ranked on the board, with a real evaluation (never heuristic)', !!row1 && typeof row1.evaluation?.overallFitScore === 'number', row1);

        const detail1 = await A('GET', `/api/v1/screening/files/${fileId}`);
        check('detail: per-requirement checks match the Cargo requirement count', detail1.status === 200 && detail1.json.detail?.analysis?.requirements?.length === pos.json.position.technicalRequirements.length, detail1.json.detail?.analysis?.requirements);

        check('reanalyzing without force -> returns the same result, no new AI call (idempotent)', (await A('POST', `/api/v1/screening/files/${fileId}/analyze`, {})).json.file?.status === 'analyzed');

        const decideAdvance = await A('POST', `/api/v1/screening/jobs/${jobId}/decisions`, { action: 'advance', items: [{ applicationId: row1.applicationId, fromStageId: row1.stageId }] });
        check('bulk decision: advance moves to the next stage', decideAdvance.json.results?.[0]?.ok === true && decideAdvance.json.results[0].stageId !== row1.stageId, decideAdvance.json);
        check('bulk decision: a stale fromStageId is rejected per-item (partial result), not a hard 500', (await A('POST', `/api/v1/screening/jobs/${jobId}/decisions`, { action: 'advance', items: [{ applicationId: row1.applicationId, fromStageId: row1.stageId }] })).json.results?.[0]?.ok === false);
        check('bulk decision: archive without a reason is rejected per-item', (await A('POST', `/api/v1/screening/jobs/${jobId}/decisions`, { action: 'archive', items: [{ applicationId: row1.applicationId, fromStageId: decideAdvance.json.results[0].stageId }] })).json.results?.[0]?.ok === false);

        check('RBAC: only selection:edit + ai_evaluation:edit can decide (INTERVIEWER cannot)', (await api('POST', `/api/v1/screening/jobs/${jobId}/decisions`, { token: tokens.INTERVIEWER, body: { action: 'hold', items: [{ applicationId: row1.applicationId, fromStageId: decideAdvance.json.results[0].stageId }] } })).status === 403);

        const del = await A('DELETE', `/api/v1/screening/files/${fileId}`, { reason: 'Limpeza do smoke test' });
        check('delete a file requires and records a reason, then 404s afterwards', del.status === 200 && (await A('GET', `/api/v1/screening/files/${fileId}`)).status === 404);
      }

      // Isolation: org B cannot see org A's vaga/board/file through the screening routes
      check('ISOLATION: org B cannot see org A vaga in the screening board', (await B('GET', `/api/v1/screening/jobs/${jobId}`)).status === 404);
      if (fileId) check('ISOLATION: org B cannot download org A currículo', (await fetch(`${BASE}/api/v1/screening/files/${fileId}/file`, { headers: { Authorization: `Bearer ${adminB}` } })).status === 404);

      // Org without the AI module: every screening route answers 403, same mechanism as the rest of the AI feature
      await SU('PATCH', `/api/master/tenants/${tenantAId}`, { enabledRoutines: PLAN_ROUTINES.Scale.filter(k => k !== 'ai_evaluation') });
      check('org WITHOUT the AI module: screening board -> 403', (await A('GET', `/api/v1/screening/jobs/${jobId}`)).status === 403);
      check('org WITHOUT the AI module: upload -> 403', (await uploadResume(adminA, jobId, screeningPdf('noai'), 'application/pdf')).status === 403);
      await SU('PATCH', `/api/master/tenants/${tenantAId}`, { enabledRoutines: PLAN_ROUTINES.Scale });
      check('org module restored: screening board works again', (await A('GET', `/api/v1/screening/jobs/${jobId}`)).status === 200);

      const auditScreening = await SU('GET', '/api/master/audit-logs?limit=200');
      const screeningEvents = (auditScreening.json.logs ?? []).filter((l: any) => String(l.action ?? '').startsWith('RESUME_'));
      check('audit: at least one RESUME_UPLOADED event is recorded', screeningEvents.some((l: any) => l.action === 'RESUME_UPLOADED'), screeningEvents.map((l: any) => l.action));
    }

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

    // ---- Retenção: alertas de turnover (ciclo de vida) -------------------------------------------------
    const rt = '/api/v1/retention';
    // the COLLABORATOR session was revoked by the deactivation test above: sign in again
    tokens.COLLABORATOR = (await login(collab.email, 'Senha#COLLABORATOR9', slugA)).json.token;
    const rtOverview = await A('GET', rt);
    const fulano = (rtOverview.json.turnoverAlerts ?? []).find((a: any) => a.collaboratorName === 'Fulano');
    check('retention overview: metrics, campaigns and lookups; raw survey answers never leave the server', rtOverview.status === 200 && rtOverview.json.metrics?.enps === null && rtOverview.json.metrics.retention90Rate === null && Array.isArray(rtOverview.json.campaigns) && Array.isArray(rtOverview.json.lookups?.departments) && !('climateSurveys' in rtOverview.json), rtOverview.json.metrics);
    check('alert opens as "open" with its history and audit fields', fulano?.status === 'open' && fulano.history.length === 1 && fulano.history[0].kind === 'created' && fulano.earlyWarningSignals.join() === 'faltas,queda' && !!fulano.createdAt && fulano.department === 'Geral', fulano);
    check('alert: name required / invalid level / unknown department / unknown owner -> 400', (await A('POST', `${rt}/alert`, { riskLevel: 'Alto' })).status === 400 && (await A('POST', `${rt}/alert`, { collaboratorName: 'X', riskLevel: 'Crítico' })).status === 400 && (await A('POST', `${rt}/alert`, { collaboratorName: 'X', departmentId: 'dep-nope' })).status === 400 && (await A('POST', `${rt}/alert`, { collaboratorName: 'X', ownerId: 'usr-nope' })).status === 400);
    check('alert: more than 20 signals -> 400', (await A('POST', `${rt}/alert`, { collaboratorName: 'X', earlyWarningSignals: Array.from({ length: 21 }, (_, i) => `s${i}`) })).status === 400);
    const tied = await A('POST', `${rt}/alert`, { collaboratorId: recruiterUser.id, collaboratorName: 'U RECRUITER', departmentId: deptId, riskLevel: 'Baixo', ownerId: recruiterUser.id, earlyWarningSignals: ['a', 'b'], suggestedActions: 'x\ny' });
    const al = tied.json.alert;
    check('alert tied to a real person, a department and an owner', tied.status === 201 && al.collaboratorId === recruiterUser.id && al.departmentId === deptId && !!al.department && al.ownerId === recruiterUser.id && al.suggestedActions.join() === 'x,y', tied.json);
    check('one active alert per person: same id or same name -> 409', (await A('POST', `${rt}/alert`, { collaboratorId: recruiterUser.id, collaboratorName: 'Outro nome' })).status === 409 && (await A('POST', `${rt}/alert`, { collaboratorName: ' fulano ' })).status === 409);
    const alertRace = await Promise.all([1, 2].map(() => A('POST', `${rt}/alert`, { collaboratorId: 'colab-race-alert', collaboratorName: 'Corrida Alerta' })));
    check('simultaneous alerts for the same person keep a single one', alertRace.map(r => r.status).sort().join() === '201,409', alertRace.map(r => r.status));
    check('RBAC: INTERVIEWER and COLLABORATOR cannot read or open alerts; HIRING_MANAGER can', (await R('INTERVIEWER', 'GET', rt)).status === 403 && (await R('COLLABORATOR', 'GET', rt)).status === 403 && (await R('COLLABORATOR', 'POST', `${rt}/alert`, { collaboratorName: 'x' })).status === 403 && (await R('HIRING_MANAGER', 'GET', rt)).status === 200);
    const rtPeople = await A('GET', `${rt}/people`);
    check('people list: members offered, people with an active alert not; only Retention editors see it', rtPeople.status === 200 && rtPeople.json.people.some((p: any) => p.origin === 'member') && !rtPeople.json.people.some((p: any) => p.id === recruiterUser.id || p.name === 'Fulano') && (await R('INTERVIEWER', 'GET', `${rt}/people`)).status === 403, rtPeople.json.people?.map((p: any) => p.name));

    const ap = `${rt}/alert/${al.id}`;
    check('action: text required / too long -> 400', (await A('POST', `${ap}/actions`, {})).status === 400 && (await A('POST', `${ap}/actions`, { action: 'x'.repeat(501) })).status === 400);
    const acted = (await A('POST', `${ap}/actions`, { action: 'Conversa de carreira' })).json.alert;
    check('the first action moves the alert to "monitoring" and logs both lines', acted?.status === 'monitoring' && acted.lastActionTaken === 'Conversa de carreira' && acted.history.map((h: any) => h.kind).join() === 'created,action,status', acted);
    const acted2 = (await A('POST', `${ap}/actions`, { action: 'Revisão do PDI' })).json.alert;
    check('a second action only appends to the history', acted2?.status === 'monitoring' && acted2.history.length === 4 && acted2.lastActionTaken === 'Revisão do PDI', acted2);
    const raised = await A('PATCH', ap, { riskLevel: 'Alto', ownerId: null });
    check('edit: level and owner changes are logged', raised.json.alert?.riskLevel === 'Alto' && raised.json.alert.ownerId === undefined && raised.json.alert.history.filter((h: any) => h.kind === 'risk' || h.kind === 'owner').length === 2, raised.json);
    check('edit: the same values change nothing (no new history line)', (await A('PATCH', ap, { riskLevel: 'Alto' })).json.alert?.history.length === raised.json.alert.history.length);
    check('edit: invalid level -> 400; unknown alert -> 404; read-only profile -> 403', (await A('PATCH', ap, { riskLevel: 'Crítico' })).status === 400 && (await A('PATCH', `${rt}/alert/alt-nope`, { riskLevel: 'Alto' })).status === 404 && (await R('INTERVIEWER', 'PATCH', ap, { riskLevel: 'Baixo' })).status === 403);
    check('status: invalid or unchanged -> 400; dismissing / "left" without a reason -> 400', (await A('POST', `${ap}/status`, { status: 'x' })).status === 400 && (await A('POST', `${ap}/status`, { status: 'monitoring' })).status === 400 && (await A('POST', `${ap}/status`, { status: 'dismissed' })).status === 400 && (await A('POST', `${ap}/status`, { status: 'left' })).status === 400);
    const closedAlert = (await A('POST', `${ap}/status`, { status: 'resolved', note: 'Combinado plano de carreira' })).json.alert;
    check('resolving closes the alert, keeping the note and the time', closedAlert?.status === 'resolved' && !!closedAlert.resolvedAt && closedAlert.resolutionNote === 'Combinado plano de carreira' && closedAlert.history[closedAlert.history.length - 1].kind === 'status', closedAlert);
    check('a closed alert cannot be edited, get actions or go to another status (only reopened)', (await A('PATCH', ap, { riskLevel: 'Baixo' })).status === 400 && (await A('POST', `${ap}/actions`, { action: 'x' })).status === 400 && (await A('POST', `${ap}/status`, { status: 'monitoring' })).status === 400);
    const afterClose = (await A('GET', rt)).json.metrics;
    check('closed alerts leave the active count (Fulano + Corrida Alerta remain)', afterClose.activeAlerts === 2 && afterClose.alertsByRisk.Alto === 1 && afterClose.alertsByRisk['Médio'] === 1, afterClose);
    const second = await A('POST', `${rt}/alert`, { collaboratorId: recruiterUser.id, collaboratorName: 'U RECRUITER' });
    check('after closing, the person can get a new alert; reopening the old one is then refused -> 409', second.status === 201 && (await A('POST', `${ap}/status`, { status: 'open' })).status === 409);
    await A('POST', `${rt}/alert/${second.json.alert.id}/status`, { status: 'dismissed', note: 'Engano' });
    const reopened = (await A('POST', `${ap}/status`, { status: 'open' })).json.alert;
    check('reopening clears the closing data', reopened?.status === 'open' && reopened.resolvedAt === undefined && reopened.resolutionNote === undefined, reopened);
    check('delete: an alert with history cannot be deleted -> 400', (await A('DELETE', ap)).status === 400);
    const untouchedAlert = await A('POST', `${rt}/alert`, { collaboratorName: 'Sem andamento' });
    check('delete: an untouchedAlert alert can be deleted', (await A('DELETE', `${rt}/alert/${untouchedAlert.json.alert.id}`)).status === 200 && !((await A('GET', rt)).json.turnoverAlerts ?? []).some((a: any) => a.id === untouchedAlert.json.alert.id));
    check('delete: unknown -> 404; read-only profile -> 403', (await A('DELETE', `${rt}/alert/alt-nope`)).status === 404 && (await R('INTERVIEWER', 'DELETE', ap)).status === 403);
    check('isolation: org B cannot read or change org A alerts', !((await B('GET', rt)).json.turnoverAlerts ?? []).some((a: any) => a.id === al.id) && (await B('PATCH', ap, { riskLevel: 'Baixo' })).status === 404 && (await B('POST', `${ap}/actions`, { action: 'x' })).status === 404 && (await B('POST', `${ap}/status`, { status: 'dismissed', note: 'x' })).status === 404 && (await B('DELETE', ap)).status === 404);

    // ---- Retenção: pesquisa de clima interna (campanhas, resposta anônima, resultado) --------------------
    const tenantA = provA.json.tenant.id as string;
    // Cargos: the cargo of a person is always a REGISTERED Cargo (module Cargos), never typed text
    const posBody = (title: string, level: string, careerTrack: string) => ({ title, departmentId: deptId, level, careerTrack });
    const analystPos = (await A('POST', '/api/v1/positions', posBody('Analista', 'Pleno', 'Y_TECNICO'))).json.position;
    const managerPos = (await A('POST', '/api/v1/positions', posBody('Gestor da Vaga', 'Gerência', 'GESTÃO'))).json.position;
    check('two cargos registered for the survey tests', !!analystPos?.id && !!managerPos?.id);
    const survey: Record<string, string> = {};
    for (let i = 1; i <= 5; i++) {
      const email = `survey${i}-${suffix}@smoke.test`;
      const made = await A('POST', '/api/v1/users', { name: `Survey ${i}`, email, profileId: 'collaborator', positionId: analystPos.id, departmentId: deptId });
      survey[`S${i}`] = (await activateUser(slugA, email, made.json.tempPassword, `Senha#Survey${i}9`)).token;
    }
    check('five extra members (same department) activated for the survey', Object.values(survey).every(Boolean) && Object.keys(survey).length === 5);
    const allUsers = (await A('GET', '/api/v1/users')).json.users as any[];
    const hmMember = allUsers.find(u => u.profileId === 'hiring_manager');
    const linkHm = await A('PATCH', `/api/v1/users/${hmMember.id}`, { positionId: managerPos.id });
    const s1Member = allUsers.find(u => u.email === `survey1-${suffix}@smoke.test`);
    check('a person given a registered cargo carries its id and its title', s1Member.positionId === analystPos.id && s1Member.jobTitle === 'Analista' && linkHm.json.user?.positionId === managerPos.id && linkHm.json.user.jobTitle === 'Gestor da Vaga', [s1Member, linkHm.json]);
    const typed = await A('POST', '/api/v1/users', { name: 'Texto Livre', email: `livre-${suffix}@smoke.test`, profileId: 'collaborator', jobTitle: 'Astronauta' });
    check('a typed cargo is never accepted: jobTitle is ignored (no cargo linked, default label)', typed.status === 201 && typed.json.user.jobTitle !== 'Astronauta' && typed.json.user.positionId === undefined, typed.json.user);
    const typedPatch = await A('PATCH', `/api/v1/users/${typed.json.user.id}`, { jobTitle: 'Astronauta' });
    check('editing a person with a typed jobTitle changes nothing', typedPatch.status === 200 && typedPatch.json.user.jobTitle !== 'Astronauta');
    const archivedPos = (await A('POST', '/api/v1/positions', posBody('Cargo Arquivado', 'Júnior', 'OPERACIONAL'))).json.position;
    await A('PATCH', `/api/v1/positions/${archivedPos.id}`, { status: 'archived' });
    const userPost = (positionId: string) => A('POST', '/api/v1/users', { name: 'Cargo X', email: `cargox-${Math.random().toString(36).slice(2, 8)}-${suffix}@smoke.test`, profileId: 'collaborator', positionId });
    const deptB = (await B('POST', '/api/v1/departments', { name: 'Dep B', headcountTarget: 5 })).json.department;
    const posB = (await B('POST', '/api/v1/positions', { title: 'Cargo da Org B', departmentId: deptB.id })).json.position;
    check('a cargo that is not registered (unknown, archived or from another organization) is refused -> 400', (await userPost('pos-nope')).status === 400 && (await userPost(archivedPos.id)).status === 400 && (await userPost(posB.id)).status === 400);
    const options = await A('GET', '/api/v1/users/position-options');
    check('the list of cargos a person can be given: active registered cargos only; needs users:view', options.status === 200 && options.json.positions.some((o: any) => o.id === analystPos.id) && !options.json.positions.some((o: any) => o.id === archivedPos.id || o.id === posB.id) && (await R('COLLABORATOR', 'GET', '/api/v1/users/position-options')).status === 403, options.json.positions?.length);
    const linked = await A('PATCH', `/api/v1/users/${typed.json.user.id}`, { positionId: analystPos.id });
    const unlinked = await A('PATCH', `/api/v1/users/${typed.json.user.id}`, { positionId: null });
    check('a person can be linked and unlinked from a cargo (the last title stays only as a label)', linked.json.user?.positionId === analystPos.id && unlinked.status === 200 && unlinked.json.user.positionId === undefined && unlinked.json.user.jobTitle === 'Analista', [linked.json, unlinked.json]);
    await A('PATCH', `/api/v1/positions/${managerPos.id}`, { title: 'Gestor da Vaga (renomeado)' });
    check('renaming a cargo keeps the title of the people linked to it in step', ((await A('GET', '/api/v1/users')).json.users as any[]).find(u => u.id === hmMember.id).jobTitle === 'Gestor da Vaga (renomeado)');
    await A('PATCH', `/api/v1/positions/${managerPos.id}`, { title: 'Gestor da Vaga' });
    const S = (who: string, method: string, path: string, body?: unknown) => api(method, path, { token: survey[who] ?? tokens[who], body });
    const answerOf = (n: number, comment?: string) => ({ enps: n, categories: { lideranca: n, cultura: n, crescimento: n, remuneracao: n, ambiente: n }, ...(comment ? { comment } : {}) });

    const campPath = `${rt}/campaigns`;
    check('campaign: name and period are required -> 400', (await A('POST', campPath, { period: '2026-Q3' })).status === 400 && (await A('POST', campPath, { name: 'x' })).status === 400);
    check('campaign: invalid audience / empty or unknown departments -> 400', (await A('POST', campPath, { name: 'x', period: 'p', audience: 'todos' })).status === 400 && (await A('POST', campPath, { name: 'x', period: 'p', audience: 'departments', departmentIds: [] })).status === 400 && (await A('POST', campPath, { name: 'x', period: 'p', audience: 'departments', departmentIds: ['dep-nope'] })).status === 400);
    check('campaign: closing date in the past or impossible -> 400', (await A('POST', campPath, { name: 'x', period: 'p', closesOn: '2020-01-01' })).status === 400 && (await A('POST', campPath, { name: 'x', period: 'p', closesOn: '2099-02-30' })).status === 400);
    check('RBAC: only who edits Retention creates surveys', (await R('COLLABORATOR', 'POST', campPath, { name: 'x', period: 'p' })).status === 403 && (await R('INTERVIEWER', 'POST', campPath, { name: 'x', period: 'p' })).status === 403);
    const draft = await A('POST', campPath, { name: 'Clima T3', period: '2026-Q3', description: 'Leva 2 min', closesOn: '2099-12-31' });
    const cid = draft.json.campaign?.id as string;
    check('campaign is created as a draft for the whole organization', draft.status === 201 && draft.json.campaign.status === 'draft' && draft.json.campaign.audience === 'all' && draft.json.campaign.responded === 0 && draft.json.campaign.eligible >= 10, draft.json);
    const respond = `${rt}/survey/${cid}/respond`;
    check('a draft cannot be answered and shows no pending survey', (await S('S1', 'POST', respond, answerOf(8))).status === 400 && ((await S('S1', 'GET', `${rt}/survey/pending`)).json.surveys ?? []).length === 0);
    check('draft: editable', (await A('PATCH', `${campPath}/${cid}`, { name: 'Clima do 3º trimestre' })).json.campaign?.name === 'Clima do 3º trimestre');
    const publishedCampaign = await A('POST', `${campPath}/${cid}/publish`);
    check('publish opens the survey; publishing twice -> 400', publishedCampaign.status === 200 && publishedCampaign.json.campaign.status === 'open' && !!publishedCampaign.json.campaign.publishedAt && (await A('POST', `${campPath}/${cid}/publish`)).status === 400, publishedCampaign.json);
    check('open survey: only closing date and action plan change; it cannot be deleted', (await A('PATCH', `${campPath}/${cid}`, { name: 'x' })).status === 400 && (await A('PATCH', `${campPath}/${cid}`, { closesOn: '2099-11-30' })).json.campaign?.closesOn === '2099-11-30' && (await A('DELETE', `${campPath}/${cid}`)).status === 400);

    const pend = (await S('COLLABORATOR', 'GET', `${rt}/survey/pending`)).json.surveys ?? [];
    check('everyone in the audience sees the open survey (COLLABORATOR included)', pend.length === 1 && pend[0].campaignId === cid && pend[0].answered === false, pend);
    check('answer: scores outside 0-10 / decimals / missing categories -> 400', (await S('COLLABORATOR', 'POST', respond, { ...answerOf(8), enps: 11 })).status === 400 && (await S('COLLABORATOR', 'POST', respond, { ...answerOf(8), enps: 7.5 })).status === 400 && (await S('COLLABORATOR', 'POST', respond, { enps: 8 })).status === 400 && (await S('COLLABORATOR', 'POST', respond, { enps: 8, categories: { lideranca: 8 } })).status === 400);
    check('answer accepted; answering twice -> 409', (await S('COLLABORATOR', 'POST', respond, answerOf(8, 'Bom time'))).status === 201 && (await S('COLLABORATOR', 'POST', respond, answerOf(10))).status === 409);
    check('the survey then shows as answered', ((await S('COLLABORATOR', 'GET', `${rt}/survey/pending`)).json.surveys ?? [])[0]?.answered === true);
    check('answer: unknown survey -> 404; another org -> 404', (await S('COLLABORATOR', 'POST', `${rt}/survey/cmp-nope/respond`, answerOf(8))).status === 404 && (await B('POST', respond, answerOf(8))).status === 404);

    // Anonymity threshold: 1 and 4 answers reveal nothing, the 5th releases the result
    const results = `${campPath}/${cid}/results`;
    const r1 = (await A('GET', results)).json.results;
    check('results with 1 answer: nothing detailed (below the anonymity minimum)', r1.released === false && r1.enps === null && r1.comments.length === 0 && r1.departments.length === 0 && r1.campaign.responded === 1 && r1.minGroup === 5, r1);
    check('results: only Retention viewers (COLLABORATOR, INTERVIEWER -> 403)', (await R('COLLABORATOR', 'GET', results)).status === 403 && (await R('INTERVIEWER', 'GET', results)).status === 403 && (await R('HIRING_MANAGER', 'GET', results)).status === 200);
    await S('HIRING_MANAGER', 'POST', respond, answerOf(7));
    await S('INTERVIEWER', 'POST', respond, answerOf(9, 'Mais reconhecimento'));
    await A('POST', respond, answerOf(10));
    const r4 = (await A('GET', results)).json.results;
    check('results with 4 answers: still nothing detailed', r4.released === false && r4.enps === null && r4.campaign.responded === 4, r4);
    const raceAnswers = await Promise.all([1, 2].map(() => S('S1', 'POST', respond, answerOf(10, 'Liderança próxima e clara'))));
    check('the same person answering twice at once records a single answer', raceAnswers.map(r => r.status).sort().join() === '201,409', raceAnswers.map(r => r.status));
    const r5 = (await A('GET', results)).json.results;
    check('results with 5 answers: released', r5.released === true && r5.enps?.responses === 5 && r5.campaign.responded === 5, r5);
    await S('S2', 'POST', respond, answerOf(10));
    await S('S3', 'POST', respond, answerOf(9));
    await S('S4', 'POST', respond, answerOf(5, 'Cite Fulano de Tal'));
    const r8 = (await A('GET', results)).json.results;
    check('a department with 4 answers is not shown', r8.released === true && r8.departments.length === 0, r8.departments);
    await S('S5', 'POST', respond, answerOf(0));
    const r9 = (await A('GET', results)).json.results;
    check('eNPS: (promoters − detractors) / answers, and the neutral / promoter / detractor split', r9.enps?.score === 33 && r9.enps.promoters === 5 && r9.enps.passives === 2 && r9.enps.detractors === 2 && r9.zone === 'great', r9.enps);
    check('category averages and participation', r9.categoryAverages?.lideranca === 7.6 && r9.campaign.responded === 9 && r9.responseRate === Math.round((9 / r9.campaign.eligible) * 100), r9.categoryAverages);
    const deptRes = r9.departments[0];
    check('a department with 5 answers is shown, with its own eNPS and averages', r9.departments.length === 1 && deptRes.departmentId === deptId && deptRes.responses === 5 && deptRes.enps === 20 && deptRes.categoryAverages.lideranca === 6.8, r9.departments);
    check('comments are listed without any author', r9.comments.length === 4 && r9.comments.every((c: any) => Object.keys(c).sort().join() === 'hidden,id,text'), r9.comments);

    const memberIds: string[] = (await A('GET', '/api/v1/users')).json.users.map((u: any) => u.id);
    const surveyRows = await getPool().query('select * from public.climate_surveys where tenant_id = $1 and campaign_id = $2', [tenantA, cid]);
    const answerCols = (await getPool().query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'climate_surveys'`)).rows.map((r: any) => r.column_name as string);
    const partCols = (await getPool().query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'climate_participation'`)).rows.map((r: any) => r.column_name as string);
    check('anonymity: the answers table has no column that could hold who answered', !answerCols.some(c => /user|member|author|respondent|email|name/.test(c)), answerCols);
    check('anonymity: no surveyRows answer contains any member id', surveyRows.rows.length === 9 && !memberIds.some(id => JSON.stringify(surveyRows.rows).includes(id)), surveyRows.rows.length);
    check('anonymity: participation keeps no sequence, time or answer reference', partCols.length === 4 && !partCols.includes('seq') && partCols.includes('responded_on'), partCols);

    // Comments: hide (e.g. one that names a person)
    const naming = r9.comments.find((c: any) => /Fulano de Tal/.test(c.text));
    check('hide a comment: only Retention editors; needs a boolean; unknown -> 404', (await R('COLLABORATOR', 'PATCH', `${campPath}/${cid}/comments/${naming.id}`, { hidden: true })).status === 403 && (await A('PATCH', `${campPath}/${cid}/comments/${naming.id}`, { hidden: 'sim' })).status === 400 && (await A('PATCH', `${campPath}/${cid}/comments/cs-nope`, { hidden: true })).status === 404);
    check('a hidden comment stays in the list flagged as hidden; showing it again restores it', (await R('HIRING_MANAGER', 'PATCH', `${campPath}/${cid}/comments/${naming.id}`, { hidden: true })).status === 200 && (await A('GET', results)).json.results.comments.find((c: any) => c.id === naming.id)?.hidden === true && (await A('PATCH', `${campPath}/${cid}/comments/${naming.id}`, { hidden: false })).status === 200 && (await A('GET', results)).json.results.comments.find((c: any) => c.id === naming.id)?.hidden === false);

    // Overview: the latest released survey becomes the organization eNPS
    const rtAfter = (await A('GET', rt)).json;
    check('overview: eNPS of the latest released survey, trend, and no raw answers', rtAfter.metrics.enps?.score === 33 && rtAfter.metrics.zone === 'great' && rtAfter.metrics.trend.length === 1 && rtAfter.metrics.trend[0].responses === 9 && rtAfter.metrics.categoryAverages.lideranca === 7.6 && !('climateSurveys' in rtAfter), rtAfter.metrics);

    // Audience by department
    const dcp = await A('POST', campPath, { name: 'Só o time', period: '2026-Q4', audience: 'departments', departmentIds: [deptId] });
    check('audience by department counts only its members', dcp.status === 201 && dcp.json.campaign.eligible >= 5 && dcp.json.campaign.eligible < 10 && dcp.json.campaign.departmentIds.join() === deptId, dcp.json);
    const did = dcp.json.campaign.id as string;
    await A('POST', `${campPath}/${did}/publish`);
    check('only the department sees the survey and can answer it', ((await S('S1', 'GET', `${rt}/survey/pending`)).json.surveys ?? []).length === 2 && ((await S('COLLABORATOR', 'GET', `${rt}/survey/pending`)).json.surveys ?? []).length === 1 && (await S('COLLABORATOR', 'POST', `${rt}/survey/${did}/respond`, answerOf(8))).status === 403);
    check('closing: only Retention editors; then nobody answers and it cannot be deleted', (await R('COLLABORATOR', 'POST', `${campPath}/${did}/close`)).status === 403 && (await R('HIRING_MANAGER', 'POST', `${campPath}/${did}/close`)).json.campaign?.status === 'closed' && (await S('S2', 'POST', `${rt}/survey/${did}/respond`, answerOf(8))).status === 400 && (await A('DELETE', `${campPath}/${did}`)).status === 400 && (await A('POST', `${campPath}/${did}/close`)).status === 400);
    const scratch = await A('POST', campPath, { name: 'Rascunho descartável', period: 'x' });
    check('a draft can be deleted', (await A('DELETE', `${campPath}/${scratch.json.campaign.id}`)).status === 200 && !((await A('GET', rt)).json.campaigns ?? []).some((c: any) => c.id === scratch.json.campaign.id));
    check('isolation: org B cannot see, publish, close or read the results of org A surveys', !((await B('GET', rt)).json.campaigns ?? []).some((c: any) => c.id === cid) && (await B('GET', results)).status === 404 && (await B('POST', `${campPath}/${cid}/close`)).status === 404 && (await B('PATCH', `${campPath}/${cid}`, { actionPlan: 'x' })).status === 404 && (await B('DELETE', `${campPath}/${cid}`)).status === 404);

    // Past the closing date the survey reads as closed by itself
    await getPool().query(`update public.climate_campaigns set closes_on = '2020-01-01' where tenant_id = $1 and id = $2`, [tenantA, cid]);
    const lapsed = ((await A('GET', rt)).json.campaigns ?? []).find((c: any) => c.id === cid);
    check('past the closing date the survey is closed by itself and refuses answers', lapsed?.status === 'closed' && (await S('S5', 'POST', respond, answerOf(8))).status === 400 && ((await S('S1', 'GET', `${rt}/survey/pending`)).json.surveys ?? []).every((s: any) => s.campaignId !== cid), lapsed);
    check('closed survey: only the action plan changes, and the result stays available', (await A('PATCH', `${campPath}/${cid}`, { name: 'x' })).status === 400 && (await A('PATCH', `${campPath}/${cid}`, { actionPlan: 'Rever a comunicação da liderança' })).json.campaign?.actionPlan === 'Rever a comunicação da liderança' && (await A('GET', results)).json.results.campaign.actionPlan === 'Rever a comunicação da liderança');

    // ---- Retenção: templates de pesquisa e perguntas estratégicas por cargo -----------------------------
    check('library: every system template passes the validation the server applies, with unique ids', SYSTEM_TEMPLATES.length >= 8 && new Set(SYSTEM_TEMPLATES.map(t => t.id)).size === SYSTEM_TEMPLATES.length && SYSTEM_TEMPLATES.every(t => {
      try {
        const parsed = parseBlocks(t.blocks);
        const ids = parsed.flatMap(b => [b.id, ...b.questions.map(q => q.id)]);
        return t.system && t.id.startsWith('sys-') && parsed.length === t.blocks.length && parsed.every(b => b.questions.length > 0) && new Set(ids).size === ids.length;
      } catch { return false; }
    }));
    const cargos = [
      { id: 'a', level: 'Gerência', careerTrack: 'GESTÃO' }, { id: 'b', level: 'Pleno', careerTrack: 'Y_TECNICO' },
      { id: 'c', level: 'Coordenação', careerTrack: 'OPERACIONAL' }, { id: 'd', level: 'Júnior', careerTrack: 'OPERACIONAL' }
    ] as any[];
    const ids = (hints: any) => suggestPositions(hints, cargos).map(x => x.id).join();
    check('cargo suggestion: by level and/or career track of the registered cargo (both must match when both are given); no hint, no suggestion', ids({ levels: ['Coordenação', 'Gerência', 'Diretoria'], careerTracks: [] }) === 'a,c' && ids({ levels: [], careerTracks: ['OPERACIONAL'] }) === 'c,d' && ids({ levels: ['Coordenação'], careerTracks: ['OPERACIONAL'] }) === 'c' && ids(noHints()) === '' && !hasHints(noHints()));
    check('library: no template carries cargo ids or typed keywords; blocks for everyone carry no suggestion', SYSTEM_TEMPLATES.every(t => t.blocks.every(b => b.positionIds.length === 0 && (b.audience === 'all' ? !hasHints(b.targetHints) : true) && !('targetKeywords' in b))));

    const tp = `${rt}/templates`;
    const tplOverview = (await A('GET', rt)).json;
    check('overview lists the organization templates (none yet), the registered cargos with their people and who is still without a cargo', Array.isArray(tplOverview.surveyTemplates) && tplOverview.surveyTemplates.length === 0 && tplOverview.positions.find((c: any) => c.id === analystPos.id)?.count === 5 && !tplOverview.positions.some((c: any) => c.id === archivedPos.id) && tplOverview.unlinkedMembers >= 1, [tplOverview.positions, tplOverview.unlinkedMembers]);
    const lead = SYSTEM_TEMPLATES.find(t => t.id === 'sys-lideranca')!;
    check('RBAC: only Retention editors manage templates', (await R('COLLABORATOR', 'POST', tp, { name: 'x', blocks: [] })).status === 403 && (await R('INTERVIEWER', 'POST', tp, { name: 'x', blocks: [] })).status === 403);
    const oneQ = (over: any = {}) => ({ text: 'Pergunta?', type: 'scale', ...over });
    const oneBlock = (over: any = {}) => ({ title: 'Bloco', audience: 'all', questions: [oneQ()], ...over });
    check('template: name required; block without questions; invalid type; choice needs 2+ options -> 400', (await A('POST', tp, { blocks: [oneBlock()] })).status === 400 && (await A('POST', tp, { name: 'T', blocks: [oneBlock({ questions: [] })] })).status === 400 && (await A('POST', tp, { name: 'T', blocks: [oneBlock({ questions: [oneQ({ type: 'estrela' })] })] })).status === 400 && (await A('POST', tp, { name: 'T', blocks: [oneBlock({ questions: [oneQ({ type: 'choice', options: ['só uma'] })] })] })).status === 400);
    check('template: limits (7 blocks, 13 questions in a block, 9 options, 31 questions) -> 400', (await A('POST', tp, { name: 'T', blocks: Array.from({ length: 7 }, () => oneBlock()) })).status === 400 && (await A('POST', tp, { name: 'T', blocks: [oneBlock({ questions: Array.from({ length: 13 }, () => oneQ()) })] })).status === 400 && (await A('POST', tp, { name: 'T', blocks: [oneBlock({ questions: [oneQ({ type: 'choice', options: Array.from({ length: 9 }, (_, i) => `o${i}`) })] })] })).status === 400 && (await A('POST', tp, { name: 'T', blocks: Array.from({ length: 3 }, () => oneBlock({ questions: Array.from({ length: 11 }, () => oneQ()) })) })).status === 400);
    check('template: invalid audience / blocks not a list -> 400', (await A('POST', tp, { name: 'T', blocks: [oneBlock({ audience: 'ninguem' })] })).status === 400 && (await A('POST', tp, { name: 'T', blocks: 'nada' })).status === 400);
    const copy = await A('POST', tp, { name: 'Liderança — nossa versão', description: 'Ajustado pelo RH', focus: 'Liderança', basedOn: lead.id, blocks: lead.blocks });
    const tpl = copy.json.template;
    check('a system template can be copied as the organization template (blocks, suggestions and ids kept)', copy.status === 201 && tpl.system === false && tpl.basedOn === lead.id && tpl.blocks.length === 2 && tpl.blocks[1].audience === 'roles' && tpl.blocks[1].targetHints.levels.includes('Gerência') && tpl.blocks[0].questions[0].id === lead.blocks[0].questions[0].id && !!tpl.createdAt, copy.json);
    const noIds = await A('POST', tp, { name: 'Sem ids de cargo', blocks: [oneBlock({ audience: 'roles', positionIds: [analystPos.id], targetHints: { levels: ['Pleno'] } })] });
    check('template: hints must be real levels / tracks; a template never keeps cargo ids', (await A('POST', tp, { name: 'Hint ruim', blocks: [oneBlock({ audience: 'roles', targetHints: { levels: ['Rei'] } })] })).status === 400 && (await A('POST', tp, { name: 'Hint ruim 2', blocks: [oneBlock({ audience: 'roles', targetHints: { careerTracks: ['MAGICA'] } })] })).status === 400 && noIds.status === 201 && noIds.json.template.blocks[0].positionIds.length === 0 && noIds.json.template.blocks[0].targetHints.levels.join() === 'Pleno', noIds.json);
    check('template: duplicate name (any case) -> 409', (await A('POST', tp, { name: 'liderança — NOSSA versão', blocks: [oneBlock()] })).status === 409);
    const editedTpl = await A('PATCH', `${tp}/${tpl.id}`, { name: 'Liderança 2026', blocks: [oneBlock({ title: 'Só um', questions: [oneQ({ text: 'Confia na liderança?' })] })] });
    check('template: edit name and blocks (updatedAt moves); invalid edit / unknown -> 400 / 404', editedTpl.status === 200 && editedTpl.json.template.name === 'Liderança 2026' && editedTpl.json.template.blocks.length === 1 && editedTpl.json.template.blocks[0].questions[0].text === 'Confia na liderança?' && (await A('PATCH', `${tp}/${tpl.id}`, { blocks: [oneBlock({ questions: [] })] })).status === 400 && (await A('PATCH', `${tp}/tpl-nope`, { name: 'x' })).status === 404, editedTpl.json);
    check('template: renaming to the name of another one -> 409', (await A('POST', tp, { name: 'Outro template', blocks: [oneBlock()] })).status === 201 && (await A('PATCH', `${tp}/${tpl.id}`, { name: 'outro template' })).status === 409);
    check('isolation: org B does not see, edit or delete org A templates', !((await B('GET', rt)).json.surveyTemplates ?? []).some((t: any) => t.id === tpl.id) && (await B('PATCH', `${tp}/${tpl.id}`, { name: 'x' })).status === 404 && (await B('DELETE', `${tp}/${tpl.id}`)).status === 404);
    check('template: delete (unknown -> 404; read-only profile -> 403)', (await R('INTERVIEWER', 'DELETE', `${tp}/${tpl.id}`)).status === 403 && (await A('DELETE', `${tp}/${tpl.id}`)).status === 200 && (await A('DELETE', `${tp}/${tpl.id}`)).status === 404);

    // Strategic blocks by job title inside one survey
    const sBlocks = [
      { title: 'Para todos', audience: 'all', questions: [{ text: 'A empresa comunica bem?', type: 'scale' }, { text: 'Qual benefício você mais valoriza?', type: 'choice', options: ['Saúde', 'Alimentação', 'Outro'] }, { text: 'Alguma sugestão?', type: 'text', required: false }] },
      { title: 'Só analistas', audience: 'roles', positionIds: [analystPos.id], targetHints: { levels: ['Pleno'] }, questions: [{ text: 'As ferramentas são adequadas?', type: 'scale' }, { text: 'O que mais atrapalha?', type: 'text', required: false }] },
      { title: 'Só gestores', audience: 'roles', positionIds: [managerPos.id], questions: [{ text: 'Você tem autonomia para decidir?', type: 'scale' }] }
    ];
    check('campaign with blocks: not a list / invalid block -> 400', (await A('POST', campPath, { name: 'x', period: 'p', blocks: 'nada' })).status === 400 && (await A('POST', campPath, { name: 'x', period: 'p', blocks: [{ audience: 'all', questions: [] }] })).status === 400);
    const withBlocks = await A('POST', campPath, { name: 'Estratégicas por cargo', period: '2026-Q4', templateName: 'Feito à mão', blocks: sBlocks });
    const bc = withBlocks.json.campaign;
    check('campaign keeps its blocks (ids generated, "todos" without cargos, roles with the registered cargo) and the template name', withBlocks.status === 201 && bc.blocks.length === 3 && bc.blocks.every((b: any) => b.id && b.questions.every((q: any) => q.id)) && bc.blocks[0].positionIds.length === 0 && bc.blocks[1].positionIds.join() === analystPos.id && bc.templateName === 'Feito à mão', withBlocks.json);
    check('a block can only point to cargos registered in this organization (unknown or another org -> 400)', (await A('POST', campPath, { name: 'x', period: 'p', blocks: [{ title: 'B', audience: 'roles', positionIds: ['pos-nope'], questions: [oneQ()] }] })).status === 400 && (await A('POST', campPath, { name: 'x', period: 'p', blocks: [{ title: 'B', audience: 'roles', positionIds: [posB.id], questions: [oneQ()] }] })).status === 400);
    const scratchBlocks = await A('POST', campPath, { name: 'Rascunho de blocos', period: 'x', blocks: [{ title: 'Vazio', audience: 'all', questions: [] }] });
    const scratchRoles = await A('POST', campPath, { name: 'Rascunho de cargos', period: 'x', blocks: [{ title: 'Sem cargo', audience: 'roles', questions: [oneQ()] }] });
    check('saving an incomplete draft is fine, but publishing needs questions in every block and cargos in every "cargos" block -> 400', scratchBlocks.status === 201 && scratchRoles.status === 201 && (await A('POST', `${campPath}/${scratchBlocks.json.campaign.id}/publish`)).status === 400 && (await A('POST', `${campPath}/${scratchRoles.json.campaign.id}/publish`)).status === 400);
    const bid = bc.id as string;
    const bRespond = `${rt}/survey/${bid}/respond`;
    const edB = await A('PATCH', `${campPath}/${bid}`, { blocks: [...bc.blocks, { title: 'Provisório', audience: 'all', questions: [oneQ()] }] });
    check('draft: blocks can be editedTpl (add a block, then remove it)', edB.json.campaign?.blocks.length === 4 && (await A('PATCH', `${campPath}/${bid}`, { blocks: bc.blocks })).json.campaign?.blocks.length === 3);
    check('publish survey with blocks', (await A('POST', `${campPath}/${bid}/publish`)).json.campaign?.status === 'open');
    check('open survey: blocks are locked', (await A('PATCH', `${campPath}/${bid}`, { blocks: [] })).status === 400);

    const pendOf = async (who: string) => ((await S(who, 'GET', `${rt}/survey/pending`)).json.surveys ?? []).find((s: any) => s.campaignId === bid);
    const titlesOf = (s: any) => (s?.blocks ?? []).map((b: any) => b.title).join();
    const pS1 = await pendOf('S1'), pHM = await pendOf('HIRING_MANAGER'), pCO = await pendOf('COLLABORATOR'), pAD = (((await A('GET', `${rt}/survey/pending`)).json.surveys ?? []).find((s: any) => s.campaignId === bid));
    check('each person sees only the blocks of their cargo (analyst / manager / everyone else)', titlesOf(pS1) === 'Para todos,Só analistas' && titlesOf(pHM) === 'Para todos,Só gestores' && titlesOf(pCO) === 'Para todos' && titlesOf(pAD) === 'Para todos', [titlesOf(pS1), titlesOf(pHM), titlesOf(pCO), titlesOf(pAD)]);
    check('the blocks reach the respondent without the cargos they were aimed at', pS1.blocks.every((b: any) => !('positionIds' in b) && !('targetHints' in b) && !('audience' in b)));

    const qid = (p: any, blockTitle: string, i: number) => p.blocks.find((b: any) => b.title === blockTitle).questions[i].id as string;
    const analystAnswers = (p: any, comm: number, benefit: string, tools: number, text?: string) => ({
      [qid(p, 'Para todos', 0)]: comm, [qid(p, 'Para todos', 1)]: benefit, [qid(p, 'Só analistas', 0)]: tools, ...(text ? { [qid(p, 'Só analistas', 1)]: text } : {})
    });
    const withCore = (n: number, answers: unknown) => ({ ...answerOf(n), answers });
    const badTries = [
      withCore(8, {}),                                                                           // required questions missing
      withCore(8, { ...analystAnswers(pS1, 8, 'Saúde', 6), [qid(pHM, 'Só gestores', 0)]: 9 }),      // a question of a block aimed at another cargo
      withCore(8, analystAnswers(pS1, 11, 'Saúde', 6)),                                          // scale outside 0-10
      withCore(8, analystAnswers(pS1, 8, 'Vinho', 6)),                                           // not one of the options
      withCore(8, analystAnswers(pS1, 8, 'Saúde', 6, 'x'.repeat(1001))),                         // text too long
      withCore(8, { ...analystAnswers(pS1, 8, 'Saúde', 6), 'q-inexistente': 1 }),                // unknown question
      withCore(8, 'texto')                                                                       // not an object
    ];
    const badStatuses: number[] = [];
    for (const body of badTries) badStatuses.push((await S('S1', 'POST', bRespond, body)).status);
    check('answers to strategic questions are validated (required, other cargo, range, options, length, unknown, format) -> 400', badStatuses.every(s => s === 400), badStatuses);
    check('a manager cannot skip the manager block, an analyst cannot answer it', (await S('HIRING_MANAGER', 'POST', bRespond, withCore(8, { [qid(pHM, 'Para todos', 0)]: 8, [qid(pHM, 'Para todos', 1)]: 'Saúde' }))).status === 400);
    check('a survey without strategic blocks refuses any block answer', (await S('S2', 'POST', `${rt}/survey/${did}/respond`, withCore(8, { 'q-x': 1 }))).status === 400);

    // answer order chosen to test the per-block threshold: 4 outsiders + 4 analysts, then the 5th analyst
    check('answers from people outside the analyst group', (await S('COLLABORATOR', 'POST', bRespond, withCore(4, { [qid(pCO, 'Para todos', 0)]: 4, [qid(pCO, 'Para todos', 1)]: 'Alimentação' }))).status === 201
      && (await S('INTERVIEWER', 'POST', bRespond, withCore(6, { [qid(pCO, 'Para todos', 0)]: 6, [qid(pCO, 'Para todos', 1)]: 'Saúde' }))).status === 201
      && (await S('HIRING_MANAGER', 'POST', bRespond, withCore(8, { [qid(pHM, 'Para todos', 0)]: 8, [qid(pHM, 'Para todos', 1)]: 'Saúde', [qid(pHM, 'Só gestores', 0)]: 9, [qid(pHM, 'Para todos', 2)]: 'Mais clareza' }))).status === 201
      && (await A('POST', bRespond, withCore(10, { [qid(pAD, 'Para todos', 0)]: 10, [qid(pAD, 'Para todos', 1)]: 'Outro' }))).status === 201);
    const scores: [string, number, string, number, string?][] = [['S1', 8, 'Saúde', 10, 'Falta integração'], ['S2', 8, 'Saúde', 8, 'Sistema lento'], ['S3', 6, 'Saúde', 6, 'Cite Beltrano'], ['S4', 10, 'Alimentação', 4, 'Muitas reuniões']];
    for (const [who, comm, benefit, tools, text] of scores) {
      const p = await pendOf(who);
      await S(who, 'POST', bRespond, withCore(comm, analystAnswers(p, comm, benefit, tools, text)));
    }
    const bResults = `${campPath}/${bid}/results`;
    const b8 = (await A('GET', bResults)).json.results;
    const blk = (r: any, title: string) => r.blocks.find((b: any) => b.title === title);
    check('a block with 4 answers stays hidden (analysts), while the block for everyone is already shown', b8.campaign.responded === 8 && blk(b8, 'Só analistas').responded === 4 && blk(b8, 'Só analistas').released === false && blk(b8, 'Só analistas').questions.every((q: any) => q.released === false && q.average === undefined && q.comments === undefined) && blk(b8, 'Para todos').released === true, b8.blocks);
    const p5 = await pendOf('S5');
    await S('S5', 'POST', bRespond, withCore(10, analystAnswers(p5, 10, 'Outro', 2, 'Poucos treinamentos')));
    const b9 = (await A('GET', bResults)).json.results;
    const all = blk(b9, 'Para todos'), analysts = blk(b9, 'Só analistas'), managers = blk(b9, 'Só gestores');
    check('the 5th analyst releases the analyst block; audience and response counts per block', analysts.released === true && analysts.responded === 5 && analysts.eligible === 5 && managers.eligible === 1 && managers.responded === 1 && all.responded === 9 && all.eligible === b9.campaign.eligible, [analysts.responded, analysts.eligible, managers.eligible, all.responded]);
    check('scale questions: average of the answers (block for everyone 7.8; analysts 6)', all.questions[0].average === 7.8 && analysts.questions[0].average === 6, [all.questions[0].average, analysts.questions[0].average]);
    check('choice questions: count per option', all.questions[1].options.map((o: any) => `${o.label}:${o.count}`).join() === 'Saúde:5,Alimentação:2,Outro:2', all.questions[1].options);
    check('a text question below the minimum is not detailed; at 5 answers it lists comments without author', all.questions[2].responses === 1 && all.questions[2].released === false && all.questions[2].comments === undefined && analysts.questions[1].released === true && analysts.questions[1].comments.length === 5 && analysts.questions[1].comments.every((c: any) => Object.keys(c).sort().join() === 'hidden,id,questionId,text'), [all.questions[2], analysts.questions[1].comments]);
    check('a block aimed at a single person never releases (manager block: 1 answer)', managers.released === false && managers.questions[0].released === false && managers.questions[0].average === undefined, managers);
    const naming2 = analysts.questions[1].comments.find((c: any) => /Beltrano/.test(c.text));
    const textQ = analysts.questions[1].questionId as string;
    check('hide a text answer of a strategic question: only editors, only text questions, unknown response -> 404', (await R('COLLABORATOR', 'PATCH', `${campPath}/${bid}/comments/${naming2.id}`, { hidden: true, questionId: textQ })).status === 403 && (await A('PATCH', `${campPath}/${bid}/comments/${naming2.id}`, { hidden: true, questionId: analysts.questions[0].questionId })).status === 400 && (await A('PATCH', `${campPath}/${bid}/comments/cs-nope`, { hidden: true, questionId: textQ })).status === 404);
    const hid = await R('HIRING_MANAGER', 'PATCH', `${campPath}/${bid}/comments/${naming2.id}`, { hidden: true, questionId: textQ });
    const b9b = blk((await A('GET', bResults)).json.results, 'Só analistas');
    check('the hidden text is flagged (not the other answers); showing it again restores it', hid.status === 200 && b9b.questions[1].comments.find((c: any) => c.id === naming2.id).hidden === true && b9b.questions[1].comments.filter((c: any) => c.hidden).length === 1 && (await A('PATCH', `${campPath}/${bid}/comments/${naming2.id}`, { hidden: false, questionId: textQ })).status === 200 && blk((await A('GET', bResults)).json.results, 'Só analistas').questions[1].comments.every((c: any) => !c.hidden));
    const bRows = await getPool().query('select * from public.climate_surveys where tenant_id = $1 and campaign_id = $2', [tenantA, bid]);
    const memberIds2: string[] = (await A('GET', '/api/v1/users')).json.users.map((u: any) => u.id);
    check('anonymity holds for strategic answers: stored with no member id and no cargo (only the question ids)', bRows.rows.length === 9 && !memberIds2.some(id => JSON.stringify(bRows.rows).includes(id)) && !bRows.rows.some((r: any) => JSON.stringify(r).includes(analystPos.id) || JSON.stringify(r).includes(managerPos.id)) && bRows.rows.some((r: any) => Object.keys(r.block_answers).length >= 3), bRows.rows.length);
    check('the results of a survey without blocks carry an empty block list (older surveys)', (await A('GET', `${campPath}/${cid}/results`)).json.results.blocks.length === 0);

    // ---- Retenção: sigilo dos alertas por equipe --------------------------------------------------
    const HM = (method: string, path: string, body?: unknown) => R('HIRING_MANAGER', method, path, body);
    const mkAlert = (id: string, name: string, extra: any = {}) => A('POST', `${rt}/alert`, { collaboratorId: id, collaboratorName: name, ...extra });
    const teamDept = (await A('POST', '/api/v1/departments', { name: 'Chefiado pelo Gestor', headcountTarget: 3, managerId: hmMember.id })).json.department;
    const aOut = await mkAlert('colab-scope-out', 'Pessoa Fora da Equipe', { riskLevel: 'Alto' });
    const aPdi = await mkAlert('colab-scope-pdi', 'Pessoa da Equipe (PDI)');
    await mkAlert('colab-scope-own', 'Pessoa Sob Responsabilidade', { ownerId: hmMember.id });
    await mkAlert('colab-scope-dep', 'Pessoa do Departamento', { departmentId: teamDept.id });
    await A('POST', '/api/v1/development', { collaboratorId: 'colab-scope-pdi', collaboratorName: 'Pessoa da Equipe (PDI)', hireDate: '2026-01-05', managerId: hmMember.id });
    const adminView = (await A('GET', rt)).json;
    const hmView = (await HM('GET', rt)).json;
    const hmNames = (hmView.turnoverAlerts as any[]).map(a => a.collaboratorName);
    check('scope: Admin sees every alert; the manager sees only the alerts of their team (owner, PDI manager, department head)', adminView.alertScope === 'all' && ['Pessoa Fora da Equipe', 'Fulano'].every(n => adminView.turnoverAlerts.some((a: any) => a.collaboratorName === n)) && hmView.alertScope === 'team' && ['Pessoa da Equipe (PDI)', 'Pessoa Sob Responsabilidade', 'Pessoa do Departamento'].every(n => hmNames.includes(n)) && !hmNames.includes('Pessoa Fora da Equipe') && !hmNames.includes('Fulano'), hmNames);
    check('scope: the overview numbers count only what the viewer can see; PDI shortcuts only for visible alerts', hmView.metrics.activeAlerts === (hmView.turnoverAlerts as any[]).filter(a => a.status === 'open' || a.status === 'monitoring').length && hmView.metrics.activeAlerts < adminView.metrics.activeAlerts && !('colab-scope-out' in hmView.developmentLinks) && 'colab-scope-pdi' in hmView.developmentLinks, [hmView.metrics, hmView.developmentLinks]);
    const outId = aOut.json.alert.id as string, inId = aPdi.json.alert.id as string;
    check('scope: an alert outside the team cannot be edited, worked on, closed or deleted (404, as if it did not exist)', (await HM('PATCH', `${rt}/alert/${outId}`, { riskLevel: 'Baixo' })).status === 404 && (await HM('POST', `${rt}/alert/${outId}/actions`, { action: 'x' })).status === 404 && (await HM('POST', `${rt}/alert/${outId}/status`, { status: 'dismissed', note: 'x' })).status === 404 && (await HM('DELETE', `${rt}/alert/${outId}`)).status === 404 && ((await A('GET', rt)).json.turnoverAlerts as any[]).some(a => a.id === outId));
    check('scope: an alert of the team can be worked on', (await HM('POST', `${rt}/alert/${inId}/actions`, { action: 'Conversa com o gestor' })).status === 201);
    await A('POST', '/api/v1/development', { collaboratorId: 'colab-scope-pdi2', collaboratorName: 'Outra Pessoa da Equipe', hireDate: '2026-01-05', managerId: hmMember.id });
    const chief = await A('POST', '/api/v1/users', { name: 'Membro da Chefia', email: `chefia-${suffix}@smoke.test`, profileId: 'collaborator', departmentId: teamDept.id });
    const hmPeople = (await HM('GET', `${rt}/people`)).json.people as any[];
    const allPeople = (await A('GET', `${rt}/people`)).json.people as any[];
    check('scope: the manager people list is only their team (PDIs they manage, members of the department they head)', hmPeople.some(x => x.id === 'colab-scope-pdi2') && hmPeople.some(x => x.id === chief.json.user.id) && !hmPeople.some(x => x.id === s1Member.id) && hmPeople.length < allPeople.length, [hmPeople.length, allPeople.length]);
    const typedByHm = await HM('POST', `${rt}/alert`, { collaboratorName: 'Nome Digitado pelo Gestor' });
    check('scope: the manager can open alerts for their team (a free name stays visible to its author); not for people outside it -> 403', (await HM('POST', `${rt}/alert`, { collaboratorId: 'colab-scope-pdi2', collaboratorName: 'Outra Pessoa da Equipe' })).status === 201 && (await HM('POST', `${rt}/alert`, { collaboratorId: s1Member.id, collaboratorName: 'Survey 1' })).status === 403 && typedByHm.status === 201 && typedByHm.json.alert.createdById === hmMember.id && ((await HM('GET', rt)).json.turnoverAlerts as any[]).some(a => a.id === typedByHm.json.alert.id), typedByHm.json);
    const rhMail = `rh-escopo-${suffix}@smoke.test`;
    const rhMade = await A('POST', '/api/v1/users', { name: 'RH Escopo', email: rhMail, profileId: 'recruiter' });
    const rhToken = (await activateUser(slugA, rhMail, rhMade.json.tempPassword, 'Senha#RhEscopo9')).token;
    const rhView = (await api('GET', rt, { token: rhToken })).json;
    const permsOf = async (token: string) => (await api('GET', '/api/auth/me', { token })).json.user.permissions as string[];
    check('scope: RH (Recrutador) has "all alerts" by default and sees what is outside the manager team; the Gestor does not have the permission', rhView.alertScope === 'all' && (rhView.turnoverAlerts as any[]).some(a => a.collaboratorName === 'Pessoa Fora da Equipe') && (await permsOf(rhToken)).includes('retention_all:view') && !(await permsOf(tokens.HIRING_MANAGER)).includes('retention_all:view'));
    check('scope: another organization sees none of these alerts', !((await B('GET', rt)).json.turnoverAlerts ?? []).some((a: any) => a.id === outId || a.id === inId));

    // ---- Cargos: vínculo em lote ----------------------------------------------------------------
    const bulk = '/api/v1/users/positions';
    const unlinkedList = await A('GET', '/api/v1/users/unlinked');
    const typedUser = (unlinkedList.json.members as any[]).find(m => m.id === typed.json.user.id);
    check('bulk link: lists the active people with no registered cargo, with the cargo their old title matches exactly', unlinkedList.status === 200 && typedUser?.suggestedPositionId === analystPos.id && !(unlinkedList.json.members as any[]).some(m => m.id === s1Member.id) && unlinkedList.json.positions.some((c: any) => c.id === analystPos.id) && !unlinkedList.json.positions.some((c: any) => c.id === archivedPos.id), unlinkedList.json);
    check('bulk link: only who edits users (no edit -> 403); needs at least one link; unknown / archived cargo or unknown person refused', (await R('HIRING_MANAGER', 'GET', '/api/v1/users/unlinked')).status === 403 && (await R('INTERVIEWER', 'POST', bulk, { links: [{ memberId: typed.json.user.id, positionId: analystPos.id }] })).status === 403 && (await A('POST', bulk, {})).status === 400 && (await A('POST', bulk, { links: [{ memberId: typed.json.user.id, positionId: 'pos-nope' }] })).status === 400 && (await A('POST', bulk, { links: [{ memberId: typed.json.user.id, positionId: archivedPos.id }] })).status === 400 && (await A('POST', bulk, { links: [{ memberId: 'usr-nope', positionId: analystPos.id }] })).status === 404);
    const halfDone = await A('POST', bulk, { links: [{ memberId: typed.json.user.id, positionId: analystPos.id }, { memberId: 'usr-nope', positionId: analystPos.id }] });
    const dup = await A('POST', bulk, { links: [{ memberId: typed.json.user.id, positionId: analystPos.id }, { memberId: typed.json.user.id, positionId: managerPos.id }] });
    const untouchedUser = ((await A('GET', '/api/v1/users')).json.users as any[]).find(u => u.id === typed.json.user.id);
    check('bulk link is all-or-nothing: a failure in any link applies none (a repeated person is refused too)', halfDone.status === 404 && dup.status === 400 && untouchedUser.positionId === undefined, [halfDone.status, dup.status, untouchedUser]);
    const bulkDone = await A('POST', bulk, { links: [{ memberId: typed.json.user.id, positionId: analystPos.id }, { memberId: chief.json.user.id, positionId: managerPos.id }] });
    const afterBulk = (await A('GET', '/api/v1/users')).json.users as any[];
    check('bulk link: links the chosen people at once (cargo id and title), and they leave the "no cargo" list', bulkDone.status === 200 && bulkDone.json.linked === 2 && afterBulk.find(u => u.id === typed.json.user.id).positionId === analystPos.id && afterBulk.find(u => u.id === chief.json.user.id).jobTitle === 'Gestor da Vaga' && !((await A('GET', '/api/v1/users/unlinked')).json.members as any[]).some(m => m.id === typed.json.user.id || m.id === chief.json.user.id), bulkDone.json);
    check('bulk link: another organization can neither link A people nor use A cargos', (await B('POST', bulk, { links: [{ memberId: typed.json.user.id, positionId: posB.id }] })).status === 404 && (await A('POST', bulk, { links: [{ memberId: typed.json.user.id, positionId: posB.id }] })).status === 400 && !((await B('GET', '/api/v1/users/unlinked')).json.members as any[]).some(m => m.id === typed.json.user.id));

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
    const newRec = await A('POST', '/api/v1/development', { collaboratorName: ' Ana PDI ', positionId: analystPos.id, hireDate: '2026-01-05', departmentId: deptId, managerId: recruiterUser.id });
    const ana = newRec.json.developmentRecord;
    check('create a PDI by hand', newRec.status === 201 && ana.collaboratorName === 'Ana PDI' && ana.collaboratorId.startsWith('colab-') && ana.managerId === recruiterUser.id && ana.goals.length === 0, newRec.json);
    check('create PDI: name and admission date are required (the cargo is optional) -> 400', (await A('POST', '/api/v1/development', { positionId: analystPos.id, hireDate: '2026-01-05' })).status === 400 && (await A('POST', '/api/v1/development', { collaboratorName: 'x', hireDate: '2026-01-05' })).status === 201 && (await A('POST', '/api/v1/development', { collaboratorName: 'x', positionId: analystPos.id })).status === 400);
    check('create PDI: impossible date -> 400', (await A('POST', '/api/v1/development', { collaboratorName: 'x', jobTitle: 'y', hireDate: '2026-02-30' })).status === 400);
    check('create PDI: unknown department / manager -> 400', (await A('POST', '/api/v1/development', { collaboratorName: 'x', jobTitle: 'y', hireDate: '2026-01-05', departmentId: 'dep-nope' })).status === 400 && (await A('POST', '/api/v1/development', { collaboratorName: 'x', jobTitle: 'y', hireDate: '2026-01-05', managerId: 'usr-nope' })).status === 400);
    check('create PDI for someone who already has one -> 409', (await A('POST', '/api/v1/development', { collaboratorId: candId, collaboratorName: 'x', jobTitle: 'y', hireDate: '2026-01-05' })).status === 409);
    const race = await Promise.all([1, 2].map(() => A('POST', '/api/v1/development', { collaboratorId: 'colab-race', collaboratorName: 'Corrida', jobTitle: 'y', hireDate: '2026-01-05' })));
    check('simultaneous PDI creation for the same person keeps a single record', race.map(r => r.status).sort().join() === '201,409', race.map(r => r.status));
    check('RBAC: INTERVIEWER cannot create PDIs', (await R('INTERVIEWER', 'POST', '/api/v1/development', { collaboratorName: 'x', jobTitle: 'y', hireDate: '2026-01-05' })).status === 403);
    const editRec = await A('PATCH', `/api/v1/development/${ana.id}`, { positionId: managerPos.id, managerId: null, nextReviewDate: '2099-02-01' });
    check('edit PDI data (change the registered cargo, clear manager, schedule next 1:1)', editRec.json.developmentRecord?.positionId === managerPos.id && editRec.json.developmentRecord.jobTitle === 'Gestor da Vaga' && editRec.json.developmentRecord.managerId === undefined && editRec.json.developmentRecord.nextReviewDate === '2099-02-01' && editRec.json.developmentRecord.collaboratorName === 'Ana PDI', editRec.json);
    const pdiPos = await A('POST', '/api/v1/development', { collaboratorName: 'Com Cargo Cadastrado', positionId: analystPos.id, hireDate: '2026-01-05' });
    check('PDI: the cargo is a registered Cargo and its title follows it', pdiPos.status === 201 && pdiPos.json.developmentRecord.positionId === analystPos.id && pdiPos.json.developmentRecord.jobTitle === 'Analista', pdiPos.json);
    const pdiTyped = await A('POST', '/api/v1/development', { collaboratorName: 'Cargo Digitado', jobTitle: 'Astronauta', hireDate: '2026-01-05' });
    check('PDI: a typed jobTitle is ignored (no cargo linked, default label)', pdiTyped.status === 201 && pdiTyped.json.developmentRecord.jobTitle === 'Sem cargo cadastrado' && pdiTyped.json.developmentRecord.positionId === undefined, pdiTyped.json);
    const pdiBody = (positionId: string) => ({ collaboratorName: 'Cargo Inválido', positionId, hireDate: '2026-01-05' });
    check('PDI: unknown, archived or other-organization cargo -> 400', (await A('POST', '/api/v1/development', pdiBody('pos-nope'))).status === 400 && (await A('POST', '/api/v1/development', pdiBody(archivedPos.id))).status === 400 && (await A('POST', '/api/v1/development', pdiBody(posB.id))).status === 400);
    const pdiUnlink = await A('PATCH', `/api/v1/development/${pdiPos.json.developmentRecord.id}`, { positionId: null });
    check('PDI: clearing the cargo unlinks it and keeps the last title as a label', pdiUnlink.status === 200 && pdiUnlink.json.developmentRecord.positionId === undefined && pdiUnlink.json.developmentRecord.jobTitle === 'Analista', pdiUnlink.json);
    const pdiLookups = (await A('GET', '/api/v1/development')).json.lookups;
    const allPositions = (await A('GET', '/api/v1/positions')).json.positions as any[];
    check('PDI lookups offer the active registered cargos only; the hire PDI carries the registered cargo of the opening', pdiLookups.positions.some((c: any) => c.id === analystPos.id) && !pdiLookups.positions.some((c: any) => c.id === archivedPos.id) && !!hirePdi.positionId && allPositions.find(c => c.id === hirePdi.positionId)?.title === hirePdi.jobTitle, [pdiLookups.positions, hirePdi.positionId, hirePdi.jobTitle]);
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

    // Próximo 1:1 <-> Agenda Corporativa
    const adminIdA = usersA.json.users[0].id;
    const pdiEvents = async (pdiId: string) => ((await A('GET', '/api/v1/agenda')).json.events ?? []).filter((e: any) => e.id.startsWith(`agd-pdi~${pdiId}~`));
    const openOf = (list: any[]) => list.filter(e => e.status === 'scheduled' || e.status === 'in_progress');
    let evs = await pdiEvents(hirePdi.id);
    check('the next 1:1 became a 30-min meeting in the Agenda (date, 09:00 default, title, agenda, creator invited)',
      evs.length === 1 && evs[0].type === 'meeting' && evs[0].status === 'scheduled' && evs[0].startsAt === '2099-01-10T12:00:00.000Z' && evs[0].endsAt === '2099-01-10T12:30:00.000Z'
      && /^1:1 — /.test(evs[0].title) && evs[0].agenda[0] === 'Revisar o andamento das metas do PDI' && evs[0].agenda.some((a: string) => a.startsWith('Meta:')) && evs[0].assigneeIds.includes(adminIdA) && evs[0].createdById === adminIdA, evs);
    const listed = (await A('GET', '/api/v1/development')).json;
    check('the PDI list carries the pending appointments; changes answer with nextMeeting', listed.nextMeetings?.some((e: any) => e.id === evs[0].id) && (await A('PATCH', dv, { jobTitle: 'Analista' })).json.nextMeeting?.id === evs[0].id, listed.nextMeetings);
    const reschedule = await A('PATCH', dv, { nextReviewDate: '2099-02-01', nextReviewTime: '14:30' });
    evs = await pdiEvents(hirePdi.id);
    check('rescheduling date + time moves the SAME appointment (14:30 São Paulo)', evs.length === 1 && evs[0].startsAt === '2099-02-01T17:30:00.000Z' && evs[0].endsAt === '2099-02-01T18:00:00.000Z' && reschedule.json.nextMeeting?.startsAt === evs[0].startsAt, evs);
    await A('PATCH', dv, { nextReviewTime: '10:00' });
    check('changing only the time keeps the date', (await pdiEvents(hirePdi.id))[0]?.startsAt === '2099-02-01T13:00:00.000Z');
    await A('PATCH', dv, { nextReviewDate: '2099-02-02' });
    check('changing only the date keeps the time', (await pdiEvents(hirePdi.id))[0]?.startsAt === '2099-02-02T13:00:00.000Z');
    check('invalid time -> 400 and nothing moves', (await A('PATCH', dv, { nextReviewTime: '25:00' })).status === 400 && (await A('POST', one, { date: '2026-03-16', keyTakeaways: 'x', nextMeetingDate: '2099-03-01', nextMeetingTime: '9h' })).status === 400 && (await pdiEvents(hirePdi.id))[0]?.startsAt === '2099-02-02T13:00:00.000Z');
    await A('POST', one, { date: '2026-05-01', keyTakeaways: 'sem próximo', nextMeetingTime: '16:00' });
    check('a time without a date never moves the appointment (forms always send the time)', (await pdiEvents(hirePdi.id))[0]?.startsAt === '2099-02-02T13:00:00.000Z');
    const withManager = await A('PATCH', dv, { managerId: recruiterUser.id });
    check('a new manager is invited to the pending appointment', (await pdiEvents(hirePdi.id))[0]?.assigneeIds.includes(recruiterUser.id), withManager.json);
    await A('PATCH', dv, { managerId: null });
    check('a removed manager is dropped; the creator stays', (await pdiEvents(hirePdi.id))[0]?.assigneeIds.join() === adminIdA);
    await A('PATCH', dv, { collaboratorName: 'Contratada Renomeada' });
    check('renaming the collaborator renames the appointment', (await pdiEvents(hirePdi.id))[0]?.title === '1:1 — Contratada Renomeada');
    const cleared = await A('PATCH', dv, { nextReviewDate: '' });
    check('clearing the next 1:1 removes the pending appointment', openOf(await pdiEvents(hirePdi.id)).length === 0 && cleared.json.nextMeeting === null && cleared.json.developmentRecord.nextReviewDate === '', cleared.json);

    // Agenda -> PDI (the appointment is also edited on the Agenda screen)
    await A('PATCH', dv, { nextReviewDate: '2099-03-01', nextReviewTime: '11:00' });
    const e2 = openOf(await pdiEvents(hirePdi.id))[0];
    const pdiNow = async () => ((await A('GET', '/api/v1/development')).json.developmentRecords as any[]).find(r => r.id === hirePdi.id);
    check('a new date creates a new appointment', !!e2 && e2.startsAt === '2099-03-01T14:00:00.000Z', e2);
    await A('PATCH', `/api/v1/agenda/${e2.id}`, { startsAt: '2099-03-03T15:00:00.000Z' });
    check('moving the appointment in the Agenda moves the PDI\'s next 1:1', (await pdiNow()).nextReviewDate === '2099-03-03');
    await A('PATCH', `/api/v1/agenda/${e2.id}`, { status: 'cancelled' });
    check('cancelling it in the Agenda clears the PDI\'s next 1:1', (await pdiNow()).nextReviewDate === '');
    await A('PATCH', dv, { nextReviewDate: '2099-04-01' });
    const e3 = openOf(await pdiEvents(hirePdi.id))[0];
    check('scheduling again after a cancellation creates a fresh appointment (the cancelled one stays)', !!e3 && e3.id !== e2.id && (await pdiEvents(hirePdi.id)).some((e: any) => e.id === e2.id && e.status === 'cancelled'));
    await A('DELETE', `/api/v1/agenda/${e3.id}`);
    check('deleting it in the Agenda clears the PDI\'s next 1:1', (await pdiNow()).nextReviewDate === '');
    check('isolation: org B sees no PDI appointment of org A', !((await B('GET', '/api/v1/agenda')).json.events ?? []).some((e: any) => e.id.startsWith('agd-pdi~')));

    // A 1:1 that takes place closes the appointment; the next one is a new appointment
    const ana2 = (await A('POST', '/api/v1/development', { collaboratorName: 'Ana Agenda', jobTitle: 'Analista', hireDate: '2026-01-05', nextReviewDate: '2026-03-01', nextReviewTime: '09:30' })).json;
    check('a PDI created with a next 1:1 already has its appointment', ana2.nextMeeting?.startsAt === '2026-03-01T12:30:00.000Z' && ana2.nextMeeting.status === 'scheduled', ana2);
    const doneRes = await A('POST', `/api/v1/development/${ana2.developmentRecord.id}/one-on-ones`, { date: '2026-03-05', keyTakeaways: 'Conversa que cumpriu o agendado', nextMeetingDate: '2099-05-05', nextMeetingTime: '08:00' });
    const anaEvs = await pdiEvents(ana2.developmentRecord.id);
    const anaDone = anaEvs.find((e: any) => e.status === 'done');
    const anaOpen = openOf(anaEvs)[0];
    check('the registered 1:1 closes the old appointment (done, with the 1:1 as summary) and books the next',
      anaEvs.length === 2 && anaDone?.summary === 'Conversa que cumpriu o agendado' && anaOpen?.startsAt === '2099-05-05T11:00:00.000Z' && doneRes.json.nextMeeting?.id === anaOpen.id, anaEvs);
    await A('DELETE', `/api/v1/agenda/${anaDone.id}`);
    check('deleting a FINISHED appointment does not touch the PDI', ((await A('GET', '/api/v1/development')).json.developmentRecords as any[]).find(r => r.id === ana2.developmentRecord.id)?.nextReviewDate === '2099-05-05');

    // Deleting a PDI takes its pending appointment along
    const eva = (await A('POST', '/api/v1/development', { collaboratorName: 'Eva Apagável', jobTitle: 'Analista', hireDate: '2026-01-05', nextReviewDate: '2099-06-06' })).json;
    check('empty PDI with a next 1:1: appointment exists', openOf(await pdiEvents(eva.developmentRecord.id)).length === 1);
    await A('DELETE', `/api/v1/development/${eva.developmentRecord.id}`);
    check('deleting the PDI removes its pending appointment', (await pdiEvents(eva.developmentRecord.id)).length === 0);

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
      check(`isolation: org B sees no ${label} of org A`, ((await B('GET', path)).json[key] ?? []).every((item: any) => [deptB.id, posB.id].includes(item.id))); // (only what org B created itself for the cargo tests may be there)
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
    check('new Scale orgs start with every module enabled', provA.json.tenant.enabledRoutines?.length === PLAN_ROUTINES.Scale.length && provB.json.tenant.enabledRoutines?.length === PLAN_ROUTINES.Scale.length && provA.json.tenant.enabledRoutines.includes('climate'), [provA.json.tenant.enabledRoutines?.length, provB.json.tenant.enabledRoutines?.length]);
    const toStarter = await T('PATCH', `/api/master/tenants/${tB}`, { plan: 'Starter', enabledRoutines: PLAN_ROUTINES.Starter });
    check('plan preset: Starter has 11 modules and no AI / development / retention / indicators', toStarter.status === 200 && toStarter.json.tenant.enabledRoutines.length === 11 && !toStarter.json.tenant.enabledRoutines.some((k: string) => ['ai_evaluation', 'development', 'retention', 'retention_all', 'climate', 'indicators'].includes(k)), toStarter.json);
    const provStarter = await api('POST', '/api/master/tenants/provision', { token: adminToken, body: { name: `Smoke C ${suffix}`, slug: `smoke-c-${suffix}`, contactEmail: `admin-c-${suffix}@smoke.test`, adminUserName: 'Admin C', plan: 'Starter' } });
    createdTenantIds.push(provStarter.json.tenant?.id);
    check('provisioning a Starter org applies the Starter preset by default', provStarter.status === 201 && provStarter.json.tenant.enabledRoutines.length === 11, provStarter.json);
    check('provisioning accepts an explicit module list (core forced in)', (await api('POST', '/api/master/tenants/provision', { token: adminToken, body: { name: 'Bad', slug: `bad-${suffix}`, contactEmail: `bad-${suffix}@smoke.test`, enabledRoutines: ['nope'] } })).status === 400);
    check('Starter org: blocked modules do not answer even for its admin', (await B('GET', '/api/v1/indicators')).status === 403 && (await B('GET', '/api/v1/retention')).status === 403 && (await B('GET', '/api/v1/retention/survey/pending')).status === 403 && (await B('POST', '/api/v1/ai/evaluate-candidate', { candidateId: 'x', jobOpeningId: 'y' })).status === 403);
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
    const restored = await T('PATCH', `/api/master/tenants/${tA}`, { plan: 'Scale', enabledRoutines: ['users', 'profiles', 'dna', 'structure', 'positions', 'openings', 'candidates', 'selection', 'ai_evaluation', 'interviews', 'offers', 'onboarding', 'development', 'retention', 'retention_all', 'climate', 'indicators'] });
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
    check('audit: alerts and surveys leave a PEOPLE_DATA trail, without the content of answers', has('TURNOVER_ALERT_OPENED', l => l.tenantId === provA.json.tenant.id && l.category === 'PEOPLE_DATA') && has('TURNOVER_ALERT_STATUS', l => l.tenantId === provA.json.tenant.id) && has('CLIMATE_SURVEY_PUBLISHED', l => l.tenantId === provA.json.tenant.id) && has('CLIMATE_SURVEY_CLOSED', l => l.tenantId === provA.json.tenant.id) && has('CLIMATE_COMMENT_HIDDEN', l => l.tenantId === provA.json.tenant.id) && !logs.some(l => /Cite Fulano de Tal|Bom time/.test(l.details)));
    check('audit: the bulk link of cargos is recorded', has('USER_POSITIONS_LINKED', l => l.tenantId === provA.json.tenant.id));
    check('audit: no secret material in details', !logs.some(l => /Nova#Senha42|Admin@123|scrypt\$/.test(l.details)));
    check('audit: newest first', logs.every((l, i) => i === 0 || new Date(logs[i - 1].timestamp) >= new Date(l.timestamp)));
    const tel = (await api('GET', '/api/master/telemetry', { token: adminToken })).json.telemetry;
    check('telemetry covers all tenants with real numbers', tel.totalTenants >= 5 && tel.tenantBreakdowns.length === Math.min(tel.totalTenants, 50) && tel.totalStorageUsedMb > 0, tel.totalTenants);

    // ---- Physical checks --------------------------------------------------------------------------------
    const { rows } = await getPool().query('select count(*)::int as n from public.candidates where tenant_id = $1', [provA.json.tenant.id]);
    const expectedCandidates = 2 + (screeningCreatedCandidate ? 1 : 0);
    check('data physically stored in Postgres', rows[0].n === expectedCandidates, { ...rows[0], expectedCandidates });

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
    for (const path of storedResumeFiles) await removeFile(path, RESUME_BUCKET);
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
