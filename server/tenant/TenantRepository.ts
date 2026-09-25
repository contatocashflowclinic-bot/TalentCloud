import type { PoolClient } from 'pg';
import {
  AdmissionItem,
  AdmissionTemplate,
  AgendaEvent,
  AIAssistedEvaluation,
  BenefitCatalogItem,
  CandidateChange,
  IntegrationTemplate,
  OnboardingChecklistItem,
  Candidate,
  ClimateCampaign,
  ClimateCampaignSummary,
  ClimateSurveyResponse,
  CollaboratorDevelopment,
  Department,
  Employee,
  EmployeeTimelineEvent,
  DevelopmentLookups,
  DevelopmentPerson,
  InterviewSession,
  JobOffer,
  JobOpening,
  JobPosition,
  MAX_OFFER_DOCUMENTS,
  OfferDocument,
  OnboardingJourney,
  OrganizationalDNA,
  PendingSurvey,
  PositionOption,
  ResumeAnalysis,
  ResumeScreening,
  RetentionPerson,
  SelectionApplication,
  SurveyTemplate,
  TenantIndicators,
  TenantUser,
  TurnoverRiskAlert
} from '../../src/types.js';
import { deleteRow, getRow, fromRow, insertRow, listRows, toSnake, updateRow, TableSpec } from '../db/crud.js';
import { getPool, Queryable, withTransaction } from '../db/pool.js';
import { TABLES } from '../db/tables.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors.js';
import { buildAdmissionItems, DEFAULT_ADMISSION_TEMPLATES } from './admission.js';
import {
  assertRecordRemovable, DEFAULT_MEETING_TIME, isMeetingEventId, MEETING_ID_PREFIX, MEETING_MINUTES, meetingEventPrefix,
  newMeetingEventId, nextMeetingDetails, recordIdOfMeetingEvent, spDate, spInstant, spTime, todaySP
} from './development.js';
import { assertCampaignRemovable, isEligible, withEffectiveStatus, type ParsedAnswer } from './climate.js';
import { parseBlockAnswers, toPendingBlocks, visibleBlocks } from './surveyBlocks.js';
import { assertAlertRemovable, buildAlert, buildScopeData, normName, type AlertPatch, type AlertScopeData } from './retention.js';
import { isActiveAlert, sentimentOf } from '../../src/retention.js';
import { buildChecklistItems, DEFAULT_INTEGRATION_TEMPLATES } from './integration.js';
import { newId } from '../ids.js';
import { ANALYSIS_LEASE_MS, MAX_AUTO_ATTEMPTS, summaryOf } from '../../src/screening.js';
import { candidateFromAnalysis, namesCompatible } from './screening.js';

/** Generic CRUD bound to a single tenant and table. */
class Entity<T> {
  constructor(private readonly spec: TableSpec, private readonly tenantId: string) {}
  list(db?: Queryable) { return listRows<T>(this.spec, this.tenantId, db); }
  get(id: string, db?: Queryable) { return getRow<T>(this.spec, this.tenantId, id, db); }
  insert(obj: Record<string, unknown>, db?: Queryable) { return insertRow<T>(this.spec, this.tenantId, obj, db); }
  update(id: string, patch: Record<string, unknown>, db?: Queryable) {
    return updateRow<T>(this.spec, this.tenantId, id, patch, db);
  }
  delete(id: string, db?: Queryable) { return deleteRow(this.spec, this.tenantId, id, db); }
}

const DNA_SPEC: TableSpec = {
  table: 'organizational_dna',
  exposeTenantId: true,
  columns: ['mission', 'vision', 'archetype', 'cultureSummary', 'coreValues', 'pillars', 'culturalFitThreshold', 'updatedAt'],
  json: ['pillars']
};

/** Who is scheduling and, optionally, the time (HH:MM) of the next 1:1. Without `actor` an appointment is never created. */
export interface NextMeetingRequest {
  actor?: { id: string; name: string };
  time?: string;
}

/** Cap on the templates an organization keeps (the system library does not count). */
const MAX_ORG_TEMPLATES = 50;

const INDICATOR_FIELDS = [
  'period', 'timeToHireDays', 'costPerHire', 'earlyTurnover90DaysRate', 'averageCulturalFit', 'openPositionsCount',
  'totalHiresThisQuarter', 'retentionRate12Months', 'candidateNPS', 'recruitmentFunnel'
] as const;

export interface ScreeningMaterializeResult {
  screening: ResumeScreening;
  candidate?: Candidate;
  application?: SelectionApplication;
  evaluation?: AIAssistedEvaluation;
}

/**
 * TenantRepository
 * All data access for one organization. Every statement is scoped by tenant_id and
 * the composite foreign keys in the schema make cross-tenant references impossible.
 */
export class TenantRepository {
  readonly users: Entity<TenantUser>;
  readonly employees: Entity<Employee>;
  readonly departments: Entity<Department>;
  readonly positions: Entity<JobPosition>;
  readonly openings: Entity<JobOpening>;
  readonly candidates: Entity<Candidate>;
  readonly candidateChanges: Entity<CandidateChange>;
  readonly applications: Entity<SelectionApplication>;
  readonly aiEvaluations: Entity<AIAssistedEvaluation>;
  readonly interviews: Entity<InterviewSession>;
  readonly offers: Entity<JobOffer>;
  readonly benefits: Entity<BenefitCatalogItem>;
  readonly admissionTemplates: Entity<AdmissionTemplate>;
  readonly integrationTemplates: Entity<IntegrationTemplate>;
  readonly onboardings: Entity<OnboardingJourney>;
  readonly development: Entity<CollaboratorDevelopment>;
  readonly climateCampaigns: Entity<ClimateCampaign>;
  readonly surveyTemplates: Entity<Omit<SurveyTemplate, 'system'>>;
  readonly climateSurveys: Entity<ClimateSurveyResponse>;
  readonly turnoverAlerts: Entity<TurnoverRiskAlert>;
  readonly agendaEvents: Entity<AgendaEvent>;
  readonly resumeScreenings: Entity<ResumeScreening>;

  constructor(public readonly tenantId: string) {
    this.users = new Entity(TABLES.users, tenantId);
    this.employees = new Entity(TABLES.employees, tenantId);
    this.departments = new Entity(TABLES.departments, tenantId);
    this.positions = new Entity(TABLES.positions, tenantId);
    this.openings = new Entity(TABLES.openings, tenantId);
    this.candidates = new Entity(TABLES.candidates, tenantId);
    this.candidateChanges = new Entity(TABLES.candidateChanges, tenantId);
    this.applications = new Entity(TABLES.applications, tenantId);
    this.aiEvaluations = new Entity(TABLES.aiEvaluations, tenantId);
    this.interviews = new Entity(TABLES.interviews, tenantId);
    this.offers = new Entity(TABLES.offers, tenantId);
    this.benefits = new Entity(TABLES.benefits, tenantId);
    this.admissionTemplates = new Entity(TABLES.admissionTemplates, tenantId);
    this.integrationTemplates = new Entity(TABLES.integrationTemplates, tenantId);
    this.onboardings = new Entity(TABLES.onboardings, tenantId);
    this.development = new Entity(TABLES.development, tenantId);
    this.climateCampaigns = new Entity(TABLES.climateCampaigns, tenantId);
    this.surveyTemplates = new Entity(TABLES.surveyTemplates, tenantId);
    this.climateSurveys = new Entity(TABLES.climateSurveys, tenantId);
    this.turnoverAlerts = new Entity(TABLES.turnoverAlerts, tenantId);
    this.agendaEvents = new Entity(TABLES.agendaEvents, tenantId);
    this.resumeScreenings = new Entity(TABLES.resumeScreenings, tenantId);
  }


  // ---- RH / Employees ---------------------------------------------------------
  async listEmployees(db: Queryable = getPool()): Promise<Employee[]> {
    return this.employees.list(db);
  }

  async getEmployee(id: string, db: Queryable = getPool()): Promise<Employee | undefined> {
    return this.employees.get(id, db);
  }

