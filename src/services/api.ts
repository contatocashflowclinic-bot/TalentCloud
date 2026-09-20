import {
  Tenant,
  SystemAuditLog,
  TenantConnectionTelemetry,
  TenantRoutingResolution,
  TenantUser,
  AccessProfile,
  Page,
  PlatformUser,
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
  AdmissionTemplate,
  AdmissionItem,
  IntegrationTemplate,
  OnboardingChecklistItem,
  BenefitCatalogItem,
  CandidateChange,
  CollaboratorDevelopment,
  ClimateSurveyResponse,
  TurnoverRiskAlert,
  TenantIndicators,
  AgendaEvent,
  AgendaDirectoryMember,
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

/** Fired on a permission denial so the UI can re-read the (possibly changed) permissions. */
export const PERMISSION_DENIED_EVENT = 'talentcloud:permission-denied';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

let lastRoutingResolution: TenantRoutingResolution | null = null;
let lastTelemetry: TenantConnectionTelemetry | null = null;

export function getLastRoutingResolution() {
  return lastRoutingResolution;
}

export function getLastTelemetry() {
  return lastTelemetry;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
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
      sourceValue: 'session',
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
  if (response.status === 403 && authToken && data.code !== 'PASSWORD_CHANGE_REQUIRED') {
    window.dispatchEvent(new Event(PERMISSION_DENIED_EVENT));
  }
  if (!response.ok || !data.success) {
    // Servidor ainda na versão antiga responde com o texto técnico "Rota não encontrada: ..."
    const staleServer = response.status === 404 && /^Rota não encontrada/.test(String(data.error ?? ''));
    const message = staleServer
      ? 'Não foi possível concluir esta ação porque o sistema está desatualizado. Atualize a página (Ctrl+F5) e tente de novo. Se o problema continuar, avise o suporte.'
      : data.error || 'Erro na requisição ao servidor';
    throw new ApiError(message, response.status, data.code);
  }

  return data as T;
}

const qs = (q: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const out = p.toString();
  return out ? `?${out}` : '';
};

/**
 * Access management of ONE organization (people linked to it and its profiles). The organization screens and the
 * Conta Mãe screens share one component; only the base path differs.
 */
export interface MembersApi {
  listMembers: (q: { search?: string; page?: number; pageSize?: number }) => Promise<Page<TenantUser>>;
  listProfiles: () => Promise<AccessProfile[]>;
  createMember: (p: {
    name: string; email: string; profileId: string; jobTitle?: string; permissions?: string[];
  }) => Promise<{ user: TenantUser; tempPassword?: string; linkedExisting: boolean }>;
  updateMember: (id: string, p: {
    name?: string; jobTitle?: string; profileId?: string; active?: boolean; permissions?: string[];
  }) => Promise<TenantUser>;
  resetPassword: (id: string) => Promise<{ user: TenantUser; tempPassword: string }>;
  createProfile: (p: { name: string; description?: string; permissions: string[] }) => Promise<AccessProfile>;
  updateProfile: (id: string, p: { name?: string; description?: string; permissions?: string[] }) => Promise<AccessProfile>;
  deleteProfile: (id: string) => Promise<void>;
}

function membersApi(base: string, members: 'users' | 'members'): MembersApi {
  const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return {
    listMembers: async q => {
      const res = await request<{ success: boolean; users: TenantUser[]; total: number; page: number; pageSize: number }>(
        `${base}/${members}${qs({ page: 1, pageSize: 25, ...q })}`
      );
      return { items: res.users, total: res.total, page: res.page, pageSize: res.pageSize };
    },
    listProfiles: async () => (await request<{ success: boolean; profiles: AccessProfile[] }>(`${base}/profiles`)).profiles,
    createMember: async p => {
      const res = await request<{ success: boolean; user: TenantUser; tempPassword?: string; linkedExisting: boolean }>(`${base}/${members}`, json('POST', p));
      return { user: res.user, tempPassword: res.tempPassword, linkedExisting: res.linkedExisting };
    },
    updateMember: async (id, p) => (await request<{ success: boolean; user: TenantUser }>(`${base}/${members}/${id}`, json('PATCH', p))).user,
    resetPassword: async id => {
      const res = await request<{ success: boolean; user: TenantUser; tempPassword: string }>(`${base}/${members}/${id}/reset-password`, json('POST'));
      return { user: res.user, tempPassword: res.tempPassword };
    },
    createProfile: async p => (await request<{ success: boolean; profile: AccessProfile }>(`${base}/profiles`, json('POST', p))).profile,
    updateProfile: async (id, p) => (await request<{ success: boolean; profile: AccessProfile }>(`${base}/profiles/${id}`, json('PUT', p))).profile,
    deleteProfile: async id => { await request<{ success: boolean }>(`${base}/profiles/${id}`, json('DELETE')); }
  };
}

// Master / SuperAdmin APIs
export const MasterApi = {
  getTenantsPage: async (q: { search?: string; page?: number; pageSize?: number } = {}) => {
    const res = await request<{ success: boolean; tenants: Tenant[]; total: number; page: number; pageSize: number }>(
      `/api/master/tenants${qs(q)}`
    );
    return { items: res.tenants, total: res.total, page: res.page, pageSize: res.pageSize } as Page<Tenant>;
  },
  updateTenant: async (
    tenantId: string,
    patch: Partial<Pick<Tenant, 'name' | 'tradingName' | 'document' | 'contactEmail' | 'logoUrl' | 'plan' | 'enabledRoutines'>>
  ) => (await request<{ success: boolean; tenant: Tenant }>(`/api/master/tenants/${tenantId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  })).tenant,
  /** Members / profiles of ONE organization, same shape the organization screens use. */
  membersOf: (tenantId: string): MembersApi => membersApi(`/api/master/tenants/${tenantId}`, 'members'),
  getUsersPage: async (q: { search?: string; page?: number; pageSize?: number } = {}) => {
    const res = await request<{ success: boolean; users: PlatformUser[]; total: number; page: number; pageSize: number }>(
      `/api/master/users${qs(q)}`
    );
    return { items: res.users, total: res.total, page: res.page, pageSize: res.pageSize } as Page<PlatformUser>;
  },
  createUser: async (payload: {
    name: string;
    email: string;
    link?: { tenantId: string; profileId: string; jobTitle?: string; permissions?: string[] };
  }) => {
    const res = await request<{ success: boolean; user: PlatformUser; tempPassword: string }>('/api/master/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return { user: res.user, tempPassword: res.tempPassword };
  },
  updateUser: async (userId: string, patch: { active?: boolean; name?: string }) =>
    (await request<{ success: boolean; user: PlatformUser }>(`/api/master/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    })).user,
  resetUserPassword: async (userId: string) => {
    const res = await request<{ success: boolean; user: PlatformUser; tempPassword: string }>(
      `/api/master/users/${userId}/reset-password`,
      { method: 'POST' }
    );
    return { user: res.user, tempPassword: res.tempPassword };
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
      adminCredentials: { email: string; tempPassword: string; linkedExisting: boolean };
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
  getAuditLogs: async (q: { limit?: number; before?: string; category?: string; q?: string } = {}) => {
    const res = await request<{ success: boolean; logs: SystemAuditLog[]; nextCursor: string | null }>(
      `/api/master/audit-logs${qs(q)}`
    );
    return { logs: res.logs, nextCursor: res.nextCursor };
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
  switchOrganization: async (tenantId: string) =>
    (await request<{ success: boolean; user: AuthUser }>('/api/auth/switch-organization', {
      method: 'POST',
      body: JSON.stringify({ tenantId })
    })).user,
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
  /** Lookup list (names for owners, approvers...). Management screens use `members` (paginated). */
  getUsers: async () => (await request<{ success: boolean; users: TenantUser[] }>('/api/v1/users')).users,
  members: membersApi('/api/v1', 'users'),

  // 3. DNA Organizacional
  getDNA: async () => (await request<{ success: boolean; dna: OrganizationalDNA }>('/api/v1/dna')).dna,
  updateDNA: async (payload: Partial<OrganizationalDNA>) => (await request<{ success: boolean; dna: OrganizationalDNA }>('/api/v1/dna', {
    method: 'PUT',
    body: JSON.stringify(payload)
  })).dna,

  // 4. Estrutura Organizacional
  getDepartments: async () => (await request<{ success: boolean; departments: Department[] }>('/api/v1/departments')).departments,
  updateDepartment: async (id: string, payload: Record<string, unknown>) => (await request<{ success: boolean; department: Department }>(`/api/v1/departments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })).department,
  createDepartment: async (payload: Partial<Department>) => (await request<{ success: boolean; department: Department }>('/api/v1/departments', {
    method: 'POST',
    body: JSON.stringify(payload)
  })).department,

  // 5. Cargos
  getPositions: async () => (await request<{ success: boolean; positions: JobPosition[] }>('/api/v1/positions')).positions,
  updatePosition: async (id: string, payload: Record<string, unknown>) => (await request<{ success: boolean; position: JobPosition }>(`/api/v1/positions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })).position,
  createPosition: async (payload: Partial<JobPosition>) => (await request<{ success: boolean; position: JobPosition }>('/api/v1/positions', {
    method: 'POST',
    body: JSON.stringify(payload)
  })).position,

  // 6. Vagas
  getOpenings: async () => (await request<{ success: boolean; openings: JobOpening[] }>('/api/v1/openings')).openings,
  updateOpening: async (id: string, payload: Record<string, unknown>) => (await request<{ success: boolean; opening: JobOpening }>(`/api/v1/openings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })).opening,
  createOpening: async (payload: Partial<JobOpening>) => (await request<{ success: boolean; opening: JobOpening }>('/api/v1/openings', {
    method: 'POST',
    body: JSON.stringify(payload)
  })).opening,

  // 7. Candidatos
  getCandidates: async () => (await request<{ success: boolean; candidates: Candidate[] }>('/api/v1/candidates')).candidates,
  updateCandidate: async (id: string, payload: Record<string, unknown>) => (await request<{ success: boolean; candidate: Candidate }>(`/api/v1/candidates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })).candidate,
  correctCandidate: async (id: string, changes: Record<string, unknown>, reason: string) => (await request<{ success: boolean; candidate: Candidate; changedFields: string[] }>(`/api/v1/candidates/${id}/corrections`, {
    method: 'POST',
    body: JSON.stringify({ changes, reason })
  })).candidate,
  archiveCandidate: async (id: string, reason: string) => (await request<{ success: boolean; candidate: Candidate }>(`/api/v1/candidates/${id}/archive`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  })).candidate,
  unarchiveCandidate: async (id: string) => (await request<{ success: boolean; candidate: Candidate }>(`/api/v1/candidates/${id}/unarchive`, {
    method: 'POST',
    body: JSON.stringify({})
  })).candidate,
  getCandidateHistory: async (id: string) => (await request<{ success: boolean; changes: CandidateChange[] }>(`/api/v1/candidates/${id}/history`)).changes,
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
  updateApplicationStage: async (id: string, stageId?: string, note?: string, status?: string) => (await request<{ success: boolean; application: SelectionApplication }>(`/api/v1/applications/${id}/stage`, {
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
  getBenefits: async () => (await request<{ success: boolean; benefits: BenefitCatalogItem[] }>('/api/v1/benefits')).benefits,
  createBenefit: async (payload: Partial<BenefitCatalogItem>) => (await request<{ success: boolean; benefit: BenefitCatalogItem }>('/api/v1/benefits', {
    method: 'POST',
    body: JSON.stringify(payload)
  })).benefit,
  updateBenefit: async (id: string, payload: Partial<BenefitCatalogItem>) => (await request<{ success: boolean; benefit: BenefitCatalogItem }>(`/api/v1/benefits/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })).benefit,
  updateOffer: async (id: string, payload: Record<string, unknown>) => (await request<{ success: boolean; offer: JobOffer }>(`/api/v1/offers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })).offer,
  updateOfferStatus: async (id: string, status: JobOffer['status'], notes?: string) => (await request<{ success: boolean; offer: JobOffer }>(`/api/v1/offers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes })
  })).offer,

  // 12.1 Admissão
  getAdmissionTemplates: async () => (await request<{ success: boolean; templates: AdmissionTemplate[] }>('/api/v1/admission-templates')).templates,
  createAdmissionTemplate: async (payload: Partial<AdmissionTemplate>) => (await request<{ success: boolean; template: AdmissionTemplate }>('/api/v1/admission-templates', {
    method: 'POST',
    body: JSON.stringify(payload)
  })).template,
  updateAdmissionTemplate: async (id: string, payload: Partial<AdmissionTemplate>) => (await request<{ success: boolean; template: AdmissionTemplate }>(`/api/v1/admission-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })).template,
  getAvailableAdmissionTemplates: async (journeyId: string) => (await request<{ success: boolean; templates: AdmissionTemplate[] }>(`/api/v1/onboardings/${journeyId}/admission/available`)).templates,
  applyAdmissionTemplate: async (journeyId: string, templateIds: string[]) => (await request<{ success: boolean; onboarding: OnboardingJourney }>(`/api/v1/onboardings/${journeyId}/admission/apply-template`, {
    method: 'POST',
    body: JSON.stringify({ templateIds })
  })).onboarding,
  removeAdmissionItem: async (journeyId: string, itemId: string) => (await request<{ success: boolean; onboarding: OnboardingJourney }>(`/api/v1/onboardings/${journeyId}/admission/${itemId}`, { method: 'DELETE' })).onboarding,
  addAdmissionItem: async (journeyId: string, payload: Partial<AdmissionItem>) => (await request<{ success: boolean; onboarding: OnboardingJourney }>(`/api/v1/onboardings/${journeyId}/admission`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })).onboarding,
  reviewAdmissionItem: async (journeyId: string, itemId: string, action: 'approve' | 'reject' | 'reopen', note?: string) => (await request<{ success: boolean; onboarding: OnboardingJourney }>(`/api/v1/onboardings/${journeyId}/admission/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action, note })
  })).onboarding,
  uploadAdmissionFile: async (journeyId: string, itemId: string, file: File) => (await request<{ success: boolean; onboarding: OnboardingJourney }>(`/api/v1/onboardings/${journeyId}/admission/${itemId}/file${qs({ name: file.name })}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file
  })).onboarding,
  /** The file needs the session token, so it is fetched (not linked) and handed to the browser as a download. */
  downloadAdmissionFile: async (journeyId: string, itemId: string, fileName: string) => {
    const response = await fetch(`/api/v1/onboardings/${journeyId}/admission/${itemId}/file`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data.error || 'Não foi possível baixar o documento.', response.status);
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },

  // 12.2 Checklist de Integração
  getIntegrationTemplates: async () => (await request<{ success: boolean; templates: IntegrationTemplate[] }>('/api/v1/integration-templates')).templates,
  createIntegrationTemplate: async (payload: Partial<IntegrationTemplate>) => (await request<{ success: boolean; template: IntegrationTemplate }>('/api/v1/integration-templates', {
    method: 'POST',
    body: JSON.stringify(payload)
  })).template,
  updateIntegrationTemplate: async (id: string, payload: Partial<IntegrationTemplate>) => (await request<{ success: boolean; template: IntegrationTemplate }>(`/api/v1/integration-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })).template,
  getAvailableChecklistTemplates: async (journeyId: string) => (await request<{ success: boolean; templates: IntegrationTemplate[] }>(`/api/v1/onboardings/${journeyId}/checklist-available`)).templates,
  applyChecklistTemplates: async (journeyId: string, templateIds: string[]) => (await request<{ success: boolean; onboarding: OnboardingJourney }>(`/api/v1/onboardings/${journeyId}/checklist-apply`, {
    method: 'POST',
    body: JSON.stringify({ templateIds })
  })).onboarding,
  addChecklistItem: async (journeyId: string, payload: Partial<OnboardingChecklistItem>) => (await request<{ success: boolean; onboarding: OnboardingJourney }>(`/api/v1/onboardings/${journeyId}/checklist`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })).onboarding,
  removeChecklistItem: async (journeyId: string, itemId: string) => (await request<{ success: boolean; onboarding: OnboardingJourney }>(`/api/v1/onboardings/${journeyId}/checklist/${itemId}`, { method: 'DELETE' })).onboarding,

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
  getIndicators: async () => (await request<{ success: boolean; indicators: TenantIndicators }>('/api/v1/indicators')).indicators,

  // 17. Agenda Corporativa
  getAgendaEvents: async () => (await request<{ success: boolean; events: AgendaEvent[] }>('/api/v1/agenda')).events,
  getAgendaDirectory: async () => (await request<{ success: boolean; members: AgendaDirectoryMember[] }>('/api/v1/agenda/directory')).members,
  createAgendaEvent: async (payload: Record<string, unknown>) => (await request<{ success: boolean; event: AgendaEvent }>('/api/v1/agenda', {
    method: 'POST',
    body: JSON.stringify(payload)
  })).event,
  updateAgendaEvent: async (id: string, payload: Record<string, unknown>) => (await request<{ success: boolean; event: AgendaEvent }>(`/api/v1/agenda/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })).event,
  deleteAgendaEvent: async (id: string) => { await request<{ success: boolean }>(`/api/v1/agenda/${id}`, { method: 'DELETE' }); }
};
