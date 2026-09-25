export type TenantStatus = 'active' | 'suspended' | 'provisioning' | 'maintenance';
// Every organization lives in ONE shared Postgres (Supabase); isolation is logical:
// tenant_id on every row, composite foreign keys and Row Level Security.
export type DatabaseEngineType = 'Shared-Postgres-RLS';

/** Facts about where an organization's data lives. Derived at read time, never stored. */
export interface DatabaseConfig {
  dbId: string;          // logical partition id, e.g. 'part-techcorp'
  dbName: string;        // logical partition label, e.g. 'tenant:techcorp'
  host: string;          // human label of the shared cluster (no infrastructure details)
  port: number;
  engineType: DatabaseEngineType;
  maxPoolSize: number;   // real size of the server's shared connection pool
  sslEnabled: boolean;
  region: string;        // provider label
  schemaVersion: string; // latest applied migration
  encryptionKeyId: string; // who manages encryption at rest
  storageUsedMb: number; // estimated size of this organization's rows (refreshed every 60s)
  maxStorageMb: number;  // plan quota (informational, not enforced)
}

export interface TenantConnectionTelemetry {
  tenantId: string;
  dbName: string;
  activeConnections: number;
  idleConnections: number;
  latencyMs: number;
  queriesPerMinute: number;
  lastConnectedAt: string;
  status: 'healthy' | 'degraded' | 'disconnected';
  isolationVerified: boolean;
}

export interface TenantRoutingResolution {
  strategy: 'HEADER_INJECTION' | 'SUBDOMAIN_DYNAMIC' | 'TOKEN_SESSION' | 'SUPERADMIN_IMPERSONATION';
  sourceValue: string;
  resolvedTenantId: string;
  targetDatabase: string;
  timestamp: string;
  latencyMs: number;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  tradingName: string;
  document: string; // CNPJ / Tax ID
  contactEmail: string;
  logoUrl?: string;
  status: TenantStatus;
  plan: 'Starter' | 'Scale' | 'Enterprise';
  createdAt: string;
  /** Routines (modules) the organization's contract includes; controlled by the Conta Mãe. */
  enabledRoutines: string[];
  dbConfig: DatabaseConfig;
  features: {
    aiEvaluationEnabled: boolean;
    onboardingChecklistEnabled: boolean;
    retentionPredictorEnabled: boolean;
    advancedIndicatorsEnabled: boolean;
  };
}

// 2. Usuários e Permissões (RBAC)
/** Perfil de acesso da organização: conjunto de permissões `rotina:ação` (ver src/access.ts). */
export interface AccessProfile {
  id: string;
  name: string;
  description: string;
  /** Perfil administrador: sempre possui todas as permissões. */
  isAdmin: boolean;
  /** Criado junto com a organização: não pode ser excluído. */
  isSystem: boolean;
  permissions: string[];
  memberCount?: number;
}

/** Pessoa (identidade global) com seus vínculos, visão da Conta Mãe. */
export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
  links: Array<{
    tenantId: string;
    tenantName: string;
    slug: string;
    membershipId: string;
    profileId: string;
    profileName: string;
    active: boolean;
  }>;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Vínculo de um usuário (identidade global) com uma organização. */
export interface TenantUser {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  email: string;
  profileId: string;
  profileName?: string;
  departmentId?: string;
  /** Título do cargo. Vem do Cargo cadastrado (`positionId`); nas pessoas ainda não vinculadas é só o rótulo antigo. */
  jobTitle: string;
  /** Cargo cadastrado (módulo Cargos) desta pessoa. O cargo nunca é digitado: é sempre escolhido no cadastro. */
  positionId?: string;
  avatarUrl?: string;
  active: boolean;
  /** Ausente enquanto o vínculo nunca foi usado. */
  lastLoginAt?: string;
  /** Exceções individuais sobre o perfil. */
  grantedPermissions: string[];
  revokedPermissions: string[];
  /** Permissões efetivas: (perfil + concedidas) - revogadas. */
  permissions?: string[];
}


// RH / Colaboradores (base mestre)
export const EMPLOYEE_STATUSES = ['active', 'onboarding', 'inactive'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];
export const EMPLOYEE_ORIGINS = ['hired_candidate', 'tenant_user', 'manual'] as const;
export type EmployeeOrigin = (typeof EMPLOYEE_ORIGINS)[number];

export interface Employee {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status: EmployeeStatus;
  origin: EmployeeOrigin;
  candidateId?: string;
  userId?: string;
  onboardingId?: string;
  developmentId?: string;
  positionId?: string;
  jobTitle: string;
  departmentId?: string;
  managerId?: string;
  hireDate?: string;
  createdAt: string;
  updatedAt: string;
  createdById?: string;
  createdByName?: string;
}

export type EmployeeTimelineKind = 'hire' | 'onboarding' | 'admission' | 'development' | 'one_on_one' | 'retention' | 'profile';
export interface EmployeeTimelineEvent {
  id: string;
  kind: EmployeeTimelineKind;
  at: string;
  title: string;
  description?: string;
  tone?: 'info' | 'success' | 'warn' | 'danger';
  refId?: string;
}
// 3. DNA Organizacional
export interface CulturePillar {
  id: string;
  name: string;
  description: string;
  weight: number; // 1 to 5
  expectedBehaviors: string[];
  undesiredBehaviors: string[];
}