  async employeeTimeline(employeeId: string, db: Queryable = getPool()): Promise<EmployeeTimelineEvent[]> {
    const employee = await this.employees.get(employeeId, db);
    if (!employee) throw new NotFoundError('Colaborador nao encontrado.');
    const events: EmployeeTimelineEvent[] = [];
    const add = (event: EmployeeTimelineEvent) => events.push(event);
    add({ id: `profile-${employee.id}`, kind: 'profile', at: employee.createdAt, title: 'Perfil de colaborador criado', description: employee.createdByName ? `Criado por ${employee.createdByName}.` : undefined });

    const [offers, onboardings, developments, alerts] = await Promise.all([
      this.offers.list(db), this.onboardings.list(db), this.development.list(db), this.turnoverAlerts.list(db)
    ]);
    for (const offer of offers.filter(o => employee.candidateId && o.candidateId === employee.candidateId && o.status === 'accepted')) {
      add({ id: `hire-${offer.id}`, kind: 'hire', at: offer.respondedAt ?? employee.hireDate ?? employee.createdAt, title: 'Proposta aceita', description: `Contrato ${offer.contractType} com inicio em ${offer.startDate}.`, tone: 'success', refId: offer.id });
    }
    const relatedOnboardings = onboardings.filter(o => o.employeeId === employee.id || o.id === employee.onboardingId || (employee.candidateId && o.candidateId === employee.candidateId));
    for (const journey of relatedOnboardings) {
      add({ id: `onboarding-${journey.id}`, kind: 'onboarding', at: journey.hireDate, title: 'Jornada de onboarding aberta', description: journey.notes || journey.jobTitle, tone: journey.status === 'completed' ? 'success' : 'info', refId: journey.id });
      for (const item of journey.admission ?? []) {
        for (const h of item.history ?? []) {
          add({ id: `admission-${item.id}-${h.at}`, kind: 'admission', at: h.at, title: item.title, description: h.action, tone: item.status === 'rejected' ? 'danger' : item.status === 'approved' ? 'success' : 'info', refId: item.id });
        }
      }
    }
    const relatedDevelopment = developments.filter(d => d.employeeId === employee.id || d.id === employee.developmentId || d.collaboratorId === employee.candidateId || d.collaboratorId === employee.userId);
    for (const record of relatedDevelopment) {
      add({ id: `development-${record.id}`, kind: 'development', at: record.hireDate || employee.createdAt, title: 'PDI criado', description: record.jobTitle, refId: record.id });
      for (const m of record.oneOnOnes ?? []) {
        add({ id: `one-on-one-${m.id}`, kind: 'one_on_one', at: `${m.date}T12:00:00.000Z`, title: '1:1 registrada', description: m.keyTakeaways, refId: m.id });
      }
    }
    const relatedAlerts = alerts.filter(a => a.employeeId === employee.id || a.collaboratorId === employee.candidateId || a.collaboratorId === employee.userId);
    for (const alert of relatedAlerts) {
      add({ id: `retention-${alert.id}`, kind: 'retention', at: alert.createdAt ?? employee.createdAt, title: `Alerta de reten��o: ${alert.riskLevel}`, description: alert.lastActionTaken || alert.earlyWarningSignals.join(', '), tone: alert.status === 'resolved' ? 'success' : alert.status === 'dismissed' || alert.status === 'left' ? 'warn' : 'danger', refId: alert.id });
      for (const h of alert.history ?? []) {
        add({ id: `retention-${alert.id}-${h.at}`, kind: 'retention', at: h.at, title: 'Historico do alerta', description: h.text, refId: alert.id });
      }
    }
    return events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }

  private async employeeBy(field: 'candidate_id' | 'user_id', value: string, db: Queryable): Promise<Employee | undefined> {
    const { rows } = await db.query(`select * from public.employees where tenant_id = $1 and ${field} = $2 order by seq asc limit 1`, [this.tenantId, value]);
    return rows[0] ? fromRow<Employee>({}, rows[0]) : undefined;
  }

  private async ensureEmployeeForHire(
    offer: JobOffer,
    candidate: Candidate | undefined,
    job: JobOpening | undefined,
    position: JobPosition | undefined,
    links: { onboardingId: string; developmentId?: string },
    tx: Queryable
  ): Promise<Employee> {
    const existing = await this.employeeBy('candidate_id', offer.candidateId, tx);
    const started = offer.startDate <= new Date().toISOString().split('T')[0];
    const patch = {
      name: candidate?.name ?? 'Candidato',
      email: candidate?.email || undefined,
      phone: candidate?.phone || undefined,
      status: started ? 'active' : 'onboarding',
      origin: 'hired_candidate',
      candidateId: offer.candidateId,
      onboardingId: links.onboardingId,
      developmentId: links.developmentId,
      positionId: position?.id,
      jobTitle: position?.title ?? job?.title ?? 'Cargo a definir',
      departmentId: job?.departmentId,
      managerId: job?.hiringManagerId,
      hireDate: offer.startDate,
      updatedAt: new Date().toISOString()
    };
    if (existing) return (await this.employees.update(existing.id, patch, tx))!;
    return this.employees.insert({ id: newId('emp'), ...patch, createdAt: patch.updatedAt, createdByName: 'Sistema' }, tx);
  }
  // ---- DNA (one row per tenant) -------------------------------------
  async getDna(db: Queryable = getPool()): Promise<OrganizationalDNA | undefined> {
    const { rows } = await db.query('select * from public.organizational_dna where tenant_id = $1', [this.tenantId]);
    return rows[0] ? fromRow<OrganizationalDNA>(DNA_SPEC, rows[0]) : undefined;
  }

  async upsertDna(dna: Omit<OrganizationalDNA, 'tenantId'>, db: Queryable = getPool()): Promise<OrganizationalDNA> {
    const { rows } = await db.query(
      `insert into public.organizational_dna
         (tenant_id, mission, vision, archetype, culture_summary, core_values, pillars, cultural_fit_threshold, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (tenant_id) do update set
         mission = excluded.mission, vision = excluded.vision, archetype = excluded.archetype,
         culture_summary = excluded.culture_summary, core_values = excluded.core_values, pillars = excluded.pillars,
         cultural_fit_threshold = excluded.cultural_fit_threshold, updated_at = excluded.updated_at
       returning *`,
      [
        this.tenantId, dna.mission, dna.vision, dna.archetype, dna.cultureSummary, dna.coreValues,
        JSON.stringify(dna.pillars), dna.culturalFitThreshold, dna.updatedAt
      ]
    );
    return fromRow<OrganizationalDNA>(DNA_SPEC, rows[0]);
  }

  // ---- Indicators (latest period wins) --------------------------------
  async getIndicators(db: Queryable = getPool()): Promise<TenantIndicators | undefined> {
    const { rows } = await db.query(
      'select * from public.tenant_indicators where tenant_id = $1 order by period desc limit 1',
      [this.tenantId]
    );
    return rows[0] ? fromRow<TenantIndicators>({ exposeTenantId: true }, rows[0]) : undefined;
  }

  async upsertIndicators(ind: Omit<TenantIndicators, 'tenantId'>, db: Queryable = getPool()): Promise<void> {
    const cols = INDICATOR_FIELDS.map(f => `"${toSnake(f)}"`);
    const values = INDICATOR_FIELDS.map(f => (f === 'recruitmentFunnel' ? JSON.stringify(ind[f]) : ind[f]));
    await db.query(
      `insert into public.tenant_indicators (tenant_id, ${cols.join(', ')})
       values ($1, ${values.map((_, i) => `$${i + 2}`).join(', ')})
       on conflict (tenant_id, period) do update set
         ${cols.filter(c => c !== '"period"').map(c => `${c} = excluded.${c}`).join(', ')}`,
      [this.tenantId, ...values]
    );
  }

  // ---- Candidates: every change leaves a permanent, append-only trail ----------
  /**
   * Applies a patch to a candidate and records one history row per field that really changed
   * (previous value, new value, who, when and — for corrections — why), in the same transaction.
   */
  async updateCandidate(
    id: string,
    patch: Record<string, unknown>,
    audit: { kind: CandidateChange['kind']; by: string; byId?: string; reason?: string }
  ): Promise<{ candidate: Candidate; changedFields: string[] }> {
    return withTransaction(async tx => {
      const current = await getRow<Candidate>(TABLES.candidates, this.tenantId, id, tx, true);
      if (!current) throw new NotFoundError('Candidato não encontrado');
      const before = current as unknown as Record<string, unknown>;
      const norm = (v: unknown) => JSON.stringify(v === undefined || v === '' ? null : v);
      const changedFields = Object.keys(patch).filter(k => norm(before[k]) !== norm(patch[k]));
      if (changedFields.length === 0) return { candidate: current, changedFields };

      const candidate = (await this.candidates.update(id, Object.fromEntries(changedFields.map(k => [k, patch[k]])), tx))!;
      for (const field of changedFields) {
        await this.candidateChanges.insert({
          id: newId('chg'),
          candidateId: id,
          field,
          oldValue: before[field] ?? null,
          newValue: patch[field] ?? null,
          kind: audit.kind,
          reason: audit.reason,
          changedBy: audit.by,
          changedById: audit.byId
        }, tx);
      }
      return { candidate, changedFields };
    });
  }

  async listCandidateChanges(candidateId: string): Promise<CandidateChange[]> {
    const { rows } = await getPool().query(
      `select tenant_id, id, candidate_id, field, old_value, new_value, kind, reason, changed_by, changed_by_id, changed_at
         from public.candidate_changes where tenant_id = $1 and candidate_id = $2 order by seq desc`,
      [this.tenantId, candidateId]
    );
    return rows.map(r => fromRow<CandidateChange>({}, r));
  }

  // ---- Selection pipeline ---------------------------------------------
  /** Creates an application placed on the first stage of the opening. */
  async createApplication(
    candidateId: string,
    jobOpeningId: string,
    id: string,
    db?: PoolClient
  ): Promise<SelectionApplication> {
    const run = db ? <T,>(fn: (tx: PoolClient) => Promise<T>) => fn(db) : withTransaction;
    return run(async tx => {
      const job = await this.openings.get(jobOpeningId, tx);
      if (!job) throw new NotFoundError('Vaga não encontrada neste tenant.');
      const firstStage = [...(job.stages ?? [])].sort((a, b) => a.order - b.order)[0];
      if (!firstStage) throw new Error('A vaga não possui etapas configuradas.');
      return this.applications.insert(
        { id, jobOpeningId, candidateId, currentStageId: firstStage.id, notes: ['Inscrito no processo seletivo.'] },
        tx
      );
    });
  }

