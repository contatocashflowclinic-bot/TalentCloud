/**
 * End-to-end smoke test against a RUNNING server and the real database.
 *   npm run dev                       (or PORT=3100 tsx server.ts)
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

config({ path: ['.env.local', '.env'], quiet: true });

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || 'admin@admin.com.br';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || 'Admin@123';

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

async function seedFidelity(adminToken: string) {
  const seeds: Array<[string, any]> = [
    ['techcorp', getTechCorpSeedData()],
    ['varejobr', getVarejoBrSeedData()],
    ['biosaude', getBioSaudeSeedData()]
  ];
  for (const [slug, seed] of seeds) {
    const get = async (p: string) => (await api('GET', p, { token: adminToken, tenant: slug })).json;
    const users = (await get('/api/v1/users')).users;
    check(`[${slug}] users`, sameData(users, seed.users));
    check(`[${slug}] users expose no credential fields`, users.every((u: any) => !('passwordHash' in u) && !('password_hash' in u) && !('mustChangePassword' in u)));
    check(`[${slug}] dna`, sameData((await get('/api/v1/dna')).dna, seed.dna));
    check(`[${slug}] departments`, sameData((await get('/api/v1/departments')).departments, seed.departments));
    check(`[${slug}] positions`, sameData((await get('/api/v1/positions')).positions, seed.positions));
    check(`[${slug}] openings`, sameData((await get('/api/v1/openings')).openings, seed.openings));
    check(`[${slug}] candidates`, sameData((await get('/api/v1/candidates')).candidates, seed.candidates));
    check(`[${slug}] applications`, sameData((await get('/api/v1/applications')).applications, seed.applications));
    check(`[${slug}] aiEvaluations`, sameData((await get('/api/v1/ai/evaluations')).evaluations, [...(seed.aiEvaluations ?? [])].reverse()));
    check(`[${slug}] interviews`, sameData((await get('/api/v1/interviews')).interviews, seed.interviews ?? []));
    check(`[${slug}] offers`, sameData((await get('/api/v1/offers')).offers, seed.offers ?? []));
    check(`[${slug}] onboardings`, sameData((await get('/api/v1/onboardings')).onboardings, seed.onboardings ?? []));
    check(`[${slug}] development`, sameData((await get('/api/v1/development')).developmentRecords, seed.developmentRecords ?? []));
    const retention = await get('/api/v1/retention');
    check(`[${slug}] climateSurveys`, sameData(retention.climateSurveys, seed.climateSurveys ?? []));
    check(`[${slug}] turnoverAlerts`, sameData(retention.turnoverAlerts, seed.turnoverAlerts ?? []));
    check(`[${slug}] indicators`, sameData((await get('/api/v1/indicators')).indicators, seed.indicators));
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
  check('SuperAdmin default login works', adminLogin.status === 200 && adminLogin.json.user?.role === 'SUPER_ADMIN', adminLogin.json);
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

  await seedFidelity(adminToken);

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
      body: { name: `Smoke B ${suffix}`, slug: slugB, contactEmail: emailB, adminUserName: 'Admin B', adminUserEmail: emailB, plan: 'Starter' }
    });
    check('provision B -> 201', provB.status === 201, provB.json);
    createdTenantIds.push(provB.json.tenant?.id);

    check('duplicate slug -> 409', (await api('POST', '/api/master/tenants/provision', { token: adminToken, body: { name: 'Dup', slug: slugA, contactEmail: 'd@smoke.test' } })).status === 409);
    check('new tenant reports plan quota + shared engine', provA.json.tenant.dbConfig.maxStorageMb === 2048 && provA.json.tenant.dbConfig.engineType === 'Shared-Postgres-RLS', provA.json.tenant?.dbConfig);

    // ---- Temporary password flow -------------------------------------------
    const tempA: string = provA.json.adminCredentials.tempPassword;
    const stored = await getPool().query('select password_hash, must_change_password from public.tenant_users where tenant_id = $1', [provA.json.tenant.id]);
    check('temp password stored only as scrypt hash', stored.rows[0].password_hash?.startsWith('scrypt$') && !stored.rows[0].password_hash.includes(tempA) && stored.rows[0].must_change_password === true, stored.rows[0]);

    check('org login needs the organization identifier', (await login(emailA, tempA)).status === 401);
    check('org login with WRONG organization -> 401', (await login(emailA, tempA, slugB)).status === 401);
    const first = await login(emailA, tempA, slugA);
    check('org admin logs in with temp password', first.status === 200 && first.json.user?.mustChangePassword === true && first.json.user?.role === 'ORG_ADMIN', first.json);
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
    check('new org has only its admin', usersA.json.users?.length === 1 && usersA.json.users[0].role === 'ORG_ADMIN', usersA.json);
    const indA = (await api('GET', '/api/v1/indicators', { token: adminA })).json.indicators;
    check('new org indicators are real zeros', indA?.timeToHireDays === 0 && indA.costPerHire === 0 && indA.recruitmentFunnel.applied === 0, indA);

    const A = (method: string, path: string, body?: unknown) => api(method, path, { token: adminA, body });
    const B = (method: string, path: string, body?: unknown) => api(method, path, { token: adminB, body });

    // ---- Users, temp passwords, RBAC -----------------------------------------
    const roles = ['RECRUITER', 'HIRING_MANAGER', 'INTERVIEWER', 'COLLABORATOR'] as const;
    const tokens: Record<string, string> = {};
    for (const role of roles) {
      const email = `${role.toLowerCase()}-${suffix}@smoke.test`;
      const created = await A('POST', '/api/v1/users', { name: `U ${role}`, email, role, jobTitle: role });
      check(`create ${role} user returns a one-time temp password`, created.status === 201 && created.json.tempPassword?.length >= 12 && !('passwordHash' in created.json.user), created.json);
      const act = await activateUser(slugA, email, created.json.tempPassword, `Senha#${role}9`);
      tokens[role] = act.token;
      check(`${role} can activate the account`, !!act.token, act.first?.json);
    }
    check('duplicate user email -> 409', (await A('POST', '/api/v1/users', { name: 'Dup', email: `recruiter-${suffix}@smoke.test` })).status === 409);
    check('SUPER_ADMIN role rejected in tenant', (await A('POST', '/api/v1/users', { name: 'Evil', email: `evil-${suffix}@smoke.test`, role: 'SUPER_ADMIN' })).status === 400);
    check('user requires name -> 400', (await A('POST', '/api/v1/users', { email: 'x@y.z' })).status === 400);

    const R = (role: string, method: string, path: string, body?: unknown) => api(method, path, { token: tokens[role], body });
    // RBAC matrix (sampled on the routes that matter)
    check('RBAC: RECRUITER cannot create users', (await R('RECRUITER', 'POST', '/api/v1/users', { name: 'x', email: 'x@smoke.test' })).status === 403);
    check('RBAC: RECRUITER cannot edit DNA', (await R('RECRUITER', 'PUT', '/api/v1/dna', { mission: 'hack' })).status === 403);
    check('RBAC: RECRUITER can read candidates', (await R('RECRUITER', 'GET', '/api/v1/candidates')).status === 200);
    check('RBAC: HIRING_MANAGER cannot create candidates', (await R('HIRING_MANAGER', 'POST', '/api/v1/candidates', { name: 'x', email: 'x@smoke.test' })).status === 403);
    check('RBAC: HIRING_MANAGER can read offers', (await R('HIRING_MANAGER', 'GET', '/api/v1/offers')).status === 200);
    check('RBAC: INTERVIEWER can read candidates + interviews', (await R('INTERVIEWER', 'GET', '/api/v1/candidates')).status === 200 && (await R('INTERVIEWER', 'GET', '/api/v1/interviews')).status === 200);
    check('RBAC: INTERVIEWER cannot read offers', (await R('INTERVIEWER', 'GET', '/api/v1/offers')).status === 403);
    check('RBAC: INTERVIEWER cannot read indicators', (await R('INTERVIEWER', 'GET', '/api/v1/indicators')).status === 403);
    check('RBAC: INTERVIEWER cannot create candidates', (await R('INTERVIEWER', 'POST', '/api/v1/candidates', { name: 'x', email: 'x@smoke.test' })).status === 403);
    check('RBAC: COLLABORATOR cannot read candidates', (await R('COLLABORATOR', 'GET', '/api/v1/candidates')).status === 403);
    check('RBAC: COLLABORATOR cannot read users', (await R('COLLABORATOR', 'GET', '/api/v1/users')).status === 403);
    check('RBAC: COLLABORATOR cannot read development records', (await R('COLLABORATOR', 'GET', '/api/v1/development')).status === 403);
    check('RBAC: COLLABORATOR can read DNA + context + openings', (await R('COLLABORATOR', 'GET', '/api/v1/dna')).status === 200 && (await R('COLLABORATOR', 'GET', '/api/v1/context')).status === 200 && (await R('COLLABORATOR', 'GET', '/api/v1/openings')).status === 200);

    // ---- Password reset by ORG_ADMIN -------------------------------------------
    const recruiterUser = (usersA.json.users, (await A('GET', '/api/v1/users')).json.users.find((u: any) => u.role === 'RECRUITER'));
    const reset = await A('POST', `/api/v1/users/${recruiterUser.id}/reset-password`);
    check('ORG_ADMIN can issue a temp password', reset.status === 200 && reset.json.tempPassword?.length >= 12, reset.json);
    check('reset kills the user\'s existing sessions', (await R('RECRUITER', 'GET', '/api/v1/candidates')).status === 401);
    check('old password stops working after reset', (await login(recruiterUser.email, `Senha#RECRUITER9`, slugA)).status === 401);
    check('temp password works and forces change', (await login(recruiterUser.email, reset.json.tempPassword, slugA)).json.user?.mustChangePassword === true);
    check('non-admin cannot reset passwords', (await R('HIRING_MANAGER', 'POST', `/api/v1/users/${recruiterUser.id}/reset-password`)).status === 403);
    check('reset of unknown user -> 404', (await A('POST', '/api/v1/users/usr-nope/reset-password')).status === 404);

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

    const ev = await A('POST', '/api/v1/ai/evaluate-candidate', { candidateId: candId, jobOpeningId: jobId });
    check('AI evaluation (Gemini or fallback)', ev.status === 201 && typeof ev.json.evaluation?.overallFitScore === 'number', ev.json);
    const evId = ev.json.evaluation?.id;
    const appAfter = (await A('GET', '/api/v1/applications')).json.applications.find((a: any) => a.id === appId);
    check('evaluation linked to application', appAfter?.aiEvaluationId === evId, appAfter);
    check('human review', (await A('PATCH', `/api/v1/ai/evaluations/${evId}/human-decision`, { decision: 'APPROVED', humanNotes: 'ok', reviewerName: 'Tester' })).json.evaluation?.humanReviewerDecision === 'APPROVED');
    check('invalid human decision -> 400', (await A('PATCH', `/api/v1/ai/evaluations/${evId}/human-decision`, { decision: 'MAYBE' })).status === 400);
    const intv = await A('POST', '/api/v1/interviews', { jobOpeningId: jobId, candidateId: candId });
    check('create interview', intv.status === 201, intv.json);
    check('INTERVIEWER can fill a scorecard', (await api('PATCH', `/api/v1/interviews/${intv.json.interview.id}/scorecard`, { token: tokens.INTERVIEWER, body: { scorecard: [{ competency: 'X', score: 5, notes: 'top' }], recommendation: 'STRONG_YES', overallFeedback: 'ótimo' } })).json.interview?.status === 'completed');
    const offer = await A('POST', '/api/v1/offers', { jobOpeningId: jobId, candidateId: candId, baseSalary: 8000 });
    check('create offer', offer.status === 201, offer.json);
    check('offer sent sets sentAt', !!(await A('PATCH', `/api/v1/offers/${offer.json.offer.id}/status`, { status: 'sent' })).json.offer?.sentAt);
    check('invalid offer status -> 400', (await A('PATCH', `/api/v1/offers/${offer.json.offer.id}/status`, { status: 'bogus' })).status === 400);
    check('turnover alert', (await A('POST', '/api/v1/retention/alert', { collaboratorName: 'Fulano', riskLevel: 'Alto', earlyWarningSignals: 'faltas, queda', suggestedActions: '1:1' })).status === 201);

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

    const applyBody = { jobOpeningId: jobId, name: 'Candidata Pública', email: `publica-${suffix}@smoke.test`, currentRole: 'Dev', yearsOfExperience: 4, skills: 'Go, SQL', tags: ['admin-only'], status: 'hired' };
    const applied = await api('POST', `/api/public/${slugA}/apply`, { body: applyBody });
    check('public apply -> 201 with protocol', applied.status === 201 && !!applied.json.applicationId, applied.json);
    const pubCand = (await A('GET', '/api/v1/candidates')).json.candidates.find((c: any) => c.email === `publica-${suffix}@smoke.test`);
    check('public application landed in the org (candidate + tags forced server-side)', !!pubCand && pubCand.tags.includes('Candidatura Portal Público') && !pubCand.tags.includes('admin-only'), pubCand);
    const pubApp = (await A('GET', '/api/v1/applications')).json.applications.find((a: any) => a.candidateId === pubCand?.id);
    check('public application starts in review on the first stage (cannot self-approve)', pubApp?.status === 'in_review' && pubApp.currentStageId === 'stg-1', pubApp);
    check('public duplicate application -> 409', (await api('POST', `/api/public/${slugA}/apply`, { body: applyBody })).status === 409);
    check('public apply invalid e-mail -> 400', (await api('POST', `/api/public/${slugA}/apply`, { body: { ...applyBody, email: 'nope' } })).status === 400);
    check('public apply unknown job -> 404', (await api('POST', `/api/public/${slugA}/apply`, { body: { ...applyBody, email: `x-${suffix}@smoke.test`, jobOpeningId: 'job-nope' } })).status === 404);
    check('public apply to another org\'s job -> 404', (await api('POST', `/api/public/${slugB}/apply`, { body: { ...applyBody, email: `y-${suffix}@smoke.test` } })).status === 404);
    check('public apply oversize field -> 400', (await api('POST', `/api/public/${slugA}/apply`, { body: { ...applyBody, email: `z-${suffix}@smoke.test`, resumeSummary: 'x'.repeat(5000) } })).status === 400);
    check('org B saw nothing of the public application', (await B('GET', '/api/v1/candidates')).json.candidates.length === 0);

    // ---- SuperAdmin: impersonation, status, reset ------------------------------------------
    const imp = await api('GET', '/api/v1/context', { token: adminToken, tenant: slugA });
    check('SuperAdmin can open an org via header', imp.json.tenant?.slug === slugA && imp.json.routingResolution.strategy === 'HEADER_INJECTION', imp.json);
    check('unknown tenant -> 404 (no fallback to another org)', (await api('GET', '/api/v1/users', { token: adminToken, tenant: 'does-not-exist' })).status === 404);

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
    const logs = (await api('GET', '/api/master/audit-logs', { token: adminToken })).json.logs as any[];
    const has = (action: string, pred: (l: any) => boolean = () => true) => logs.some(l => l.action === action && pred(l));
    check('audit: ORGANIZATION_CREATED by the real actor', has('ORGANIZATION_CREATED', l => l.tenantId === provA.json.tenant.id && l.userId === 'super-01' && l.userName === 'SuperAdmin Root'));
    check('audit: TENANT_STATUS_UPDATED', has('TENANT_STATUS_UPDATED', l => l.tenantId === provA.json.tenant.id));
    check('audit: AI_EVALUATION_COMPLETED attributed to the real user', has('AI_EVALUATION_COMPLETED', l => l.tenantId === provA.json.tenant.id && l.userName === 'Admin A'));
    check('audit: SUPERADMIN_TENANT_ACCESS recorded', has('SUPERADMIN_TENANT_ACCESS', l => l.tenantId === provA.json.tenant.id));
    check('audit: PASSWORD_RESET_ISSUED recorded', has('PASSWORD_RESET_ISSUED', l => l.tenantId === provA.json.tenant.id) && has('PASSWORD_RESET_ISSUED', l => l.tenantId === provB.json.tenant.id));
    check('audit: LOGIN_SUCCEEDED + LOGIN_FAILED recorded', has('LOGIN_SUCCEEDED') && has('LOGIN_FAILED'));
    check('audit: PUBLIC_APPLICATION_RECEIVED recorded', has('PUBLIC_APPLICATION_RECEIVED', l => l.tenantId === provA.json.tenant.id));
    check('audit: no secret material in details', !logs.some(l => /Nova#Senha42|Admin@123|scrypt\$/.test(l.details)));
    check('audit: newest first', logs.every((l, i) => i === 0 || new Date(logs[i - 1].timestamp) >= new Date(l.timestamp)));
    const tel = (await api('GET', '/api/master/telemetry', { token: adminToken })).json.telemetry;
    check('telemetry covers all tenants with real numbers', tel.totalTenants >= 5 && tel.tenantBreakdowns.length === tel.totalTenants && tel.totalStorageUsedMb > 0, tel.totalTenants);

    // ---- Physical checks --------------------------------------------------------------------------------
    const { rows } = await getPool().query('select count(*)::int as n from public.candidates where tenant_id = $1', [provA.json.tenant.id]);
    check('data physically stored in Postgres', rows[0].n === 2, rows[0]);

    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      const anon = { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}` };
      for (const table of ['tenants', 'tenant_users', 'auth_sessions', 'platform_admins']) {
        const rest = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?select=*`, { headers: anon });
        const body: any = await rest.json().catch(() => null);
        check(`RLS: anon key gets no rows from ${table}`, rest.status >= 400 || (Array.isArray(body) && body.length === 0), { status: rest.status });
      }
    }
  } finally {
    // ---- Cleanup: remove temporary orgs (cascade users/sessions) and their audit rows ----
    const ids = createdTenantIds.filter(Boolean);
    await getPool().query(`delete from public.platform_audit_logs where user_name like '%@smoke.test' or details like '%@smoke.test%'`);
    if (ids.length) {
      await getPool().query('delete from public.platform_audit_logs where tenant_id = any($1)', [ids]);
      await getPool().query('delete from public.tenants where id = any($1)', [ids]);
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