export interface OrganizationalDNA {
  tenantId: string;
  mission: string;
  vision: string;
  archetype: 'Inovador & Ágil' | 'Orientado a Resultados' | 'Colaborativo & Humanizado' | 'Precisão & Segurança' | 'Customer Centric';
  cultureSummary: string;
  coreValues: string[];
  pillars: CulturePillar[];
  culturalFitThreshold: number; // 0 - 100
  updatedAt: string;
}

// 4. Estrutura Organizacional
export interface Department {
  id: string;
  name: string;
  code: string;
  parentId?: string; // Hierarchical structure
  managerId: string;
  costCenter: string;
  headcountTarget: number;
  currentHeadcount: number;
}

export interface Squad {
  id: string;
  departmentId: string;
  name: string;
  leaderId: string;
}

// 5. Cargos
export const POSITION_LEVELS = ['Júnior', 'Pleno', 'Sênior', 'Especialista', 'Coordenação', 'Gerência', 'Diretoria'] as const;
export type PositionLevel = (typeof POSITION_LEVELS)[number];
export const CAREER_TRACKS = ['Y_TECNICO', 'GESTÃO', 'OPERACIONAL'] as const;
export type CareerTrack = (typeof CAREER_TRACKS)[number];

export interface JobPosition {
  id: string;
  title: string;
  departmentId: string;
  level: PositionLevel;
  description: string;
  technicalRequirements: string[];
  behavioralCompetencies: string[];
  minSalary: number;
  maxSalary: number;
  currency: string;
  careerTrack: CareerTrack;
  status: 'active' | 'archived';
}

// 6. Vagas
export type JobStatus = 'draft' | 'open' | 'in_progress' | 'offer' | 'filled' | 'cancelled';

export interface PipelineStage {
  id: string;
  name: string;
  type: 'screening' | 'cultural_fit' | 'technical_assessment' | 'manager_interview' | 'proposal' | 'hired';
  order: number;
  description: string;
}

export interface JobOpening {
  id: string;
  positionId: string;
  title: string;
  departmentId: string;
  hiringManagerId: string;
  recruiterId: string;
  status: JobStatus;
  openingsCount: number;
  filledCount: number;
  workModel: 'Presencial' | 'Híbrido' | 'Remoto';
  location: string;
  slaDays: number;
  openedAt: string;
  targetFillDate: string;
  stages: PipelineStage[];
  customQuestions?: string[];
  salaryOfferedMin?: number;
  salaryOfferedMax?: number;
}

// 7. Candidatos
/** Campos que o candidato declara no formulário do portal: protegidos contra edição direta (só correção com motivo). */
export const CANDIDATE_DECLARED_FIELDS = [
  'name', 'email', 'phone', 'location', 'linkedinUrl', 'currentRole', 'yearsOfExperience', 'education', 'resumeSummary', 'skills'
] as const;
export type CandidateDeclaredField = typeof CANDIDATE_DECLARED_FIELDS[number];

export interface CandidateChange {
  id: string;
  candidateId: string;
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  kind: 'correction' | 'update';
  reason?: string;
  changedBy: string;
  changedById?: string;
  changedAt: string;
}

export interface Candidate {
  /** 'candidate': informado pelo próprio candidato no portal (campos declarados protegidos); 'rh': cadastrado pelo RH. */
  dataOrigin: 'candidate' | 'rh';
  /** Perfil arquivado: sai da lista principal do Banco de Talentos, sem apagar nada. */
  archived: boolean;
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl?: string;
  currentRole: string;
  yearsOfExperience: number;
  education: string;
  resumeSummary: string;
  skills: string[];
  languages: string[];
  registeredAt: string;
  tags: string[];
}

// 8. Processo Seletivo (Inscrição de Candidato em Vaga)
export type ApplicationStatus = 'in_review' | 'advancing' | 'hold' | 'rejected' | 'hired';

export interface SelectionApplication {
  id: string;
  jobOpeningId: string;
  candidateId: string;
  currentStageId: string;
  status: ApplicationStatus;
  appliedAt: string;
  notes: string[];
  aiEvaluationId?: string;
}

// 9. Avaliação Assistida por IA
export interface PillarScore {
  pillarName: string;
  score: number; // 0 - 100
  analysis: string;
}

export type AIEvaluationSource = 'gemini' | 'heuristic';

export interface AIAssistedEvaluation {
  id: string;
  candidateId: string;
  jobOpeningId: string;
  evaluatedAt: string;
  /** 'gemini' = modelo de IA; 'heuristic' = estimativa local por regras (NÃO é IA). Ausente = origem não registrada. */
  source?: AIEvaluationSource;
  overallFitScore: number; // 0 - 100
  technicalFitScore: number;
  culturalFitScore: number;
  detailedExplanation: string;
  keyStrengths: string[];
  potentialGaps: string[];
  suggestedInterviewQuestions: string[];
  pillarScores: PillarScore[];
  // Respecting human decision & transparency:
  humanReviewerDecision?: 'APPROVED' | 'REJECTED' | 'REQUEST_ADDITIONAL_INTERVIEW' | 'OVERRIDDEN';
  humanNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

// 9.2 Triagem Inteligente de Currículos
/** Formatos aceitos: PDF e Word moderno (.docx). O tipo é detectado pelo conteúdo do arquivo, nunca pelo nome nem pelo navegador. */
export const RESUME_MIMES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] as const;
export type ResumeMime = (typeof RESUME_MIMES)[number];
/** Limites de envio: por lote (uma seleção de arquivos) e por vaga. O tamanho por arquivo é MAX_UPLOAD_BYTES. */
export const RESUME_LIMITS = { perBatch: 50, perJob: 300 } as const;