  async moveApplication(
    id: string,
    patch: { stageId?: string; status?: SelectionApplication['status']; note?: string }
  ): Promise<SelectionApplication> {
    return withTransaction(async tx => {
      const current = await getRow<SelectionApplication>(TABLES.applications, this.tenantId, id, tx, true);
      if (!current) throw new NotFoundError('Inscrição não encontrada');
      if (patch.stageId) {
        const job = await this.openings.get(current.jobOpeningId, tx);
        if (!job?.stages.some(s => s.id === patch.stageId)) {
          throw new ValidationError('Etapa inválida para esta vaga.');
        }
      }
      const notes = patch.note
        ? [...current.notes, `[${new Date().toLocaleDateString('pt-BR')}] ${patch.note}`]
        : undefined;
      return (await this.applications.update(id, { currentStageId: patch.stageId, status: patch.status, notes }, tx))!;
    });
  }

  async listApplicationsForJob(jobOpeningId: string, db: Queryable = getPool()): Promise<SelectionApplication[]> {
    const { rows } = await db.query(
      'select * from public.selection_applications where tenant_id = $1 and job_opening_id = $2 order by seq asc',
      [this.tenantId, jobOpeningId]
    );
    return rows.map(r => fromRow<SelectionApplication>({}, r));
  }

  async listOpeningsByIds(ids: readonly string[], db: Queryable = getPool()): Promise<JobOpening[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    const { rows } = await db.query(
      'select * from public.job_openings where tenant_id = $1 and id = any($2::text[]) order by seq asc',
      [this.tenantId, unique]
    );
    return rows.map(r => fromRow<JobOpening>({}, r));
  }

  async listCandidatesByIds(ids: readonly string[], db: Queryable = getPool()): Promise<Candidate[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    const { rows } = await db.query(
      'select * from public.candidates where tenant_id = $1 and id = any($2::text[]) order by seq asc',
      [this.tenantId, unique]
    );
    return rows.map(r => fromRow<Candidate>({}, r));
  }

  async listApplicationsForCandidates(candidateIds: readonly string[], db: Queryable = getPool()): Promise<SelectionApplication[]> {
    const unique = [...new Set(candidateIds.filter(Boolean))];
    if (unique.length === 0) return [];
    const { rows } = await db.query(
      'select * from public.selection_applications where tenant_id = $1 and candidate_id = any($2::text[]) order by applied_at desc',
      [this.tenantId, unique]
    );
    return rows.map(r => fromRow<SelectionApplication>({}, r));
  }

  async listApplicationsForCandidate(candidateId: string, db: Queryable = getPool()): Promise<SelectionApplication[]> {
    const { rows } = await db.query(
      'select * from public.selection_applications where tenant_id = $1 and candidate_id = $2 order by applied_at desc',
      [this.tenantId, candidateId]
    );
    return rows.map(r => fromRow<SelectionApplication>({}, r));
  }

