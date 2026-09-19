import {
  Tenant,
  SystemAuditLog,
  TenantConnectionTelemetry,
  TenantRoutingResolution,
  TenantUser,
  OrganizationalDNA,
  CulturePillar,
  Department,
  JobPosition,
  JobOpening,
  Candidate,
  SelectionApplication,
  AIAssistedEvaluation,
  InterviewSession,
  JobOffer,
  OnboardingJourney,
  CollaboratorDevelopment,
  ClimateSurveyResponse,
  TurnoverRiskAlert,
  TenantIndicators,
  AuthUser
} from '../types.js';

// ---- Session (token kept in localStorage; server stores only its hash) ----
const TOKEN_KEY = 'talentcloud.token';
let authToken: string | null = null;
try { authToken = localStorage.getItem(TOKEN_KEY); } catch { /* storage unavailable */ }

export function getAuthToken() { return authToken; }
export function setAuthToken(token: string | null) {
  authToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable */ }
}

/** Fired when the server rejects the session (expired / revoked) so the UI can return to login. */
export const SESSION_EXPIRED_EVENT = 'talentcloud:session-expired';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

let currentTenantSlug: string = '';
let lastRoutingResolution: TenantRoutingResolution | null = null;
let lastTelemetry: TenantConnectionTelemetry | null = null;

export function setActiveTenantSlug(slug: string) {
  currentTenantSlug = slug;
}

export function getActiveTenantSlug() {
  return currentTenantSlug;
}

export function getLastRoutingResolution() {
  return lastRoutingResolution;
}

export function getLastTelemetry() {
  return lastTelemetry;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }
  // Only meaningful for the SuperAdmin (organization users are pinned to their own organization by the server)
  if (currentTenantSlug) {
    headers.set('X-Tenant-Slug', currentTenantSlug);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  // Extract routing headers for multi-tenant awareness
  const resolvedId = response.headers.get('X-Resolved-Tenant-Id');
  const isolatedDb = response.headers.get('X-Isolated-Database');
  const strategy = response.headers.get('X-Routing-Strategy') as TenantRoutingResolution['strategy'];
  const latency = response.headers.get('X-Routing-Latency-Ms');

  if (resolvedId && isolatedDb && strategy) {
    lastRoutingResolution = {
      strategy,
      sourceValue: `X-Tenant-Slug: ${currentTenantSlug}`,
      resolvedTenantId: resolvedId,
      targetDatabase: isolatedDb,
      timestamp: new Date().toISOString(),
      latencyMs: latency ? parseInt(latency, 10) : 6
    };
  }

  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && authToken && !endpoint.startsWith('/api/auth/login')) {
    setAuthToken(null);
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  if (!response.ok || !data.success) {
    throw new ApiError(data.error || 'Erro na requisição ao servidor', response.status, data.code);
  }

  return data as T;
}