export type ResumeScreeningStatus = 'uploaded' | 'analyzing' | 'analyzed' | 'needs_data' | 'failed';
export type RequirementStatus = 'met' | 'partial' | 'not_met' | 'no_evidence';
/** Quanto o currículo mostra de um pilar do DNA: 'none' = nenhum sinal observável (nota neutra, nunca nota baixa). */
export type EvidenceLevel = 'high' | 'medium' | 'low' | 'none';
export type DocumentQuality = 'good' | 'partial' | 'unreadable';

export interface RequirementCheck {
  id: string;
  requirement: string;
  status: RequirementStatus;
  /** Trecho curto copiado do currículo que sustenta o status (vazio quando não há). */
  evidence: string;
}

export interface PillarReading {
  id: string;
  name: string;
  weight: number;
  score: number;
  confidence: EvidenceLevel;
  analysis: string;
  evidence: string;
}

/** Dados lidos do currículo. Só o necessário para a triagem: nada de data de nascimento, estado civil, foto ou documentos. */
export interface ResumeExtraction {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  currentRole?: string;
  yearsOfExperience?: number;
  education?: string;
  skills: string[];
  languages: string[];
  summary?: string;
}

/** Os critérios que a IA recebeu, guardados junto da leitura para o RH poder conferir "com que régua isto foi avaliado". */
export interface ScreeningCriteriaSnapshot {
  jobTitle: string;
  positionTitle: string;
  level: string;
  requirements: string[];
  pillars: Array<{ id: string; name: string; weight: number }>;
  culturalFitThreshold: number;
}

export interface ResumeAnalysis {
  promptVersion: string;
  model: string;
  criteriaHash: string;
  criteria: ScreeningCriteriaSnapshot;
  documentQuality: DocumentQuality;
  qualityNote?: string;
  extraction: ResumeExtraction;
  requirements: RequirementCheck[];
  pillars: PillarReading[];
  /** Nota técnica dada pela IA; a cultural e a geral são calculadas pelo sistema (src/screening.ts). */
  technicalScore: number;
  culturalScore: number | null;
  culturalCoverage: number;
  overallScore: number;
  strengths: string[];
  gaps: string[];
  interviewQuestions: string[];
  explanation: string;
  /** O currículo continha instruções dirigidas à IA (tentativa de manipular a nota). */
  instructionsInDocument: boolean;
  /** Texto oculto (branco, invisível) no arquivo Word. */
  hiddenText: boolean;
  truncated: boolean;
}

/** O que a lista precisa de cada leitura, sem carregar a análise inteira. */
export interface ScreeningSummary {
  overallScore: number;
  technicalScore: number;
  culturalScore: number | null;
  culturalCoverage: number;
  requirements: { total: number; met: number; partial: number; notMet: number; noEvidence: number };
  documentQuality: DocumentQuality;
  instructionsInDocument: boolean;
  hiddenText: boolean;
  criteriaHash: string;
}

/** Uma linha de `resume_screenings`. */
export interface ResumeScreening {
  id: string;
  jobOpeningId: string;
  candidateId?: string;
  applicationId?: string;
  evaluationId?: string;
  fileName: string;
  mime: ResumeMime;
  sizeBytes: number;
  contentHash: string;
  storagePath: string;
  status: ResumeScreeningStatus;
  failureCode?: string;
  failureMessage?: string;
  attempts: number;
  analyzingSince?: string;
  summary?: ScreeningSummary;
  analysis?: ResumeAnalysis;
  model?: string;
  promptVersion?: string;
  criteriaHash?: string;
  inputTokens: number;
  outputTokens: number;
  uploadedById: string;
  uploadedByName: string;
  uploadedAt: string;
  analyzedAt?: string;
}

/** O arquivo como a tela o vê (sem caminho de armazenamento nem hash). `status` já é o efetivo: "lendo" abandonado volta a "guardado". */
export interface ScreeningFile {
  id: string;
  fileName: string;
  mime: ResumeMime;
  sizeBytes: number;
  status: ResumeScreeningStatus;
  failureCode?: string;
  failureMessage?: string;
  attempts: number;
  applicationId?: string;
  candidateId?: string;
  summary?: ScreeningSummary;
  uploadedByName: string;
  uploadedAt: string;
  analyzedAt?: string;
}

/** Sinais derivados na leitura (não são gravados: refletem o corte atual do DNA e os critérios atuais do Cargo). */
export const SCREENING_FLAGS = [
  'second_look',
  'below_cultural_cut',
  'cultural_unverified',
  'missing_requirements',
  'incomplete_resume',
  'injection_suspected',
  'score_inconsistent',
  'criteria_changed',
  'no_resume'
] as const;
export type ScreeningFlag = (typeof SCREENING_FLAGS)[number];

/** Uma candidatura da vaga na lista de triagem. */
export interface ScreeningRow {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  currentRole: string;
  yearsOfExperience: number;
  location: string;
  stageId: string;
  applicationStatus: ApplicationStatus;
  appliedAt: string;
  /** A avaliação real mais recente (uma estimativa local nunca entra no ranking). */
  evaluation?: {
    id: string;
    overallFitScore: number;
    technicalFitScore: number;
    culturalFitScore: number;
    evaluatedAt: string;
    humanReviewerDecision?: AIAssistedEvaluation['humanReviewerDecision'];
  };
  file?: ScreeningFile;
  flags: ScreeningFlag[];
}

