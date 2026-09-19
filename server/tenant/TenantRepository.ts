import type { PoolClient } from 'pg';
import {
  AIAssistedEvaluation,
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
import { getRow, fromRow, insertRow, listRows, toSnake, updateRow, TableSpec } from '../db/crud.js';
import { getPool, Queryable, withTransaction } from '../db/pool.js';
import { TABLES } from '../db/tables.js';
import { NotFoundError, ValidationError } from '../errors.js';

/** Generic CRUD bound to a single tenant and table. */
class Entity<T> {
  constructor(private readonly spec: TableSpec, private readonly tenantId: string) {}
  list(db?: Queryable) { return listRows<T>(this.spec, this.tenantId, db); }
  get(id: string, db?: Queryable) { return getRow<T>(this.spec, this.tenantId, id, db); }
  insert(obj: Record<string, unknown>, db?: Queryable) { return insertRow<T>(this.spec, this.tenantId, obj, db); }
  update(id: string, patch: Record<string, unknown>, db?: Queryable) {
    return updateRow<T>(this.spec, this.tenantId, id, patch, db);
  }
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
  readonly applications: Entity<SelectionApplication>;
  readonly aiEvaluations: Entity<AIAssistedEvaluation>;
  readonly interviews: Entity<InterviewSession>;
  readonly offers: Entity<JobOffer>;
  readonly onboardings: Entity<OnboardingJourney>;
  readonly development: Entity<CollaboratorDevelopment>;
  readonly climateSurveys: Entity<ClimateSurveyResponse>;
  readonly turnoverAlerts: Entity<TurnoverRiskAlert>;

  constructor(public readonly tenantId: string) {
    this.users = new Entity(TABLES.users, tenantId);
    this.departments = new Entity(TABLES.departments, tenantId);
    this.positions = new Entity(TABLES.positions, tenantId);
    this.openings = new Entity(TABLES.openings, tenantId);
    this.candidates = new Entity(TABLES.candidates, tenantId);
    this.applications = new Entity(TABLES.applications, tenantId);
    this.aiEvaluations = new Entity(TABLES.aiEvaluations, tenantId);
    this.interviews = new Entity(TABLES.interviews, tenantId);
    this.offers = new Entity(TABLES.offers, tenantId);
    this.onboardings = new Entity(TABLES.onboardings, tenantId);
    this.development = new Entity(TABLES.development, tenantId);
    this.climateSurveys = new Entity(TABLES.climateSurveys, tenantId);
    this.turnoverAlerts = new Entity(TABLES.turnoverAlerts, tenantId);
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

