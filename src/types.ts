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
  dbConfig: DatabaseConfig;
  features: {
    aiEvaluationEnabled: boolean;
    onboardingChecklistEnabled: boolean;
    retentionPredictorEnabled: boolean;
    advancedIndicatorsEnabled: boolean;
  };
}

// 2. Usuários e Permissões
export type UserRole = 
  | 'SUPER_ADMIN' // Conta Mãe
  | 'ORG_ADMIN'   // Administrador da Organização
  | 'RECRUITER'   // Recrutador / Especialista de R&S
  | 'HIRING_MANAGER' // Gestor da Vaga
  | 'INTERVIEWER' // Entrevistador
  | 'COLLABORATOR'; // Colaborador

export interface TenantUser {
  id: string;
  tenantId: string; // 'superadmin' if global
  name: string;
  email: string;
  role: UserRole;
  departmentId?: string;
  jobTitle: string;
  avatarUrl?: string;
  active: boolean;
  lastLoginAt: string;
  permissions: string[];
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
export interface JobPosition {
  id: string;
  title: string;
  departmentId: string;
  level: 'Júnior' | 'Pleno' | 'Sênior' | 'Especialista' | 'Coordenação' | 'Gerência' | 'Diretoria';
  description: string;
  technicalRequirements: string[];
  behavioralCompetencies: string[];
  minSalary: number;
  maxSalary: number;
  currency: string;
  careerTrack: 'Y_TECNICO' | 'GESTÃO' | 'OPERACIONAL';
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
export interface Candidate {
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

export interface AIAssistedEvaluation {
  id: string;
  candidateId: string;
  jobOpeningId: string;
  evaluatedAt: string;
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
}

// 12. Onboarding
export interface OnboardingChecklistItem {
  id: string;
  title: string;
  category: 'Documentação' | 'TI & Acessos' | 'Cultura & Boas-Vindas' | 'Treinamento Técnico';
  dueDateDay: number; // e.g., Day 1, Day 7, Day 30
  status: 'pending' | 'in_progress' | 'completed';
  assignedToRole: string;
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
  milestones30DaysDone: boolean;
  milestones60DaysDone: boolean;
  milestones90DaysDone: boolean;
  notes: string;
}

// 13. Desenvolvimento
export interface PDIGoal {
  id: string;
  title: string;
  competency: string;
  deadline: string;
  status: 'not_started' | 'in_progress' | 'achieved';
  progressPercentage: number;
}

export interface OneOnOneMeeting {
  id: string;
  date: string;
  keyTakeaways: string;
  actionItems: string[];
}

export interface CollaboratorDevelopment {
  id: string;
  collaboratorId: string;
  collaboratorName: string;
  jobTitle: string;
  departmentId: string;
  managerId: string;
  hireDate: string;
  goals: PDIGoal[];
  oneOnOnes: OneOnOneMeeting[];
  lastReviewDate: string;
  nextReviewDate: string;
}

// 14. Retenção
export interface ClimateSurveyResponse {
  id: string;
  period: string; // e.g. "2026-Q1"
  enpsScore: number; // 0 to 10
  sentiment: 'positive' | 'neutral' | 'negative';
  categoryRatings: {
    lideranca: number;
    cultura: number;
    crescimento: number;
    remuneracao: number;
    ambiente: number;
  };
  anonymousComment?: string;
}

export interface TurnoverRiskAlert {
  id: string;
  collaboratorId: string;
  collaboratorName: string;
  department: string;
  riskLevel: 'Baixo' | 'Médio' | 'Alto';
  earlyWarningSignals: string[];
  suggestedActions: string[];
  lastActionTaken?: string;
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

// Master Audit Logs for Cross-Tenant & SuperAdmin Activities
export interface SystemAuditLog {
  id: string;
  timestamp: string;
  tenantId: string;
  userId: string;
  userName: string;
  action: string;
  category: 'TENANT_ROUTING' | 'DB_PROVISIONING' | 'ACCESS_CONTROL' | 'AI_EXECUTION' | 'CANDIDATE_DATA';
  details: string;
  ipAddress: string;
  databaseAffected: string;
}

// Authentication
export type AuthPrincipalType = 'super_admin' | 'tenant_user';

export interface AuthUser {
  type: AuthPrincipalType;
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tenantId?: string;        // set for organization users, absent for SuperAdmin
  mustChangePassword: boolean;
  usingDefaultPassword?: boolean; // SuperAdmin still on the seeded default password
}

/** What the public careers portal knows about an organization. */
export type PublicTenant = Pick<Tenant, 'slug' | 'name' | 'tradingName' | 'logoUrl'>;