export interface ScreeningCriteriaInfo {
  positionTitle: string;
  requirementCount: number;
  pillarCount: number;
  culturalFitThreshold: number | null;
  criteriaHash: string;
  /** Motivos, em português, pelos quais a triagem não pode rodar ou ficará menos precisa. */
  blockers: string[];
  warnings: string[];
}

export interface ScreeningBoard {
  jobId: string;
  jobTitle: string;
  /** Vaga preenchida ou cancelada: não recebe novos currículos. */
  jobClosed: boolean;
  criteria: ScreeningCriteriaInfo;
  rows: ScreeningRow[];
  /** Arquivos que ainda não viraram candidatura (guardados, lendo, com falha ou precisando de dados). */
  pending: ScreeningFile[];
  fileCount: number;
}

export interface ScreeningDetail {
  file: ScreeningFile;
  analysis?: ResumeAnalysis;
  flags: ScreeningFlag[];
  candidate?: Pick<Candidate, 'id' | 'name' | 'email' | 'phone' | 'location' | 'currentRole' | 'yearsOfExperience' | 'education' | 'skills' | 'archived'>;
  culturalFitThreshold: number | null;
}

export interface ScreeningAllowance {
  available: boolean;
  reason?: 'paused' | 'limit_reached' | 'budget_reached' | 'not_configured';
  message?: string;
  /** Análises com IA que o mês ainda comporta para esta organização (null = sem limite). */
  remaining: number | null;
  limit: number | null;
  used: number;
}

export type ScreeningDecisionAction = 'advance' | 'hold' | 'archive';
export interface ScreeningDecisionItem {
  applicationId: string;
  /** Etapa em que a tela viu a candidatura: impede avanço duplo por clique repetido ou por dois recrutadores. */
  fromStageId: string;
}
export interface ScreeningDecisionResult {
  applicationId: string;
  ok: boolean;
  message?: string;
  stageId?: string;
  status?: ApplicationStatus;
}

// 9.1 Controle de créditos e consumo da IA (Conta Mãe)
/** O que fazer quando um limite mensal é atingido: seguir com a estimativa local (sem custo) ou barrar o pedido. */
export type AiLimitPolicy = 'estimate' | 'block';

export type AiUsagePeriod = 'this_month' | 'last_month' | 'last_30';