  async getCandidatesPage(opts: { search?: string; includeArchived?: boolean; page?: number; pageSize?: number }, db: Queryable = getPool()) {
    const page = Math.max(1, Math.floor(opts.page || 1));
    const pageSize = Math.min(120, Math.max(1, Math.floor(opts.pageSize || 48)));
    const where = ['tenant_id = $1'];
    const params: unknown[] = [this.tenantId];
    if (!opts.includeArchived) where.push('archived = false');
    const search = (opts.search ?? '').trim().toLowerCase();
    if (search) {
      params.push(`%${search}%`);
      const p = `$${params.length}`;
      where.push(`(lower(name) like ${p} or lower("current_role") like ${p} or lower(email) like ${p} or exists (select 1 from unnest(skills) as skill(skill_name) where lower(skill_name) like ${p}))`);
    }
    const whereSql = where.join(' and ');
    const { rows } = await db.query(
      `select *, count(*) over ()::int as total_rows from public.candidates where ${whereSql} order by registered_at desc, seq desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    return {
      items: rows.map(({ total_rows: _total, ...row }) => fromRow<Candidate>({}, row)),
      total: Number(rows[0]?.total_rows ?? 0),
      page,
      pageSize
    };
  }

  // ---- AI evaluations ---------------------------------------------------
  /**
   * Stores an evaluation and links it to the matching application (atomic). `db`, when given, reuses an already-open
   * transaction (e.g. the resume-screening materialization) instead of opening a second one: a nested `withTransaction`
   * would commit this insert on its own connection even if the OUTER transaction later rolled back, orphaning the row.
   */
  async saveAIEvaluation(evaluation: AIAssistedEvaluation, db?: PoolClient): Promise<AIAssistedEvaluation> {
    const run = db ? <T,>(fn: (tx: PoolClient) => Promise<T>) => fn(db) : withTransaction;
    return run(async tx => {
      const saved = await this.aiEvaluations.insert({ ...evaluation }, tx);
      await tx.query(
        `update public.selection_applications
            set ai_evaluation_id = $3,
                notes = array_append(notes, $4)
          where tenant_id = $1 and candidate_id = $2 and job_opening_id = $5`,
        [
          this.tenantId, evaluation.candidateId, saved.id,
          `[IA Apoio] Avaliação assistida concluída: Fit Geral ${saved.overallFitScore}%.`,
          evaluation.jobOpeningId
        ]
      );
      return saved;
    });
  }

  async listAIEvaluationsForJob(jobOpeningId: string, db: Queryable = getPool()): Promise<AIAssistedEvaluation[]> {
    const { rows } = await db.query(
      'select * from public.ai_evaluations where tenant_id = $1 and job_opening_id = $2 order by seq desc',
      [this.tenantId, jobOpeningId]
    );
    return rows.map(r => fromRow<AIAssistedEvaluation>({}, r));
  }

  async listInterviewsForJob(jobOpeningId: string, db: Queryable = getPool()): Promise<InterviewSession[]> {
    const { rows } = await db.query(
      'select * from public.interview_sessions where tenant_id = $1 and job_opening_id = $2 order by scheduled_for asc',
      [this.tenantId, jobOpeningId]
    );
    return rows.map(r => fromRow<InterviewSession>({}, r));
  }

  async getInterviewsPage(opts: { page?: number; pageSize?: number; status?: string }, db: Queryable = getPool()) {
    const page = Math.max(1, Math.floor(opts.page || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize || 25)));
    const where = ['tenant_id = $1'];
    const params: unknown[] = [this.tenantId];
    if (opts.status && ['scheduled', 'completed', 'cancelled', 'no_show'].includes(opts.status)) {
      params.push(opts.status);
      where.push(`status = $${params.length}`);
    }
    const whereSql = where.join(' and ');
    const count = await db.query(`select count(*)::int as total from public.interview_sessions where ${whereSql}`, params);
    const { rows } = await db.query(
      `select * from public.interview_sessions where ${whereSql} order by scheduled_for desc, seq desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    return { items: rows.map(r => fromRow<InterviewSession>({}, r)), total: Number(count.rows[0]?.total ?? 0), page, pageSize };
  }

  async listAIEvaluationsForCandidates(candidateIds: readonly string[], db: Queryable = getPool()): Promise<AIAssistedEvaluation[]> {
    const unique = [...new Set(candidateIds.filter(Boolean))];
    if (unique.length === 0) return [];
    const { rows } = await db.query(
      'select * from public.ai_evaluations where tenant_id = $1 and candidate_id = any($2::text[]) order by seq desc',
      [this.tenantId, unique]
    );
    return rows.map(r => fromRow<AIAssistedEvaluation>({}, r));
  }

  async aiGovernanceSummary(db: Queryable = getPool()): Promise<{ reviewed: number; overruled: number }> {
    const { rows } = await db.query(
      `select
         count(*) filter (where human_reviewer_decision is not null)::int as reviewed,
         count(*) filter (where human_reviewer_decision = 'OVERRIDDEN')::int as overruled
       from public.ai_evaluations
       where tenant_id = $1`,
      [this.tenantId]
    );
    return { reviewed: Number(rows[0]?.reviewed ?? 0), overruled: Number(rows[0]?.overruled ?? 0) };
  }

  // ---- Resume screening ---------------------------------------------------------
  /** Every currículo sent for a vaga, most recent first. */
  async listScreeningsForJob(jobOpeningId: string, db: Queryable = getPool()): Promise<ResumeScreening[]> {
    const { rows } = await db.query(
      'select * from public.resume_screenings where tenant_id = $1 and job_opening_id = $2 order by seq desc',
      [this.tenantId, jobOpeningId]
    );
    return rows.map(r => fromRow<ResumeScreening>({}, r));
  }

  async listQueuedScreeningIds(limit: number): Promise<string[]> {
    const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
    const { rows } = await getPool().query(
      `select id
         from public.resume_screenings
        where tenant_id = $1
          and ((status = 'uploaded') or (status = 'failed' and attempts < $2)
               or (status = 'analyzing' and analyzing_since < now() - interval '90 seconds'))
        order by seq asc
        limit $3`,
      [this.tenantId, MAX_AUTO_ATTEMPTS, safeLimit]
    );
    return rows.map(row => String(row.id));
  }

  async screeningUploadStatsForJob(jobOpeningId: string, contentHash: string, db: Queryable = getPool()): Promise<{ total: number; duplicate: boolean }> {
    const { rows } = await db.query(
      `select count(*)::int as total,
              coalesce(bool_or(content_hash = $3), false) as duplicate
         from public.resume_screenings
        where tenant_id = $1 and job_opening_id = $2`,
      [this.tenantId, jobOpeningId, contentHash]
    );
    return { total: Number(rows[0]?.total ?? 0), duplicate: rows[0]?.duplicate === true };
  }

  /**
   * Atomic claim before calling the AI: only a file that is `uploaded`/`needs_data`/`failed`, or `analyzing` past its
   * lease (the serverless function that was reading it died), can be claimed. Two simultaneous requests for the same
   * file never both call the AI (avoids double billing); the loser gets `undefined` and the route answers 409.
   */
  async claimScreening(id: string, opts: { force?: boolean } = {}): Promise<ResumeScreening | undefined> {
    const claimable = opts.force
      ? ['uploaded', 'analyzing', 'analyzed', 'needs_data', 'failed']
      : ['uploaded', 'needs_data', 'failed'];
    const leaseSeconds = Math.ceil(ANALYSIS_LEASE_MS / 1000);
    const { rows } = await getPool().query(
      `update public.resume_screenings
          set status = 'analyzing', analyzing_since = now(), attempts = attempts + 1
        where tenant_id = $1 and id = $2
          and (status = any($3::text[]) or (status = 'analyzing' and analyzing_since < now() - make_interval(secs => $4)))
        returning *`,
      [this.tenantId, id, claimable, leaseSeconds]
    );
    return rows[0] ? fromRow<ResumeScreening>({}, rows[0]) : undefined;
  }

  /** A claimed file whose AI call itself failed (network, timeout, bad response): released back to `failed`, never billed as read. */
  async releaseScreeningAsFailed(id: string, failureMessage: string): Promise<ResumeScreening | undefined> {
    return this.resumeScreenings.update(id, { status: 'failed', failureCode: 'ai_error', failureMessage, analyzingSince: null });
  }

  /**
   * The AI already read the file (`analysis`); this turns that reading into the usual records — a candidate (only if
   * one doesn't already exist for that e-mail), a candidatura on the vaga's first stage, and a normal `ai_evaluations`
   * row — all in ONE transaction, so a failure partway never leaves an orphaned candidate or evaluation. When the
   * currículo has no e-mail, no name, a name that does not match an existing candidate of that e-mail, or that
   * candidate is archived, nothing is created: the file stays `needs_data` with a plain-language reason, and a person
   * decides (via `POST .../complete` or by reactivating the profile) before anything is written.
   */
  async completeScreeningAnalysis(
    id: string,
    analysis: ResumeAnalysis,
    usage: { model: string; inputTokens: number; outputTokens: number }
  ): Promise<ScreeningMaterializeResult> {
    return withTransaction(async tx => {
      const row = await getRow<ResumeScreening>(TABLES.resumeScreenings, this.tenantId, id, tx, true);
      if (!row) throw new NotFoundError('Arquivo de currículo não encontrado.');

      const summary = summaryOf(analysis);
      const base = {
        summary, analysis, model: usage.model, promptVersion: analysis.promptVersion, criteriaHash: analysis.criteriaHash,
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, analyzedAt: new Date().toISOString()
      };
      const needsData = async (failureCode: string, failureMessage: string) => ({
        screening: (await this.resumeScreenings.update(id, { ...base, status: 'needs_data', failureCode, failureMessage }, tx))!
      });

      const { name, email } = analysis.extraction;
      if (!email) return needsData('missing_email', 'O currículo não trouxe um e-mail para identificar o candidato. Complete os dados para continuar.');
      if (!name) return needsData('missing_name', 'O currículo não trouxe um nome legível. Complete os dados para continuar.');

      // Trava por e-mail: dois currículos da mesma pessoa analisados ao mesmo tempo (em vagas diferentes ou repetidos)
      // não criam dois candidatos — o e-mail não é uma chave única no banco.
      await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`candidate-email:${this.tenantId}:${email.toLowerCase()}`]);
      const found = await tx.query(
        'select id, name, archived from public.candidates where tenant_id = $1 and lower(email) = $2 limit 1',
        [this.tenantId, email.toLowerCase()]
      );
      const existing = found.rows[0] as { id: string; name: string; archived: boolean } | undefined;

      if (existing && !namesCompatible(name, existing.name)) {
        return needsData(
          'name_mismatch',
          `Já existe um candidato com este e-mail (${existing.name}), mas o nome do currículo é bem diferente (${name}). Confirme antes de continuar.`
        );
      }
      if (existing?.archived) {
        return needsData('candidate_archived', `Já existe um perfil arquivado para ${existing.name}. Reative o perfil no Banco de Talentos antes de continuar.`);
      }

      const candidate = existing
        ? (await this.candidates.get(existing.id, tx))!
        : await this.candidates.insert(
            { id: newId('cand'), ...candidateFromAnalysis(analysis.extraction), registeredAt: new Date().toISOString() },
            tx
          );

      const dup = await tx.query(
        'select id from public.selection_applications where tenant_id = $1 and job_opening_id = $2 and candidate_id = $3',
        [this.tenantId, row.jobOpeningId, candidate.id]
      );
      const application = dup.rows[0]
        ? (await getRow<SelectionApplication>(TABLES.applications, this.tenantId, dup.rows[0].id, tx))!
        : await this.createApplication(candidate.id, row.jobOpeningId, newId('app'), tx);

      const evaluation = await this.saveAIEvaluation(
        {
          id: newId('eval'),
          candidateId: candidate.id,
          jobOpeningId: row.jobOpeningId,
          evaluatedAt: new Date().toISOString(),
          source: 'gemini',
          overallFitScore: analysis.overallScore,
          technicalFitScore: analysis.technicalScore,
          // O NOT NULL da coluna exige um número mesmo sem cultura verificável; 50 é neutro (a IA já é instruída a dar 50 a pilar sem evidência).
          culturalFitScore: analysis.culturalScore ?? 50,
          detailedExplanation: analysis.explanation,
          keyStrengths: analysis.strengths,
          potentialGaps: analysis.gaps,
          suggestedInterviewQuestions: analysis.interviewQuestions,
          pillarScores: analysis.pillars.map(p => ({ pillarName: p.name, score: p.score, analysis: p.analysis }))
        },
        tx
      );

      const updated = (await this.resumeScreenings.update(
        id,
        { ...base, status: 'analyzed', candidateId: candidate.id, applicationId: application.id, evaluationId: evaluation.id },
        tx
      ))!;

      return { screening: updated, candidate, application, evaluation };
    });
  }

  // ---- Offers -> hire ---------------------------------------------------------
  /**
   * Updates an offer's status. Accepting it is the hire: it opens the onboarding journey,
   * marks the application as hired and counts the seat as filled — all in one transaction.
   */
  async setOfferStatus(id: string, status: JobOffer['status'], notes?: string): Promise<JobOffer> {
    return withTransaction(async tx => {
      const now = new Date().toISOString();
      const current = await this.offers.get(id, tx);
      if (!current) throw new NotFoundError('Proposta não encontrada');
      const offer = (await this.offers.update(id, {
        status,
        notes,
        sentAt: status === 'sent' ? now : undefined,
        respondedAt: status === 'accepted' || status === 'declined' ? now : undefined
      }, tx))!;
      if (status === 'accepted') await this.registerHire(offer, tx);
      return offer;
    });
  }

  /** Attaches a document to an offer. Read-modify-write with the row locked, so two simultaneous uploads never overwrite each other. */
  async addOfferDocument(offerId: string, document: OfferDocument): Promise<JobOffer> {
    return withTransaction(async tx => {
      const offer = await getRow<JobOffer>(TABLES.offers, this.tenantId, offerId, tx, true);
      if (!offer) throw new NotFoundError('Proposta não encontrada');
      const documents = offer.documents ?? [];
      if (documents.length >= MAX_OFFER_DOCUMENTS) {
        throw new ValidationError(`Esta proposta já tem o máximo de ${MAX_OFFER_DOCUMENTS} documentos. Remova algum antes de anexar outro.`);
      }
      return (await this.offers.update(offerId, { documents: [...documents, document] }, tx))!;
    });
  }

  /** Detaches a document; the caller deletes the stored file afterwards (only once this has committed). */
  async removeOfferDocument(offerId: string, documentId: string): Promise<{ offer: JobOffer; removed: OfferDocument }> {
    return withTransaction(async tx => {
      const offer = await getRow<JobOffer>(TABLES.offers, this.tenantId, offerId, tx, true);
      if (!offer) throw new NotFoundError('Proposta não encontrada');
      const removed = (offer.documents ?? []).find(d => d.id === documentId);
      if (!removed) throw new NotFoundError('Documento não encontrado');
      const updated = await this.offers.update(offerId, { documents: (offer.documents ?? []).filter(d => d.id !== documentId) }, tx);
      return { offer: updated!, removed };
    });
  }

  /** Reconciles accepted offers that never got an onboarding journey (accepted before this flow existed). */
  async syncAcceptedOffers(): Promise<void> {
    await withTransaction(async tx => {
      const [offers, journeys] = await Promise.all([this.offers.list(tx), this.onboardings.list(tx)]);
      const started = new Set(journeys.map(j => j.candidateId));
      for (const offer of offers) {
        if (offer.status === 'accepted' && !started.has(offer.candidateId)) await this.registerHire(offer, tx);
      }

      // Older accepted offers may already have an onboarding journey, so registerHire
      // correctly skips them. Reconcile the vacancy counters independently as well.
      const acceptedByOpening = new Map<string, Set<string>>();
      for (const offer of offers) {
        if (offer.status !== 'accepted') continue;
        const candidates = acceptedByOpening.get(offer.jobOpeningId) ?? new Set<string>();
        candidates.add(offer.candidateId);
        acceptedByOpening.set(offer.jobOpeningId, candidates);
      }
      for (const job of await this.openings.list(tx)) {
        const acceptedCount = acceptedByOpening.get(job.id)?.size ?? 0;
        const filledCount = Math.max(job.filledCount, acceptedCount);
        const nextStatus = filledCount >= job.openingsCount ? 'filled' : job.status;
        if (filledCount !== job.filledCount || nextStatus !== job.status) {
          await this.openings.update(job.id, { filledCount, status: nextStatus }, tx);
        }
      }
    });
  }

  /** Idempotent: the existing journey of the candidate is the guard, so a hire is never counted twice. */
  private async registerHire(offer: JobOffer, tx: PoolClient): Promise<void> {
    const journeys = await this.onboardings.list(tx);
    if (journeys.some(j => j.candidateId === offer.candidateId)) return;

    const [candidate, job] = await Promise.all([
      this.candidates.get(offer.candidateId, tx),
      this.openings.get(offer.jobOpeningId, tx)
    ]);
    const position = job?.positionId ? await this.positions.get(job.positionId, tx) : undefined;
    const started = offer.startDate <= new Date().toISOString().split('T')[0];
    const onboardingId = `onb-${offer.id}`;
    const developmentId = `dev-${offer.id}`;
    const hasDevelopment = (await this.development.list(tx)).some(r => r.collaboratorId === offer.candidateId);
    const employee = await this.ensureEmployeeForHire(offer, candidate, job, position, { onboardingId, developmentId: hasDevelopment ? undefined : developmentId }, tx);

    await this.onboardings.insert({
      id: onboardingId,
      employeeId: employee.id,
      candidateId: offer.candidateId,
      candidateName: candidate?.name ?? 'Candidato',
      jobTitle: position?.title ?? job?.title ?? 'Cargo a definir',
      departmentId: job?.departmentId,
      mentorId: job?.hiringManagerId,
      hireDate: offer.startDate,
      status: started ? 'in_progress' : 'preparing',
      checklists: buildChecklistItems(await this.ensureIntegrationTemplates(tx)),
      admission: buildAdmissionItems(await this.ensureAdmissionTemplates(tx), offer.contractType, offer.startDate),
      milestones30DaysDone: false,
      milestones60DaysDone: false,
      milestones90DaysDone: false,
      notes: `Jornada aberta automaticamente ap�s o aceite da proposta (${offer.contractType}).`
    }, tx);

    // Development: the hire gets an empty PDI, so goals and 1:1s can start as soon as the person joins.
    if (!hasDevelopment) {
      await this.development.insert({
        id: developmentId,
        employeeId: employee.id,
        collaboratorId: offer.candidateId,
        collaboratorName: candidate?.name ?? 'Candidato',
        jobTitle: position?.title ?? job?.title ?? 'Cargo a definir',
        positionId: position?.id,
        departmentId: job?.departmentId,
        managerId: job?.hiringManagerId,
        hireDate: offer.startDate,
        goals: [],
        oneOnOnes: [],
        lastReviewDate: '',
        nextReviewDate: ''
      }, tx);
    }
    // Selection pipeline: the candidate's application ends on the last stage of its own funnel.
    // No stage template in this codebase actually has type 'hired' (the 5-stage default ends in 'proposal'), so
    // looking for one always failed silently: the application kept its `status` correctly as 'hired', but
    // `currentStageId` never moved — the Kanban card stayed stuck wherever the person was when the offer was
    // accepted (e.g. still in a technical-assessment column). Falling back to the funnel's own last stage by
    // `order` always resolves to a real stage, so the card reaches the end of the board it belongs to.
    const allApplications = await this.applications.list(tx);
    const application = allApplications.find(a => a.candidateId === offer.candidateId && a.jobOpeningId === offer.jobOpeningId);
    if (application && application.status !== 'hired') {
      const lastStage = job?.stages.length ? [...job.stages].sort((a, b) => b.order - a.order)[0] : undefined;
      await this.applications.update(application.id, {
        status: 'hired',
        currentStageId: lastStage?.id ?? application.currentStageId,
        notes: [...application.notes, `[${new Date().toLocaleDateString('pt-BR')}] Proposta aceita — candidato contratado.`]
      }, tx);
    }

    // The person is no longer available: any other active candidatura of theirs (to a different vaga) is closed,
    // instead of being left open forever as if they were still being considered elsewhere.
    const others = allApplications.filter(
      a => a.candidateId === offer.candidateId && a.jobOpeningId !== offer.jobOpeningId
        && a.status !== 'hired' && a.status !== 'rejected'
    );
    for (const other of others) {
      await this.applications.update(other.id, {
        status: 'rejected',
        notes: [
          ...other.notes,
          `[${new Date().toLocaleDateString('pt-BR')}] Candidatura arquivada automaticamente: ${candidate?.name ?? 'a pessoa'} foi contratada para outra vaga (${job?.title ?? offer.jobOpeningId}).`
        ]
      }, tx);
    }

    // Opening: one more seat filled; the opening closes when all seats are taken.
    if (job) {
      const filledCount = job.filledCount + 1;
      await this.openings.update(job.id, {
        filledCount,
        status: filledCount >= job.openingsCount ? 'filled' : job.status
      }, tx);
    }
  }

  // ---- Integration checklist (catalog + per-hire items inside the onboarding journey) ----
  /** The catalog is created once per organization from the starter set (never re-created if RH deactivates items). */
  async ensureIntegrationTemplates(db: Queryable = getPool()): Promise<IntegrationTemplate[]> {
    const existing = await this.integrationTemplates.list(db);
    if (existing.length > 0) return existing;
    const created: IntegrationTemplate[] = [];
    for (const def of DEFAULT_INTEGRATION_TEMPLATES) {
      created.push(await this.integrationTemplates.insert({ id: newId('igt'), active: true, ...def }, db));
    }
    return created;
  }

  /** Active catalog items not yet in the journey (matched by origin or, for older journeys, by the same title). */
  private async availableChecklistTemplates(journey: OnboardingJourney, db: Queryable): Promise<IntegrationTemplate[]> {
    const ids = new Set(journey.checklists.map(c => c.templateId).filter((id): id is string => !!id));
    const titles = new Set(journey.checklists.map(c => c.title.trim().toLowerCase()));
    return (await this.ensureIntegrationTemplates(db)).filter(
      t => t.active && !ids.has(t.id) && !titles.has(t.name.trim().toLowerCase())
    );
  }

  async listAvailableChecklistTemplates(journeyId: string): Promise<IntegrationTemplate[]> {
    const journey = await this.onboardings.get(journeyId);
    if (!journey) throw new NotFoundError('Jornada de onboarding não encontrada');
    return this.availableChecklistTemplates(journey, getPool());
  }

  /** Adds ONLY the chosen catalog items to this hire's checklist. */
  async applyChecklistTemplates(journeyId: string, templateIds: string[]): Promise<OnboardingJourney> {
    if (templateIds.length === 0) throw new ValidationError('Selecione ao menos um item do modelo.');
    return withTransaction(async tx => {
      const journey = await getRow<OnboardingJourney>(TABLES.onboardings, this.tenantId, journeyId, tx, true);
      if (!journey) throw new NotFoundError('Jornada de onboarding não encontrada');
      const chosen = (await this.availableChecklistTemplates(journey, tx)).filter(t => templateIds.includes(t.id));
      if (chosen.length === 0) throw new ValidationError('Os itens escolhidos não estão mais disponíveis para esta contratação.');
      const checklists = [...journey.checklists, ...buildChecklistItems(chosen)].sort((a, b) => a.dueDateDay - b.dueDateDay);
      return (await this.onboardings.update(journeyId, { checklists }, tx))!;
    });
  }

  async addChecklistItem(journeyId: string, item: OnboardingChecklistItem): Promise<OnboardingJourney> {
    return withTransaction(async tx => {
      const journey = await getRow<OnboardingJourney>(TABLES.onboardings, this.tenantId, journeyId, tx, true);
      if (!journey) throw new NotFoundError('Jornada de onboarding não encontrada');
      const checklists = [...journey.checklists, item].sort((a, b) => a.dueDateDay - b.dueDateDay);
      return (await this.onboardings.update(journeyId, { checklists }, tx))!;
    });
  }

  /** Only an item nobody started can be removed, so progress is never erased by accident. */
  async removeChecklistItem(journeyId: string, itemId: string): Promise<OnboardingJourney> {
    return withTransaction(async tx => {
      const journey = await getRow<OnboardingJourney>(TABLES.onboardings, this.tenantId, journeyId, tx, true);
      if (!journey) throw new NotFoundError('Jornada de onboarding não encontrada');
      const item = journey.checklists.find(c => c.id === itemId);
      if (!item) throw new NotFoundError('Item de checklist não encontrado');
      if (item.status !== 'pending') throw new ValidationError('Só é possível remover um item pendente. Desmarque o item antes.');
      return (await this.onboardings.update(journeyId, { checklists: journey.checklists.filter(c => c.id !== itemId) }, tx))!;
    });
  }

  // ---- Admission (catalog + per-hire folder inside the onboarding journey) -----
  /** The catalog is created once per organization from the starter set (never re-created if RH deactivates items). */
  async ensureAdmissionTemplates(db: Queryable = getPool()): Promise<AdmissionTemplate[]> {
    const existing = await this.admissionTemplates.list(db);
    if (existing.length > 0) return existing;
    const created: AdmissionTemplate[] = [];
    for (const def of DEFAULT_ADMISSION_TEMPLATES) {
      created.push(await this.admissionTemplates.insert({ id: newId('adt'), active: true, ...def }, db));
    }
    return created;
  }

  /** Catalog items that apply to the hire's contract type and are not in the folder yet. */
  private async availableTemplates(journey: OnboardingJourney, db: Queryable): Promise<{ templates: AdmissionTemplate[]; contractType: JobOffer['contractType'] }> {
    const offers = await this.offers.list(db);
    const contractType = offers.find(o => o.candidateId === journey.candidateId && o.status === 'accepted')?.contractType ?? 'CLT';
    const present = new Set(journey.admission.map(i => i.templateId).filter((id): id is string => !!id));
    const templates = (await this.ensureAdmissionTemplates(db)).filter(
      t => t.active && t.contractTypes.includes(contractType) && !present.has(t.id)
    );
    return { templates, contractType };
  }

  async listAvailableAdmissionTemplates(journeyId: string): Promise<AdmissionTemplate[]> {
    const journey = await this.onboardings.get(journeyId);
    if (!journey) throw new NotFoundError('Jornada de onboarding não encontrada');
    return (await this.availableTemplates(journey, getPool())).templates;
  }

  /** Adds to the folder ONLY the chosen catalog items (the RH picks according to the position). */
  async applyAdmissionTemplates(journeyId: string, templateIds: string[]): Promise<OnboardingJourney> {
    if (templateIds.length === 0) throw new ValidationError('Selecione ao menos um item do modelo.');
    return withTransaction(async tx => {
      const journey = await getRow<OnboardingJourney>(TABLES.onboardings, this.tenantId, journeyId, tx, true);
      if (!journey) throw new NotFoundError('Jornada de onboarding não encontrada');
      const { templates, contractType } = await this.availableTemplates(journey, tx);
      const chosen = templates.filter(t => templateIds.includes(t.id));
      if (chosen.length === 0) throw new ValidationError('Os itens escolhidos não estão mais disponíveis para esta contratação.');
      const added = buildAdmissionItems(chosen, contractType, journey.hireDate);
      return (await this.onboardings.update(journeyId, { admission: [...journey.admission, ...added] }, tx))!;
    });
  }

  /** Only an item nobody has worked on can be removed: a document already sent is never discarded silently. */
  async removeAdmissionItem(journeyId: string, itemId: string): Promise<OnboardingJourney> {
    return withTransaction(async tx => {
      const journey = await getRow<OnboardingJourney>(TABLES.onboardings, this.tenantId, journeyId, tx, true);
      if (!journey) throw new NotFoundError('Jornada de onboarding não encontrada');
      const item = journey.admission.find(i => i.id === itemId);
      if (!item) throw new NotFoundError('Item de admissão não encontrado');
      if (item.file || item.status !== 'pending') {
        throw new ValidationError('Só é possível remover um item pendente e sem arquivo. Reabra ou trate o item antes.');
      }
      return (await this.onboardings.update(journeyId, { admission: journey.admission.filter(i => i.id !== itemId) }, tx))!;
    });
  }

  async addAdmissionItem(journeyId: string, item: AdmissionItem): Promise<OnboardingJourney> {
    return withTransaction(async tx => {
      const journey = await getRow<OnboardingJourney>(TABLES.onboardings, this.tenantId, journeyId, tx, true);
      if (!journey) throw new NotFoundError('Jornada de onboarding não encontrada');
      return (await this.onboardings.update(journeyId, { admission: [...journey.admission, item] }, tx))!;
    });
  }

  /** Read-modify-write of one admission item with the journey row locked; `mutate` may throw to abort. */
  async updateAdmissionItem(
    journeyId: string,
    itemId: string,
    mutate: (item: AdmissionItem) => void
  ): Promise<OnboardingJourney> {
    return withTransaction(async tx => {
      const journey = await getRow<OnboardingJourney>(TABLES.onboardings, this.tenantId, journeyId, tx, true);
      if (!journey) throw new NotFoundError('Jornada de onboarding não encontrada');
      const item = journey.admission.find(i => i.id === itemId);
      if (!item) throw new NotFoundError('Item de admissão não encontrado');
      mutate(item);
      return (await this.onboardings.update(journeyId, { admission: journey.admission }, tx))!;
    });
  }

  // ---- Onboarding / development (jsonb read-modify-write, row locked) --------
  async setChecklistStatus(journeyId: string, itemId: string, status: string): Promise<OnboardingJourney> {
    return withTransaction(async tx => {
      const journey = await getRow<OnboardingJourney>(TABLES.onboardings, this.tenantId, journeyId, tx, true);
      if (!journey) throw new NotFoundError('Jornada de onboarding não encontrada');
      const item = journey.checklists.find(c => c.id === itemId);
      if (!item) throw new NotFoundError('Item de checklist não encontrado');
      item.status = status as typeof item.status;
      return (await this.onboardings.update(journeyId, { checklists: journey.checklists }, tx))!;
    });
  }

  // ---- Development (PDI + 1:1s): one record per collaborator, goals and meetings live in jsonb -------------
  /**
   * Read-modify-write of one PDI record with its row locked; `change` returns the patch to store and may throw to abort.
   * The next 1:1 is kept in the Agenda in the same transaction (see `syncNextMeeting`).
   */
  async changeDevelopment(
    recordId: string,
    change: (record: CollaboratorDevelopment) => Partial<CollaboratorDevelopment>,
    schedule: NextMeetingRequest = {}
  ): Promise<CollaboratorDevelopment> {
    return withTransaction(async tx => {
      const before = await getRow<CollaboratorDevelopment>(TABLES.development, this.tenantId, recordId, tx, true);
      if (!before) throw new NotFoundError('Registro de PDI não encontrado');
      const after = (await this.development.update(recordId, change(before), tx))!;
      await this.syncNextMeeting(before, after, schedule, tx);
      return after;
    });
  }

  /** One PDI per collaborator. The advisory lock makes two simultaneous requests for the same person create a single record. */
  async createDevelopmentRecord(
    collaboratorId: string,
    fields: Record<string, unknown>,
    schedule: NextMeetingRequest = {}
  ): Promise<CollaboratorDevelopment> {
    return withTransaction(async tx => {
      await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`development:${this.tenantId}:${collaboratorId}`]);
      if ((await this.development.list(tx)).some(r => r.collaboratorId === collaboratorId)) {
        throw new ConflictError('Este colaborador já tem um PDI.');
      }
      const created = await this.development.insert(
        { id: newId('dev'), collaboratorId, goals: [], oneOnOnes: [], lastReviewDate: '', nextReviewDate: '', ...fields },
        tx
      );
      await this.syncNextMeeting(undefined, created, schedule, tx);
      return created;
    });
  }

  async deleteDevelopmentRecord(recordId: string): Promise<void> {
    await withTransaction(async tx => {
      const record = await getRow<CollaboratorDevelopment>(TABLES.development, this.tenantId, recordId, tx, true);
      if (!record) throw new NotFoundError('Registro de PDI não encontrado');
      assertRecordRemovable(record);
      await tx.query('delete from public.agenda_events where tenant_id = $1 and starts_with(id, $2)', [this.tenantId, meetingEventPrefix(recordId)]);
      await this.development.delete(recordId, tx);
    });
  }

  // ---- Next 1:1 <-> Agenda ----------------------------------------------------------------------------
  private async meetingEvents(where: string, params: unknown[], db: Queryable): Promise<AgendaEvent[]> {
    const cols = ['tenant_id', ...TABLES.agendaEvents.columns.map(c => `"${toSnake(c)}"`)].join(', ');
    const { rows } = await db.query(
      `select ${cols} from public.agenda_events where tenant_id = $1 and ${where} order by starts_at desc`,
      [this.tenantId, ...params]
    );
    return rows.map(r => fromRow<AgendaEvent>({}, r));
  }

  /** Every PDI's appointment still pending in the Agenda (at most one per PDI). */
  openNextMeetings(db: Queryable = getPool()): Promise<AgendaEvent[]> {
    return this.meetingEvents(`starts_with(id, $2) and status in ('scheduled', 'in_progress')`, [MEETING_ID_PREFIX], db);
  }

  async openNextMeeting(recordId: string, db: Queryable = getPool()): Promise<AgendaEvent | undefined> {
    return (await this.meetingEvents(`starts_with(id, $2) and status in ('scheduled', 'in_progress')`, [meetingEventPrefix(recordId)], db))[0];
  }

  /**
   * Keeps the Agenda in step with the PDI's `nextReviewDate`, inside the caller's transaction:
   * - a new date creates the appointment (30 min, manager + collaborator invited, agenda from open goals and pending actions);
   * - a new date/time moves it (and refreshes its agenda); a renamed collaborator or a new manager updates title/guests;
   * - a 1:1 registered on or after the scheduled date closes the appointment as "done", with the 1:1 text as its summary;
   * - clearing the date removes the pending appointment.
   * Unrelated edits never create an appointment (e.g. a stale date from before this feature).
   */
  private async syncNextMeeting(
    before: CollaboratorDevelopment | undefined,
    after: CollaboratorDevelopment,
    request: NextMeetingRequest,
    tx: PoolClient
  ): Promise<void> {
    let open: AgendaEvent | undefined = (await this.meetingEvents(`starts_with(id, $2) and status in ('scheduled', 'in_progress')`, [meetingEventPrefix(after.id)], tx))[0];

    if (open && before?.nextReviewDate && after.lastReviewDate >= before.nextReviewDate) {
      const latest = [...after.oneOnOnes].sort((a, b) => b.date.localeCompare(a.date))[0];
      await this.agendaEvents.update(open.id, { status: 'done', summary: latest?.keyTakeaways.slice(0, 1000) }, tx);
      open = undefined;
    }

    if (!after.nextReviewDate) {
      if (open) await this.agendaEvents.delete(open.id, tx);
      return;
    }

    const dateChanged = !before || before.nextReviewDate !== after.nextReviewDate;
    if (!open && !(dateChanged && request.actor)) return;

    const members = new Set((await this.users.list(tx)).map(u => u.id));
    const details = nextMeetingDetails(after, members, request.actor?.id);
    const startsAt = spInstant(after.nextReviewDate, request.time ?? (open ? spTime(open.startsAt) : DEFAULT_MEETING_TIME));
    const endsAt = new Date(new Date(startsAt).getTime() + MEETING_MINUTES * 60_000).toISOString();

    if (!open) {
      await this.agendaEvents.insert({
        id: newMeetingEventId(after.id), type: 'meeting', title: details.title, description: details.description, status: 'scheduled',
        startsAt, endsAt, agenda: details.agenda, assigneeIds: details.assigneeIds,
        createdById: request.actor!.id, createdByName: request.actor!.name
      }, tx);
      return;
    }

    const patch: Record<string, unknown> = {};
    if (open.startsAt !== startsAt) Object.assign(patch, { startsAt, endsAt, agenda: details.agenda });
    if (before && before.collaboratorName !== after.collaboratorName) patch.title = details.title;
    if (before && before.managerId !== after.managerId) {
      patch.assigneeIds = [...new Set([...open.assigneeIds.filter(id => id !== before.managerId), ...details.assigneeIds.filter(id => id === after.managerId)])];
    }
    if (Object.keys(patch).length > 0) await this.agendaEvents.update(open.id, patch, tx);
  }

  /**
   * The Agenda is edited on its own screen too. When the pending appointment of a PDI is moved, the PDI's next date follows;
   * when it is cancelled or deleted, the PDI's next date is cleared. Finished appointments never touch the PDI.
   */
  async syncDevelopmentFromEvent(event: AgendaEvent, removed: boolean): Promise<void> {
    if (!isMeetingEventId(event.id)) return;
    await withTransaction(async tx => {
      const record = await getRow<CollaboratorDevelopment>(TABLES.development, this.tenantId, recordIdOfMeetingEvent(event.id), tx, true);
      if (!record || event.status === 'done') return;
      const date = spDate(event.startsAt);
      if (removed || event.status === 'cancelled') {
        if (record.nextReviewDate === date) await this.development.update(record.id, { nextReviewDate: '' }, tx);
      } else if (record.nextReviewDate !== date) {
        await this.development.update(record.id, { nextReviewDate: date }, tx);
      }
    });
  }

  async developmentLookups(): Promise<DevelopmentLookups> {
    const [users, departments, positions] = await Promise.all([this.users.list(), this.departments.list(), this.positions.list()]);
    return {
      departments: departments.map(d => ({ id: d.id, name: d.name })),
      members: users.filter(u => u.active).map(u => ({ id: u.id, name: u.name, jobTitle: u.jobTitle })),
      positions: positions.filter(p => p.status === 'active').map(p => ({ id: p.id, title: p.title, departmentId: p.departmentId }))
    };
  }

  /** People who can still get a PDI: hires in onboarding first, then active members (nobody who already has one). */
  async developmentPeople(): Promise<DevelopmentPerson[]> {
    const [records, journeys, users] = await Promise.all([this.development.list(), this.onboardings.list(), this.users.list()]);
    const norm = (name: string) => name.trim().toLowerCase();
    const taken = new Set(records.map(r => r.collaboratorId));
    const names = new Set(records.map(r => norm(r.collaboratorName)));
    const people: DevelopmentPerson[] = [];
    const offer = (person: DevelopmentPerson) => {
      if (taken.has(person.id) || names.has(norm(person.name))) return;
      names.add(norm(person.name));
      people.push(person);
    };
    for (const j of journeys) {
      offer({ id: j.candidateId, name: j.candidateName, jobTitle: j.jobTitle, departmentId: j.departmentId, hireDate: j.hireDate, origin: 'hire' });
    }
    for (const u of users.filter(u => u.active)) {
      offer({ id: u.id, name: u.name, jobTitle: u.jobTitle, departmentId: u.departmentId, positionId: u.positionId, origin: 'member' });
    }
    return people;
  }

  // ---- Retention: turnover alerts ---------------------------------------------------------------------
  /** One ACTIVE alert per person (same id or same name): follow or close the existing one first. */
  private assertNoActiveAlert(alerts: TurnoverRiskAlert[], collaboratorId: string, name: string, exceptId?: string): void {
    const clash = alerts.find(a =>
      a.id !== exceptId && isActiveAlert(a.status) && (a.collaboratorId === collaboratorId || normName(a.collaboratorName) === normName(name))
    );
    if (clash) throw new ConflictError(`Já existe um alerta ativo para ${clash.collaboratorName}. Acompanhe ou encerre o alerta existente.`);
  }

  async createAlert(collaboratorId: string, fields: AlertPatch, by: string, byId?: string): Promise<TurnoverRiskAlert> {
    return withTransaction(async tx => {
      await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`alert:${this.tenantId}:${collaboratorId}`]);
      this.assertNoActiveAlert(await this.turnoverAlerts.list(tx), collaboratorId, String(fields.collaboratorName));
      return this.turnoverAlerts.insert(buildAlert(collaboratorId, fields, by, byId), tx);
    });
  }

  /** Read-modify-write of one alert with its row locked; `change` returns the patch (null clears a column) and may throw to abort. */
  async changeAlert(alertId: string, change: (alert: TurnoverRiskAlert) => AlertPatch): Promise<TurnoverRiskAlert> {
    return withTransaction(async tx => {
      const before = await getRow<TurnoverRiskAlert>(TABLES.turnoverAlerts, this.tenantId, alertId, tx, true);
      if (!before) throw new NotFoundError('Alerta não encontrado');
      const patch = change(before);
      if (typeof patch.status === 'string' && isActiveAlert(patch.status as TurnoverRiskAlert['status']) && !isActiveAlert(before.status)) {
        // reopening: the person must not have another active alert by now
        await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`alert:${this.tenantId}:${before.collaboratorId}`]);
        this.assertNoActiveAlert(await this.turnoverAlerts.list(tx), before.collaboratorId, before.collaboratorName, before.id);
      }
      return (await this.turnoverAlerts.update(alertId, patch, tx))!;
    });
  }

  /** `guard` may refuse (e.g. the alert is outside the viewer's team) before anything is deleted. */
  async deleteAlert(alertId: string, guard?: (alert: TurnoverRiskAlert) => void): Promise<void> {
    await withTransaction(async tx => {
      const alert = await getRow<TurnoverRiskAlert>(TABLES.turnoverAlerts, this.tenantId, alertId, tx, true);
      if (!alert) throw new NotFoundError('Alerta não encontrado');
      guard?.(alert);
      assertAlertRemovable(alert);
      await this.turnoverAlerts.delete(alertId, tx);
    });
  }

  /** Who reports to whom (PDI managers, department heads, members' departments): the base of the alert team scope. */
  async alertScopeData(): Promise<AlertScopeData> {
    const [records, departments, users] = await Promise.all([this.development.list(), this.departments.list(), this.users.list()]);
    return buildScopeData(records, departments, users);
  }

  /** Who an alert can still be opened for: PDI collaborators, hires in onboarding and active members (nobody with an active alert). */
  async retentionPeople(): Promise<RetentionPerson[]> {
    const [records, journeys, users, alerts] = await Promise.all([
      this.development.list(), this.onboardings.list(), this.users.list(), this.turnoverAlerts.list()
    ]);
    const active = alerts.filter(a => isActiveAlert(a.status));
    const takenIds = new Set(active.map(a => a.collaboratorId));
    const names = new Set(active.map(a => normName(a.collaboratorName)));
    const people: RetentionPerson[] = [];
    const offer = (person: RetentionPerson) => {
      const name = normName(person.name);
      if (takenIds.has(person.id) || names.has(name)) return;
      names.add(name);
      people.push(person);
    };
    for (const r of records) offer({ id: r.collaboratorId, name: r.collaboratorName, jobTitle: r.jobTitle, departmentId: r.departmentId, origin: 'pdi' });
    for (const j of journeys) offer({ id: j.candidateId, name: j.candidateName, jobTitle: j.jobTitle, departmentId: j.departmentId, origin: 'hire' });
    for (const u of users.filter(u => u.active)) offer({ id: u.id, name: u.name, jobTitle: u.jobTitle, departmentId: u.departmentId, origin: 'member' });
    return people;
  }

  // ---- Climate survey: campaigns, participation and anonymous answers ---------------------------------
  /** Campaigns with the situation in force (an open one past its closing date reads as closed). */
  async listCampaigns(db?: Queryable): Promise<ClimateCampaign[]> {
    const today = todaySP();
    return (await this.climateCampaigns.list(db)).map(c => withEffectiveStatus(c, today));
  }

  /** Campaigns with how many people could answer and how many did. */
  async campaignSummaries(): Promise<ClimateCampaignSummary[]> {
    const [campaigns, users, counted] = await Promise.all([
      this.listCampaigns(),
      this.users.list(),
      getPool().query('select campaign_id, count(*)::int as n from public.climate_participation where tenant_id = $1 group by campaign_id', [this.tenantId])
    ]);
    const responded = new Map<string, number>(counted.rows.map(r => [r.campaign_id as string, Number(r.n)]));
    return campaigns.map(c => ({ ...c, eligible: users.filter(u => isEligible(c, u)).length, responded: responded.get(c.id) ?? 0 }));
  }

  /** Read-modify-write of one campaign with its row locked; `change` sees the situation in force. */
  async changeCampaign(campaignId: string, change: (campaign: ClimateCampaign) => AlertPatch): Promise<ClimateCampaign> {
    return withTransaction(async tx => {
      const before = await getRow<ClimateCampaign>(TABLES.climateCampaigns, this.tenantId, campaignId, tx, true);
      if (!before) throw new NotFoundError('Pesquisa não encontrada');
      const updated = (await this.climateCampaigns.update(campaignId, change(withEffectiveStatus(before, todaySP())), tx))!;
      return withEffectiveStatus(updated, todaySP());
    });
  }

  async deleteCampaign(campaignId: string): Promise<void> {
    await withTransaction(async tx => {
      const campaign = await getRow<ClimateCampaign>(TABLES.climateCampaigns, this.tenantId, campaignId, tx, true);
      if (!campaign) throw new NotFoundError('Pesquisa não encontrada');
      assertCampaignRemovable(withEffectiveStatus(campaign, todaySP()));
      await this.climateCampaigns.delete(campaignId, tx);
    });
  }

  /** Open surveys this member may answer, and whether they already did. */
  async pendingSurveys(memberId: string): Promise<PendingSurvey[]> {
    const member = await this.users.get(memberId);
    if (!member?.active) return [];
    const open = (await this.listCampaigns()).filter(c => c.status === 'open' && isEligible(c, member));
    if (open.length === 0) return [];
    const { rows } = await getPool().query('select campaign_id from public.climate_participation where tenant_id = $1 and user_id = $2', [this.tenantId, memberId]);
    const answered = new Set(rows.map(r => r.campaign_id as string));
    return open.map(c => ({
      campaignId: c.id, name: c.name, period: c.period, description: c.description, closesOn: c.closesOn, answered: answered.has(c.id),
      // only the strategic blocks that apply to this person's job title
      blocks: toPendingBlocks(visibleBlocks(c.blocks ?? [], member))
    }));
  }

  /**
   * Records one answer. The participation (who answered, and the day) and the answer (what was said) go in the same
   * transaction but share NO key: the answer never carries the user. The primary key of the participation is what
   * stops a second answer from the same person.
   */
  async submitAnswer(campaignId: string, memberId: string, answer: ParsedAnswer): Promise<void> {
    await withTransaction(async tx => {
      await tx.query('select 1 from public.climate_campaigns where tenant_id = $1 and id = $2 for share', [this.tenantId, campaignId]);
      const stored = await getRow<ClimateCampaign>(TABLES.climateCampaigns, this.tenantId, campaignId, tx);
      if (!stored) throw new NotFoundError('Pesquisa não encontrada');
      const campaign = withEffectiveStatus(stored, todaySP());
      if (campaign.status !== 'open') {
        throw new ValidationError(campaign.status === 'closed' ? 'Esta pesquisa já foi encerrada.' : 'Esta pesquisa ainda não foi publicada.');
      }
      const member = await this.users.get(memberId, tx);
      if (!member || !isEligible(campaign, member)) throw new ForbiddenError('Você não faz parte do público desta pesquisa.');
      // the strategic questions this person's job title sees (and only those) must be answered correctly
      const blockAnswers = parseBlockAnswers(visibleBlocks(campaign.blocks ?? [], member), answer.rawAnswers);

      const recorded = await tx.query(
        'insert into public.climate_participation (tenant_id, campaign_id, user_id, responded_on) values ($1, $2, $3, $4) on conflict do nothing',
        [this.tenantId, campaignId, memberId, todaySP()]
      );
      if (!recorded.rowCount) throw new ConflictError('Você já respondeu esta pesquisa. Obrigado!');

      await this.climateSurveys.insert({
        id: newId('cs'),
        period: campaign.period,
        enpsScore: answer.enps,
        sentiment: sentimentOf(answer.enps),
        categoryRatings: answer.categories,
        anonymousComment: answer.comment,
        campaignId,
        departmentId: member.departmentId,
        blockAnswers
      }, tx);
    });
  }

  /**
   * Hides (or shows again) one comment of a campaign, e.g. one that names a person. Without `questionId` it is the
   * comment of the survey core; with it, the text answer to that strategic question.
   */
  async setCommentHidden(campaignId: string, responseId: string, hidden: boolean, questionId?: string): Promise<void> {
    const { rowCount } = questionId
      ? await getPool().query(
        `update public.climate_surveys
            set hidden_texts = case when $5 then array_append(array_remove(hidden_texts, $4), $4) else array_remove(hidden_texts, $4) end
          where tenant_id = $1 and campaign_id = $2 and id = $3`,
        [this.tenantId, campaignId, responseId, questionId, hidden]
      )
      : await getPool().query(
        'update public.climate_surveys set comment_hidden = $4 where tenant_id = $1 and campaign_id = $2 and id = $3',
        [this.tenantId, campaignId, responseId, hidden]
      );
    if (!rowCount) throw new NotFoundError('Comentário não encontrado');
  }

  // ---- Survey templates of the organization (the system library lives in src/surveyTemplates.ts) -------
  /** Registered Cargos (module Cargos) that are active, with how many active people are linked to each. */
  async positionOptions(): Promise<PositionOption[]> {
    const [positions, users] = await Promise.all([this.positions.list(), this.users.list()]);
    const linked = new Map<string, number>();
    for (const u of users) if (u.active && u.positionId) linked.set(u.positionId, (linked.get(u.positionId) ?? 0) + 1);
    return positions
      .filter(p => p.status === 'active')
      .map(p => ({ id: p.id, title: p.title, departmentId: p.departmentId, level: p.level, careerTrack: p.careerTrack, count: linked.get(p.id) ?? 0 }))
      .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  }

  /** Active people with no registered Cargo: they cannot be reached by blocks aimed at cargos. */
  async unlinkedMembersCount(): Promise<number> {
    return (await this.users.list()).filter(u => u.active && !u.positionId).length;
  }

  /** The organization's own templates (the `system` flag is what tells them from the library ones). */
  async listTemplates(db?: Queryable): Promise<SurveyTemplate[]> {
    return (await this.surveyTemplates.list(db)).map(t => ({ ...t, system: false as const }));
  }

  private async assertTemplateNameFree(name: string, exceptId: string | undefined, db: Queryable): Promise<void> {
    const clash = (await this.surveyTemplates.list(db)).find(t => t.id !== exceptId && t.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (clash) throw new ConflictError(`Já existe um template chamado “${clash.name}”.`);
  }

  async createTemplate(fields: Record<string, unknown>): Promise<SurveyTemplate> {
    return withTransaction(async tx => {
      await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`survey-template:${this.tenantId}`]);
      const existing = await this.surveyTemplates.list(tx);
      if (existing.length >= MAX_ORG_TEMPLATES) throw new ValidationError(`A organização pode ter no máximo ${MAX_ORG_TEMPLATES} templates próprios.`);
      await this.assertTemplateNameFree(String(fields.name), undefined, tx);
      const created = await this.surveyTemplates.insert({ id: newId('tpl'), ...fields }, tx);
      return { ...created, system: false as const };
    });
  }

  async changeTemplate(templateId: string, patch: Record<string, unknown>): Promise<SurveyTemplate> {
    return withTransaction(async tx => {
      await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`survey-template:${this.tenantId}`]);
      const before = await getRow<Omit<SurveyTemplate, 'system'>>(TABLES.surveyTemplates, this.tenantId, templateId, tx, true);
      if (!before) throw new NotFoundError('Template não encontrado');
      if (typeof patch.name === 'string') await this.assertTemplateNameFree(patch.name, templateId, tx);
      const updated = (await this.surveyTemplates.update(templateId, { ...patch, updatedAt: new Date().toISOString() }, tx))!;
      return { ...updated, system: false as const };
    });
  }

  async deleteTemplate(templateId: string): Promise<void> {
    if (!(await this.surveyTemplates.delete(templateId))) throw new NotFoundError('Template não encontrado');
  }
}

