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
  ClimateSurveyResponse,
  CollaboratorDevelopment,
  Department,
  InterviewSession,
  JobOffer,
  JobOpening,
  JobPosition,
  OnboardingJourney,
  OrganizationalDNA,
  PDIGoal,
  SelectionApplication,
  TenantIndicators,
  TenantUser,
  TurnoverRiskAlert
} from '../../src/types.js';
import { deleteRow, getRow, fromRow, insertRow, listRows, toSnake, updateRow, TableSpec } from '../db/crud.js';
import { getPool, Queryable, withTransaction } from '../db/pool.js';
import { TABLES } from '../db/tables.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { buildAdmissionItems, DEFAULT_ADMISSION_TEMPLATES } from './admission.js';
import { buildChecklistItems, DEFAULT_INTEGRATION_TEMPLATES } from './integration.js';
import { newId } from '../ids.js';

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

const INDICATOR_FIELDS = [
  'period', 'timeToHireDays', 'costPerHire', 'earlyTurnover90DaysRate', 'averageCulturalFit', 'openPositionsCount',
  'totalHiresThisQuarter', 'retentionRate12Months', 'candidateNPS', 'recruitmentFunnel'
] as const;

/**
 * TenantRepository
 * All data access for one organization. Every statement is scoped by tenant_id and
 * the composite foreign keys in the schema make cross-tenant references impossible.
 */
export class TenantRepository {
  readonly users: Entity<TenantUser>;
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
  readonly climateSurveys: Entity<ClimateSurveyResponse>;
  readonly turnoverAlerts: Entity<TurnoverRiskAlert>;
  readonly agendaEvents: Entity<AgendaEvent>;

  constructor(public readonly tenantId: string) {
    this.users = new Entity(TABLES.users, tenantId);
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
    this.climateSurveys = new Entity(TABLES.climateSurveys, tenantId);
    this.turnoverAlerts = new Entity(TABLES.turnoverAlerts, tenantId);
    this.agendaEvents = new Entity(TABLES.agendaEvents, tenantId);
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

  // ---- AI evaluations ---------------------------------------------------
  /** Stores an evaluation and links it to the matching application (atomic). */
  async saveAIEvaluation(evaluation: AIAssistedEvaluation): Promise<AIAssistedEvaluation> {
    return withTransaction(async tx => {
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

  // ---- Offers -> hire ---------------------------------------------------------
  /**
   * Updates an offer's status. Accepting it is the hire: it opens the onboarding journey,
   * marks the application as hired and counts the seat as filled — all in one transaction.
   */
  async setOfferStatus(id: string, status: JobOffer['status'], notes?: string): Promise<JobOffer> {
    return withTransaction(async tx => {
      const now = new Date().toISOString();
      const offer = await this.offers.update(id, {
        status,
        notes,
        sentAt: status === 'sent' ? now : undefined,
        respondedAt: status === 'accepted' || status === 'declined' ? now : undefined
      }, tx);
      if (!offer) throw new NotFoundError('Proposta não encontrada');
      if (status === 'accepted') await this.registerHire(offer, tx);
      return offer;
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
    const started = offer.startDate <= new Date().toISOString().split('T')[0];

    await this.onboardings.insert({
      id: `onb-${offer.id}`,
      candidateId: offer.candidateId,
      candidateName: candidate?.name ?? 'Candidato',
      jobTitle: job?.title ?? 'Cargo a definir',
      departmentId: job?.departmentId,
      mentorId: job?.hiringManagerId,
      hireDate: offer.startDate,
      status: started ? 'in_progress' : 'preparing',
      checklists: buildChecklistItems(await this.ensureIntegrationTemplates(tx)),
      admission: buildAdmissionItems(await this.ensureAdmissionTemplates(tx), offer.contractType, offer.startDate),
      milestones30DaysDone: false,
      milestones60DaysDone: false,
      milestones90DaysDone: false,
      notes: `Jornada aberta automaticamente após o aceite da proposta (${offer.contractType}).`
    }, tx);

    // Selection pipeline: the candidate's application ends on the "hired" stage.
    const application = (await this.applications.list(tx)).find(
      a => a.candidateId === offer.candidateId && a.jobOpeningId === offer.jobOpeningId
    );
    if (application && application.status !== 'hired') {
      const hiredStage = job?.stages.find(s => s.type === 'hired');
      await this.applications.update(application.id, {
        status: 'hired',
        currentStageId: hiredStage?.id,
        notes: [...application.notes, `[${new Date().toLocaleDateString('pt-BR')}] Proposta aceita — candidato contratado.`]
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

  async addGoal(recordId: string, goal: PDIGoal): Promise<CollaboratorDevelopment> {
    return withTransaction(async tx => {
      const record = await getRow<CollaboratorDevelopment>(TABLES.development, this.tenantId, recordId, tx, true);
      if (!record) throw new NotFoundError('Registro de PDI não encontrado');
      return (await this.development.update(recordId, { goals: [...record.goals, goal] }, tx))!;
    });
  }
}