/** Regras da plataforma para o uso da IA. Campos ausentes = não definido. */
export interface AiSettings {
  /** false = IA pausada: todas as avaliações usam a estimativa local. */
  enabled: boolean;
  /** Modelo definido no painel; ausente = o do ambiente. */
  model?: string;
  /** Teto de gasto estimado do mês, em R$, somando todas as organizações. */
  monthlyBudgetBrl?: number;
  /** Avaliações com IA por mês para cada organização sem limite próprio. */
  defaultOrgMonthlyLimit?: number;
  onLimit: AiLimitPolicy;
  /** Preços usados para ESTIMAR o custo (US$ por 1 milhão de unidades de texto). */
  priceInputUsd?: number;
  priceOutputUsd?: number;
  usdBrlRate?: number;
  pricesUpdatedAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AiOrgUsage {
  tenantId: string;
  name: string;
  slug: string;
  /** Avaliações que usaram a IA no período escolhido. */
  evaluations: number;
  costBrl: number;
  /** Pedidos do período que NÃO usaram a IA (estimativa local, falha ou bloqueio). */
  withoutAi: number;
  /** Avaliações com IA no mês corrente (é o que conta para o limite). */
  monthEvaluations: number;
  monthlyLimit: number | null;
  limitSource: 'custom' | 'default' | 'none';
}

export interface AiUsageOverview {
  period: AiUsagePeriod;
  periodLabel: string;
  settings: AiSettings;
  /** Modelo realmente usado agora (painel > ambiente > padrão). */
  effectiveModel: string;
  /** A chave do Google está configurada no servidor. */
  connectionConfigured: boolean;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  /** Preços e cotação informados: sem isso não há como estimar o valor em R$. */
  pricesReady: boolean;
  totals: {
    evaluations: number;
    estimates: number;
    failures: number;
    blocked: number;
    costBrl: number;
    avgCostBrl: number | null;
    /** Avaliações que repetiram um candidato+vaga já avaliado com IA antes. */
    repeated: number;
    repeatedCostBrl: number;
    /** Avaliações com IA que nenhuma pessoa revisou. */
    unreviewed: number;
    /** Avaliações com IA sem custo calculado por falta de preço. */
    unpriced: number;
  };
  /** Só no período "este mês": total do mês passado inteiro e previsão para o fim deste mês. */
  lastMonthCostBrl: number | null;
  projectionBrl: number | null;
  /** Sempre o mês corrente (é a base do teto de gasto). */
  month: { costBrl: number; evaluations: number; budgetBrl: number | null; budgetPercent: number | null };
  daily: Array<{ day: string; evaluations: number; costBrl: number }>;
  organizations: AiOrgUsage[];
  organizationsTruncated: boolean;
}

// 10. Entrevistas
export interface InterviewScorecardItem {
  competency: string;
  score: number; // 1 to 5
  notes: string;
}

export interface InterviewSession {
  id: string;
  jobOpeningId: string;
  candidateId: string;
  stageName: string;
  scheduledFor: string;
  interviewerIds: string[];
  durationMinutes: number;
  meetLink?: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  structuredScript: string[];
  scorecard: InterviewScorecardItem[];
  interviewerRecommendation?: 'STRONG_YES' | 'YES' | 'NEUTRAL' | 'NO';
  overallFeedback?: string;
}

// 11. Proposta
/** Tipos de documento anexados a uma proposta (contrato assinado, aditivos etc.). */
export const OFFER_DOCUMENT_CATEGORIES = ['Contrato assinado', 'Aditivo contratual', 'Carta-proposta assinada', 'Outros'] as const;
export type OfferDocumentCategory = typeof OFFER_DOCUMENT_CATEGORIES[number];
export const MAX_OFFER_DOCUMENTS = 20;
/** Upload limit (PDF/JPG/PNG). Vercel Functions reject request bodies above 4.5 MB, so 4 MB is the ceiling. Shared by UI and API. */
export const MAX_UPLOAD_MB = 4;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** Arquivo guardado no armazenamento privado; só os metadados ficam na proposta e o download passa pela API. */
export interface OfferDocument {
  id: string;
  category: OfferDocumentCategory;
  name: string;
  mime: string;
  size: number;
  path: string;
  description?: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface JobOffer {
  id: string;
  jobOpeningId: string;
  candidateId: string;
  baseSalary: number;
  benefits: string[];
  startDate: string;
  contractType: 'CLT' | 'PJ';
  status: 'draft' | 'pending_approval' | 'approved' | 'sent' | 'accepted' | 'declined';
  approverId: string;
  sentAt?: string;
  respondedAt?: string;
  notes?: string;
  /** Contratos assinados, aditivos e demais anexos. Ausente em respostas de versões antigas do servidor. */
  documents?: OfferDocument[];
}

export const BENEFIT_CATEGORIES = ['Saúde', 'Alimentação', 'Financeiro', 'Bem-estar', 'Trabalho', 'Outros'] as const;
export type BenefitCategory = typeof BENEFIT_CATEGORIES[number];

/** Benefício do catálogo da organização. `defaultLevels`: níveis de cargo em que já vem marcado na proposta. */
export interface BenefitCatalogItem {
  id: string;
  name: string;
  category: BenefitCategory;
  description: string;
  active: boolean;
  defaultLevels: JobPosition['level'][];
}

// 12. Onboarding
export const CHECKLIST_CATEGORIES = ['Documentação', 'TI & Acessos', 'Cultura & Boas-Vindas', 'Treinamento Técnico'] as const;
export const CHECKLIST_RESPONSIBLES = ['RH', 'TI', 'Gestor', 'Buddy'] as const;

/** Item do modelo de integração da organização (checklist pós-início). */
export interface IntegrationTemplate {
  id: string;
  name: string;
  category: typeof CHECKLIST_CATEGORIES[number];
  responsible: typeof CHECKLIST_RESPONSIBLES[number];
  dueDay: number;
  active: boolean;
}

export interface OnboardingChecklistItem {
  id: string;
  templateId?: string;
  title: string;
  category: 'Documentação' | 'TI & Acessos' | 'Cultura & Boas-Vindas' | 'Treinamento Técnico';
  dueDateDay: number; // e.g., Day 1, Day 7, Day 30
  status: 'pending' | 'in_progress' | 'completed';
  assignedToRole: string;
}

// 12.1 Admissão (documentos e etapas exigidos na contratação)
export const ADMISSION_CATEGORIES = ['Documentos pessoais', 'Exames', 'Dados bancários e dependentes', 'Contratuais', 'Etapas internas'] as const;
export const ADMISSION_RESPONSIBLES = ['RH', 'Candidato', 'DP', 'Jurídico', 'TI'] as const;
export type AdmissionCategory = typeof ADMISSION_CATEGORIES[number];
export type AdmissionResponsible = typeof ADMISSION_RESPONSIBLES[number];

/** Item do catálogo da organização: vira um item da pasta de admissão de cada contratação. */
export interface AdmissionTemplate {
  id: string;
  name: string;
  category: AdmissionCategory;
  description: string;
  required: boolean;
  requiresDocument: boolean;
  responsible: AdmissionResponsible;
  dueDaysBeforeStart: number;
  contractTypes: JobOffer['contractType'][];
  active: boolean;
}

export type AdmissionStatus = 'pending' | 'submitted' | 'approved' | 'rejected';

export interface AdmissionFile {
  name: string;
  mime: string;
  size: number;
  path: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface AdmissionHistoryEntry {
  at: string;
  by: string;
  action: string;
}

export interface AdmissionItem {
  id: string;
  templateId?: string;
  title: string;
  category: AdmissionCategory;
  required: boolean;
  requiresDocument: boolean;
  responsible: AdmissionResponsible;
  dueDate: string;
  status: AdmissionStatus;
  file?: AdmissionFile;
  reviewNote?: string;
  history: AdmissionHistoryEntry[];
}

export interface OnboardingJourney {
  id: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  departmentId: string;
  mentorId: string;
  hireDate: string;
  status: 'preparing' | 'in_progress' | 'completed';
  checklists: OnboardingChecklistItem[];
  admission: AdmissionItem[];
  employeeId?: string;
  milestones30DaysDone: boolean;
  milestones60DaysDone: boolean;
  milestones90DaysDone: boolean;
  notes: string;
}

// 13. Desenvolvimento
export const PDI_GOAL_STATUSES = ['not_started', 'in_progress', 'achieved', 'cancelled'] as const;
export type PDIGoalStatus = (typeof PDI_GOAL_STATUSES)[number];

/** Limits that keep one PDI record (stored as jsonb) from growing without bound. */
export const PDI_MAX_GOALS = 50;
export const PDI_MAX_ONE_ON_ONES = 300;
export const PDI_MAX_GOAL_HISTORY = 100;
export const PDI_MAX_ACTION_ITEMS = 20;

/** One progress update of a goal (who moved it, to what, and why). */
export interface PDIGoalCheckIn {
  at: string;
  by: string;
  progressPercentage: number;
  status: PDIGoalStatus;
  note?: string;
}

export interface PDIGoal {
  id: string;
  title: string;
  competency: string;
  deadline: string;
  status: PDIGoalStatus;
  progressPercentage: number;
  description?: string;
  createdAt?: string;
  /** Set when the goal reaches "achieved"; cleared if it is reopened. */
  completedAt?: string;
  history?: PDIGoalCheckIn[];
}

export interface OneOnOneMeeting {
  id: string;
  date: string;
  keyTakeaways: string;
  actionItems: string[];
  registeredBy?: string;
}

export interface CollaboratorDevelopment {
  id: string;
  collaboratorId: string;
  collaboratorName: string;
  /** Título do cargo. Vem do Cargo cadastrado (`positionId`); nos PDIs ainda não vinculados é só o rótulo antigo. */
  jobTitle: string;
  /** Cargo cadastrado (módulo Cargos). O cargo nunca é digitado. */
  positionId?: string;
  departmentId?: string;
  managerId?: string;
  hireDate: string;
  goals: PDIGoal[];
  oneOnOnes: OneOnOneMeeting[];
  /** Date of the newest 1:1 ('' while there is none). Always derived from the 1:1 history. */
  lastReviewDate: string;
  /** Date agreed for the next 1:1 ('' when nothing is scheduled). */
  nextReviewDate: string;
  employeeId?: string;
}

/** Someone who can get a PDI: a hire in onboarding or a member of the organization without a PDI yet. */
export interface DevelopmentPerson {
  id: string;
  name: string;
  jobTitle: string;
  departmentId?: string;
  /** Cargo cadastrado da pessoa (quando já vinculada), para pré-preencher o PDI. */
  positionId?: string;
  hireDate?: string;
  origin: 'hire' | 'member';
}

/** Answer of every PDI change: the updated PDI and its pending "next 1:1" appointment in the Agenda (null when none). */
export interface DevelopmentChange {
  record: CollaboratorDevelopment;
  nextMeeting: AgendaEvent | null;
}

/** Names behind the department / manager ids of the PDI records (also needed by read-only viewers). */
export interface DevelopmentLookups {
  departments: { id: string; name: string }[];
  members: { id: string; name: string; jobTitle?: string }[];
  /** Cargos ativos do cadastro de Cargos, os únicos que um PDI pode receber. */
  positions: { id: string; title: string; departmentId: string }[];
}

// 14. Retenção
export const CLIMATE_CATEGORIES = ['lideranca', 'cultura', 'crescimento', 'remuneracao', 'ambiente'] as const;
export type ClimateCategory = (typeof CLIMATE_CATEGORIES)[number];

// ---- Perguntas estratégicas por cargo (blocos e templates) ----
export const QUESTION_TYPES = ['scale', 'choice', 'text'] as const;
/** scale: nota de 0 a 10 · choice: escolha única entre as opções · text: resposta livre. */
export type SurveyQuestionType = (typeof QUESTION_TYPES)[number];

export interface SurveyQuestion {
  id: string;
  text: string;
  type: SurveyQuestionType;
  /** Só para `choice`: de 2 a SURVEY_LIMITS.options opções. */
  options?: string[];
  required: boolean;
}

/** Como um template sugere os cargos de um bloco: pelos atributos do cadastro de Cargos (nível e trilha), nunca por texto livre. */
export interface TargetHints {
  levels: PositionLevel[];
  careerTracks: CareerTrack[];
}

/**
 * Grupo de perguntas estratégicas. `audience: 'all'` vale para todos; `'roles'` só para quem tem um dos Cargos cadastrados em
 * `positionIds`. Nos templates, `targetHints` sugere esses cargos quando o template vira uma pesquisa.
 */
export interface SurveyBlock {
  id: string;
  title: string;
  description?: string;
  audience: 'all' | 'roles';
  positionIds: string[];
  targetHints: TargetHints;
  questions: SurveyQuestion[];
}

export const SURVEY_LIMITS = { blocks: 6, questionsPerBlock: 12, questions: 30, options: 8 } as const;

export interface SurveyTemplate {
  id: string;
  name: string;
  description: string;
  /** Área a que o template se dirige (ex.: "Tecnologia"). */
  focus?: string;
  blocks: SurveyBlock[];
  /** true = biblioteca do sistema (somente leitura). */
  system: boolean;
  /** Template do sistema de onde esta cópia saiu. */
  basedOn?: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type SurveyAnswerValue = number | string;

/** Uma resposta ANÔNIMA de pesquisa de clima. Nunca carrega quem respondeu. `campaignId` ausente = pesquisa histórica. */
export interface ClimateSurveyResponse {
  id: string;
  period: string; // e.g. "2026-Q1"
  enpsScore: number; // 0 to 10
  sentiment: 'positive' | 'neutral' | 'negative';
  categoryRatings: Record<ClimateCategory, number>; // 0 to 10
  anonymousComment?: string;
  campaignId?: string;
  departmentId?: string;
  commentHidden?: boolean;
  /** Respostas às perguntas dos blocos, por id de pergunta. */
  blockAnswers?: Record<string, SurveyAnswerValue>;
  /** Ids das perguntas de texto cuja resposta o RH ocultou. */
  hiddenTexts?: string[];
}

export const ALERT_STATUSES = ['open', 'monitoring', 'resolved', 'dismissed', 'left'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];
export type RiskLevel = 'Baixo' | 'Médio' | 'Alto';

/** Limits that keep one alert (its history is stored as jsonb) from growing without bound. */
export const ALERT_MAX_SIGNALS = 20;
export const ALERT_MAX_ACTIONS = 20;
export const ALERT_MAX_HISTORY = 100;

export interface AlertHistoryEntry {
  at: string;
  by: string;
  kind: 'created' | 'action' | 'status' | 'risk' | 'owner' | 'edit';
  text: string;
}

export interface TurnoverRiskAlert {
  id: string;
  collaboratorId: string;
  collaboratorName: string;
  department: string;
  departmentId?: string;
  riskLevel: RiskLevel;
  earlyWarningSignals: string[];
  suggestedActions: string[];
  lastActionTaken?: string;
  status: AlertStatus;
  ownerId?: string;
  history: AlertHistoryEntry[];
  createdAt?: string;
  createdBy?: string;
  /** Quem abriu o alerta (id do vínculo na organização): sempre enxerga o próprio alerta. */
  createdById?: string;
  updatedAt?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  employeeId?: string;
}

/** Someone an alert can be opened for: a PDI collaborator, a hire in onboarding or an active member. */
export interface RetentionPerson {
  id: string;
  name: string;
  jobTitle: string;
  departmentId?: string;
  origin: 'pdi' | 'hire' | 'member';
}

export const CAMPAIGN_STATUSES = ['draft', 'open', 'closed'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export interface ClimateCampaign {
  id: string;
  name: string;
  period: string;
  description?: string;
  /** Situação em vigor: uma campanha aberta passa a "encerrada" sozinha depois da data de encerramento. */
  status: CampaignStatus;
  audience: 'all' | 'departments';
  departmentIds: string[];
  closesOn?: string;
  actionPlan?: string;
  /** Perguntas estratégicas (cópia do template no momento da criação). Só editável enquanto for rascunho. */
  blocks: SurveyBlock[];
  /** Nome do template que originou a pesquisa (informativo). */
  templateName?: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  publishedAt?: string;
  closedAt?: string;
}

/** Campanha com a participação: `eligible` = pessoas ativas do público; `responded` = quantas já responderam. */
export interface ClimateCampaignSummary extends ClimateCampaign {
  eligible: number;
  responded: number;
}

export interface EnpsBreakdown {
  score: number; // -100 to +100
  promoters: number;
  passives: number;
  detractors: number;
  responses: number;
}

export type EnpsZone = 'critical' | 'good' | 'great' | 'excellent';

export interface ClimateTrendPoint {
  key: string;
  label: string;
  responses: number;
  enps: number;
}

export interface RetentionMetrics {
  /** eNPS da pesquisa mais recente com resultado liberado; null quando ainda não há nenhuma. */
  enps: EnpsBreakdown | null;
  /** Nome da pesquisa que originou o eNPS (período ou campanha). */
  enpsSource: string | null;
  zone: EnpsZone | null;
  categoryAverages: Record<ClimateCategory, number> | null;
  trend: ClimateTrendPoint[];
  alertsByRisk: Record<RiskLevel, number>;
  activeAlerts: number;
  /** 100 - rotatividade dos primeiros 90 dias (Indicadores); null sem base de cálculo. */
  retention90Rate: number | null;
}

/** Cargo cadastrado (módulo Cargos) e quantas pessoas ativas estão vinculadas a ele. */
export interface PositionOption {
  id: string;
  title: string;
  departmentId: string;
  level: PositionLevel;
  careerTrack: CareerTrack;
  count: number;
}

export interface RetentionData {
  /** 'all': vê os alertas de toda a organização · 'team': só os da própria equipe. */
  alertScope: 'all' | 'team';
  turnoverAlerts: TurnoverRiskAlert[];
  campaigns: ClimateCampaignSummary[];
  /** Templates da organização (a biblioteca do sistema vem no código: src/surveyTemplates.ts). */
  surveyTemplates: SurveyTemplate[];
  /** Cargos ativos do cadastro (onde os blocos por cargo escolhem). */
  positions: PositionOption[];
  /** Pessoas ativas ainda sem Cargo cadastrado: elas não veem blocos por cargo até o RH vinculá-las. */
  unlinkedMembers: number;
  metrics: RetentionMetrics;
  lookups: DevelopmentLookups;
  /** collaboratorId -> id do PDI dessa pessoa (para abrir o PDI a partir do alerta). */
  developmentLinks: Record<string, string>;
}

export interface CampaignDepartmentResult {
  departmentId: string;
  name: string;
  responses: number;
  enps: number;
  categoryAverages: Record<ClimateCategory, number>;
}

export interface CampaignComment {
  /** Id da resposta (não identifica a pessoa). */
  id: string;
  /** Presente quando o texto responde a uma pergunta de bloco; ausente no comentário do núcleo. */
  questionId?: string;
  text: string;
  hidden: boolean;
}

export interface QuestionResult {
  questionId: string;
  text: string;
  type: SurveyQuestionType;
  responses: number;
  /** false = poucas respostas (menos que o mínimo): nada é detalhado. */
  released: boolean;
  /** scale */
  average?: number;
  /** choice */
  options?: { label: string; count: number }[];
  /** text */
  comments?: CampaignComment[];
}

export interface BlockResult {
  blockId: string;
  title: string;
  description?: string;
  audience: 'all' | 'roles';
  /** Títulos dos Cargos cadastrados a que o bloco se dirige. */
  positionTitles: string[];
  /** Pessoas do público da pesquisa que veem o bloco. */
  eligible: number;
  /** Pessoas que responderam a ao menos uma pergunta do bloco. */
  responded: number;
  released: boolean;
  questions: QuestionResult[];
}

/** Resultado de uma campanha. Grupos com poucas respostas não são detalhados (anonimato): `released` diz se já pode. */
export interface CampaignResults {
  campaign: ClimateCampaignSummary;
  minGroup: number;
  released: boolean;
  responseRate: number;
  enps: EnpsBreakdown | null;
  zone: EnpsZone | null;
  categoryAverages: Record<ClimateCategory, number> | null;
  departments: CampaignDepartmentResult[];
  comments: CampaignComment[];
  /** Perguntas estratégicas, bloco a bloco (cada bloco respeita o mínimo de respostas). */
  blocks: BlockResult[];
  previous: { name: string; enps: number } | null;
}

/** Bloco como a pessoa o vê ao responder: só o que ela precisa (sem cargos-alvo). */
export type PendingBlock = Pick<SurveyBlock, 'id' | 'title' | 'description' | 'questions'>;

/** Pesquisa aberta que a pessoa pode (ou já pode ter) respondido. */
export interface PendingSurvey {
  campaignId: string;
  name: string;
  period: string;
  description?: string;
  closesOn?: string;
  answered: boolean;
  /** Blocos de perguntas estratégicas que valem para o cargo desta pessoa. */
  blocks: PendingBlock[];
}

export interface SurveyAnswer {
  enps: number;
  categories: Record<ClimateCategory, number>;
  comment?: string;
  /** Respostas às perguntas dos blocos, por id de pergunta. */
  answers?: Record<string, SurveyAnswerValue>;
}

// 15. Indicadores
export interface TenantIndicators {
  tenantId: string;
  period: string;
  timeToHireDays: number;
  costPerHire: number;
  earlyTurnover90DaysRate: number; // percentage
  averageCulturalFit: number; // percentage
  openPositionsCount: number;
  totalHiresThisQuarter: number;
  retentionRate12Months: number;
  candidateNPS: number;
  recruitmentFunnel: {
    applied: number;
    screened: number;
    interviewed: number;
    offered: number;
    hired: number;
  };
}

// Agenda Corporativa: reuniões e tarefas comuns a toda a organização (sem rotina de permissão associada)
export interface AgendaEvent {
  id: string;
  type: 'meeting' | 'task';
  title: string;
  description?: string;
  status: 'scheduled' | 'in_progress' | 'done' | 'cancelled';
  /** Quando a reunião ocorre / a tarefa vence. */
  startsAt: string;
  endsAt?: string;
  /** Sala, endereço ou link da reunião. */
  location?: string;
  /** Pauta: tópicos planejados antes do compromisso. */
  agenda: string[];
  /** Resumo do que foi alinhado — preenchido após o compromisso. */
  summary?: string;
  /** Ids de TenantUser: participantes (reunião) ou responsáveis (tarefa). */
  assigneeIds: string[];
  createdById: string;
  createdByName: string;
  createdAt: string;
}

/** Diretório mínimo de colaboradores ativos, usado para montar convidados/responsáveis na Agenda — sem exigir a permissão `users:view`. */
export interface AgendaDirectoryMember {
  id: string;
  name: string;
  jobTitle: string;
}

// Master Audit Logs for Cross-Tenant & SuperAdmin Activities
export interface SystemAuditLog {
  id: string;
  timestamp: string;
  tenantId: string;
  userId: string;
  userName: string;
  action: string;
  category: 'TENANT_ROUTING' | 'DB_PROVISIONING' | 'ACCESS_CONTROL' | 'AI_EXECUTION' | 'CANDIDATE_DATA' | 'PEOPLE_DATA' | 'SALES_CRM';
  details: string;
  ipAddress: string;
  databaseAffected: string;
}

export type SalesLeadStatus = 'new' | 'contacted' | 'scheduled' | 'qualified' | 'won' | 'lost';
export type SalesLeadPain = 'hiring' | 'consistency' | 'development' | 'retention' | 'scattered_data' | 'indicators' | 'other';

export interface SalesLead {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  roleTitle: string;
  employeeRange: string;
  pain: SalesLeadPain;
  painDetails?: string;
  preferredDate: string;
  preferredPeriod: 'morning' | 'afternoon';
  timezone: string;
  status: SalesLeadStatus;
  commercialNotes: string;
  nextFollowUpAt?: string;
  consentAt: string;
  source: string;
  assignedTo?: string;
}

// Authentication
export type AuthPrincipalType = 'super_admin' | 'tenant_user';

/** Organization a user is linked to (used by the organization switcher). */
export interface OrgMembership {
  tenantId: string;
  slug: string;
  name: string;
  profileName: string;
}

export interface AuthUser {
  type: AuthPrincipalType;
  /** SuperAdmin id, or the id of the link with the active organization. */
  id: string;
  /** Global identity (organization users only). */
  userId?: string;
  name: string;
  email: string;
  tenantId?: string;        // active organization; absent for SuperAdmin
  profileId?: string;
  profileName?: string;
  isOrgAdmin?: boolean;
  /** Effective permissions in the active organization (SuperAdmin: all). */
  permissions: string[];
  memberships?: OrgMembership[];
  mustChangePassword: boolean;
  usingDefaultPassword?: boolean; // SuperAdmin still on the seeded default password
}

/** What the public careers portal knows about an organization. */
export type PublicTenant = Pick<Tenant, 'slug' | 'name' | 'tradingName' | 'logoUrl'>;