// Master / SuperAdmin APIs
export const MasterApi = {
  getTenants: async () => {
    const res = await request<{ success: boolean; tenants: Tenant[] }>('/api/master/tenants');
    return res.tenants;
  },
  provisionTenant: async (payload: {
    name: string;
    tradingName: string;
    slug: string;
    document: string;
    contactEmail: string;
    plan: 'Starter' | 'Scale' | 'Enterprise';
    adminUserName: string;
    adminUserEmail: string;
  }) => {
    return await request<{
      success: boolean;
      tenant: Tenant;
      adminCredentials: { email: string; tempPassword: string };
    }>('/api/master/tenants/provision', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },
  updateTenantStatus: async (tenantId: string, status: Tenant['status']) => {
    return await request<{ success: boolean; tenant: Tenant }>(`/api/master/tenants/${tenantId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  },
  getTelemetry: async () => {
    const res = await request<{ success: boolean; telemetry: any }>('/api/master/telemetry');
    return res.telemetry;
  },
  getAuditLogs: async () => {
    const res = await request<{ success: boolean; logs: SystemAuditLog[] }>('/api/master/audit-logs');
    return res.logs;
  },
  resetAdminPassword: async (tenantId: string, userId?: string) => {
    return await request<{ success: boolean; user: { id: string; name: string; email: string }; tempPassword: string }>(
      `/api/master/tenants/${tenantId}/reset-admin-password`,
      { method: 'POST', body: JSON.stringify({ userId }) }
    );
  }
};

// Authentication
export const AuthApi = {
  login: async (email: string, password: string, tenant?: string) => {
    return await request<{ success: boolean; token: string; expiresAt: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenant: tenant || undefined })
    });
  },
  me: async () => (await request<{ success: boolean; user: AuthUser }>('/api/auth/me')).user,
  logout: async () => { await request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }); },
  changePassword: async (currentPassword: string, newPassword: string) => {
    await request<{ success: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }
};

// Public careers portal (no login required)
export interface PublicCareers {
  tenant: Pick<Tenant, 'slug' | 'name' | 'tradingName' | 'logoUrl'>;
  openings: JobOpening[];
  positions: JobPosition[];
  departments: Department[];
  dna: (Pick<OrganizationalDNA, 'mission' | 'vision' | 'archetype' | 'cultureSummary' | 'coreValues'> & {
    pillars: Array<Pick<CulturePillar, 'id' | 'name' | 'description' | 'weight' | 'expectedBehaviors'>>;
  }) | null;
}

export const PublicApi = {
  getCareers: async (slug: string) => {
    const res = await fetch(`/api/public/${encodeURIComponent(slug)}/careers`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new ApiError(data.error || 'Portal de vagas indisponível', res.status);
    return data as PublicCareers & { success: boolean };
  },
  apply: async (slug: string, payload: Record<string, unknown>) => {
    const res = await fetch(`/api/public/${encodeURIComponent(slug)}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new ApiError(data.error || 'Erro ao enviar candidatura', res.status);
    return data as { success: boolean; applicationId: string };
  }
};

// Tenant-Isolated APIs (Módulos 1 a 15)
export const TenantApi = {
  getContext: async () => {
    const res = await request<{ success: boolean; tenant: Tenant; telemetry: TenantConnectionTelemetry; routingResolution: TenantRoutingResolution }>('/api/v1/context');
    lastTelemetry = res.telemetry;
    lastRoutingResolution = res.routingResolution;
    return res;
  },

  // 2. Usuários e Permissões
  getUsers: async () => (await request<{ success: boolean; users: TenantUser[] }>('/api/v1/users')).users,
  createUser: async (payload: Partial<TenantUser>) => {
    const res = await request<{ success: boolean; user: TenantUser; tempPassword: string }>('/api/v1/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return { user: res.user, tempPassword: res.tempPassword };
  },
  resetUserPassword: async (userId: string) => {
    const res = await request<{ success: boolean; user: TenantUser; tempPassword: string }>(`/api/v1/users/${userId}/reset-password`, {
      method: 'POST'
    });
    return { user: res.user, tempPassword: res.tempPassword };
  },

  // 3. DNA Organizacional
  getDNA: async () => (await request<{ success: boolean; dna: OrganizationalDNA }>('/api/v1/dna')).dna,
  updateDNA: async (payload: Partial<OrganizationalDNA>) => (await request<{ success: boolean; dna: OrganizationalDNA }>('/api/v1/dna', {
    method: 'PUT',
    body: JSON.stringify(payload)
  })).dna,

  // 4. Estrutura Organizacional
  getDepartments: async () => (await request<{ success: boolean; departments: Department[] }>('/api/v1/departments')).departments,
  createDepartment: async (payload: Partial<Department>) => (await request<{ success: boolean; department: Department }>('/api/v1/departments', {
    method: 'POST',
    body: JSON.stringify(payload)
  })).department,

  // 5. Cargos
  getPositions: async () => (await request<{ success: boolean; positions: JobPosition[] }>('/api/v1/positions')).positions,
  createPosition: async (payload: Partial<JobPosition>) => (await request<{ success: boolean; position: JobPosition }>('/api/v1/positions', {
    method: 'POST',
    body: JSON.stringify(payload)
  })).position,

  // 6. Vagas
  getOpenings: async () => (await request<{ success: boolean; openings: JobOpening[] }>('/api/v1/openings')).openings,
  createOpening: async (payload: Partial<JobOpening>) => (await request<{ success: boolean; opening: JobOpening }>('/api/v1/openings', {
    method: 'POST',
    body: JSON.stringify(payload)
  })).opening,

  // 7. Candidatos
  getCandidates: async () => (await request<{ success: boolean; candidates: Candidate[] }>('/api/v1/candidates')).candidates,
  createCandidate: async (payload: Partial<Candidate>) => (await request<{ success: boolean; candidate: Candidate }>('/api/v1/candidates', {
    method: 'POST',
    body: JSON.stringify(payload)
  })).candidate,

  // 8. Processo Seletivo (Aplicações)
  getApplications: async () => (await request<{ success: boolean; applications: SelectionApplication[] }>('/api/v1/applications')).applications,
  createApplication: async (candidateId: string, jobOpeningId: string) => (await request<{ success: boolean; application: SelectionApplication }>('/api/v1/applications', {
    method: 'POST',
    body: JSON.stringify({ candidateId, jobOpeningId })
  })).application,
  updateApplicationStage: async (id: string, stageId: string, note?: string, status?: string) => (await request<{ success: boolean; application: SelectionApplication }>(`/api/v1/applications/${id}/stage`, {
    method: 'PATCH',
    body: JSON.stringify({ stageId, note, status })
  })).application,

  // 9. Avaliação Assistida por IA
  getAIEvaluations: async () => (await request<{ success: boolean; evaluations: AIAssistedEvaluation[] }>('/api/v1/ai/evaluations')).evaluations,
  evaluateCandidateWithAI: async (candidateId: string, jobOpeningId: string) => (await request<{ success: boolean; evaluation: AIAssistedEvaluation }>('/api/v1/ai/evaluate-candidate', {
    method: 'POST',
    body: JSON.stringify({ candidateId, jobOpeningId })
  })).evaluation,
  submitHumanReview: async (evaluationId: string, decision: AIAssistedEvaluation['humanReviewerDecision'], humanNotes: string, reviewerName: string) => (await request<{ success: boolean; evaluation: AIAssistedEvaluation }>(`/api/v1/ai/evaluations/${evaluationId}/human-decision`, {
    method: 'PATCH',
    body: JSON.stringify({ decision, humanNotes, reviewerName })
  })).evaluation,

  // 10. Entrevistas
  getInterviews: async () => (await request<{ success: boolean; interviews: InterviewSession[] }>('/api/v1/interviews')).interviews,
  createInterview: async (payload: Partial<InterviewSession>) => (await request<{ success: boolean; interview: InterviewSession }>('/api/v1/interviews', {
    method: 'POST',
    body: JSON.stringify(payload)
  })).interview,
  completeInterviewScorecard: async (id: string, scorecard: any[], recommendation: string, overallFeedback: string) => (await request<{ success: boolean; interview: InterviewSession }>(`/api/v1/interviews/${id}/scorecard`, {
    method: 'PATCH',
    body: JSON.stringify({ scorecard, recommendation, overallFeedback })
  })).interview,

  // 11. Proposta
  getOffers: async () => (await request<{ success: boolean; offers: JobOffer[] }>('/api/v1/offers')).offers,
  createOffer: async (payload: Partial<JobOffer>) => (await request<{ success: boolean; offer: JobOffer }>('/api/v1/offers', {
    method: 'POST',
    body: JSON.stringify(payload)
  })).offer,
  updateOfferStatus: async (id: string, status: JobOffer['status'], notes?: string) => (await request<{ success: boolean; offer: JobOffer }>(`/api/v1/offers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes })
  })).offer,

  // 12. Onboarding
  getOnboardings: async () => (await request<{ success: boolean; onboardings: OnboardingJourney[] }>('/api/v1/onboardings')).onboardings,
  updateChecklistItem: async (journeyId: string, itemId: string, status: string) => (await request<{ success: boolean; onboarding: OnboardingJourney }>(`/api/v1/onboardings/${journeyId}/checklist/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  })).onboarding,

  // 13. Desenvolvimento
  getDevelopmentRecords: async () => (await request<{ success: boolean; developmentRecords: CollaboratorDevelopment[] }>('/api/v1/development')).developmentRecords,
  createGoal: async (recordId: string, title: string, competency: string, deadline: string) => (await request<{ success: boolean; goal: any }>(`/api/v1/development/${recordId}/goals`, {
    method: 'POST',
    body: JSON.stringify({ title, competency, deadline })
  })),

  // 14. Retenção
  getRetentionData: async () => await request<{ success: boolean; climateSurveys: ClimateSurveyResponse[]; turnoverAlerts: TurnoverRiskAlert[] }>('/api/v1/retention'),
  createTurnoverAlert: async (payload: Partial<TurnoverRiskAlert>) => (await request<{ success: boolean; alert: TurnoverRiskAlert }>('/api/v1/retention/alert', {
    method: 'POST',
    body: JSON.stringify(payload)
  })).alert,

  // 15. Indicadores
  getIndicators: async () => (await request<{ success: boolean; indicators: TenantIndicators }>('/api/v1/indicators')).indicators
};
