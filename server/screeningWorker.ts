import type { Tenant } from '../src/types.js';
import { assessAllowance, recordUsage } from './aiUsage.js';
import { isGeminiConfigured } from './gemini.js';
import { analyzeResume, ResumeAiError, type ResumeInput } from './resumeAi.js';
import { docxToText, PDF_MIME } from './resumeFile.js';
import { getFile, RESUME_BUCKET } from './storage.js';
import { logAudit } from './audit.js';
import { consumeQuota } from './rateLimit.js';
import { criteriaHashOf, criteriaOf } from './tenant/screening.js';
import { TenantRepository } from './tenant/TenantRepository.js';
import { MAX_AUTO_ATTEMPTS } from '../src/screening.js';
import { NotFoundError, ValidationError } from './errors.js';
import { getPool } from './db/pool.js';
import { TenantConnectionRouter } from './tenant/TenantConnectionRouter.js';

const ANALYZE_HOURLY_LIMIT = 200;
const RESUME_AI_TOTAL_BUDGET_MS = 45_000;

export type ScreeningProcessResult = 'completed' | 'needs_data' | 'failed' | 'waiting' | 'busy';

/** Processes one queued curriculum. The tenant repository and storage path are both hard-scoped to the tenant. */
export async function processScreeningFile(
  tenant: Tenant,
  db: TenantRepository,
  fileId: string,
  options: { force?: boolean } = {}
): Promise<ScreeningProcessResult> {
  const force = options.force === true;
  const existing = await db.resumeScreenings.get(fileId);
  if (!existing) throw new NotFoundError('Arquivo de currículo não encontrado.');
  if (!force && existing.attempts >= MAX_AUTO_ATTEMPTS) return 'failed';
  if (!existing.storagePath.startsWith(`${tenant.id}/resumes/`)) throw new NotFoundError('Arquivo de currículo não encontrado.');

  const job = await db.openings.get(existing.jobOpeningId);
  if (!job) throw new NotFoundError('Vaga não encontrada.');
  const [position, dna] = await Promise.all([db.positions.get(job.positionId), db.getDna()]);
  if (!position) throw new ValidationError('Esta vaga não tem um Cargo vinculado.');
  if (!dna) throw new ValidationError('Configure o DNA Organizacional antes de usar a triagem de currículos.');
  if (dna.pillars.length === 0) throw new ValidationError('O DNA Organizacional ainda não tem pilares cadastrados.');

  if (!isGeminiConfigured()) return 'waiting';
  const criteria = criteriaOf(job, position, dna);
  const criteriaHash = criteriaHashOf(criteria);
  const { decision, settings: aiSettings, model } = await assessAllowance(tenant.id);
  const who = { tenantId: tenant.id, userId: existing.uploadedById, userName: existing.uploadedByName, model };
  if (decision.mode === 'block') return 'waiting';
  if (decision.mode === 'estimate') return 'waiting';

  await consumeQuota(
    'resume-analyze', [tenant.id], { limit: ANALYZE_HOURLY_LIMIT, windowSeconds: 3600 },
    'Muitas análises de currículo nesta hora. Tente novamente em instantes.'
  );

  const claimed = await db.claimScreening(existing.id, { force });
  if (!claimed) return 'busy';

  try {
    const fileBuffer = await getFile(claimed.storagePath, RESUME_BUCKET);
    const resume: ResumeInput = claimed.mime === PDF_MIME
      ? { kind: 'pdf', content: fileBuffer }
      : (() => {
          const { text, hiddenText, truncated } = docxToText(fileBuffer);
          return { kind: 'docx', text, hiddenText, truncated };
        })();

    const { analysis, usage } = await analyzeResume({ criteria, criteriaHash, model, resume, seedHint: claimed.contentHash });
    const result = await db.completeScreeningAnalysis(claimed.id, analysis, { model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
    await Promise.all([
      recordUsage({
        ...who, evaluationId: result.evaluation?.id, candidateId: result.candidate?.id, jobOpeningId: job.id,
        outcome: 'ai', inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, durationMs: usage.durationMs
      }, aiSettings),
      result.evaluation && result.candidate
        ? logAudit({
            tenantId: tenant.id, userId: existing.uploadedById, userName: existing.uploadedByName,
            action: 'RESUME_SCREENING_ANALYZED', category: 'AI_EXECUTION',
            details: `Currículo lido pela IA para a vaga '${job.title}': ${result.candidate.name} (${analysis.overallScore}%).`,
            ipAddress: '127.0.0.1', databaseAffected: tenant.dbConfig.dbName
          })
        : Promise.resolve()
    ]);
    return result.screening.status === 'needs_data' ? 'needs_data' : 'completed';
  } catch (err) {
    if (err instanceof ResumeAiError) {
      const [released] = await Promise.all([
        db.releaseScreeningAsFailed(claimed.id, err.message),
        recordUsage({ ...who, outcome: 'failed', inputTokens: err.inputTokens, outputTokens: err.outputTokens, durationMs: err.durationMs }, aiSettings)
      ]);
      return released ? 'failed' : 'failed';
    }
    await db.releaseScreeningAsFailed(claimed.id, 'Erro interno ao processar este currículo.').catch(() => undefined);
    throw err;
  }
}

export function screeningWorkerBatchSize(): number {
  return Math.min(5, Math.max(1, Math.floor(Number(process.env.SCREENING_WORKER_BATCH_SIZE) || 3)));
}

export async function processScreeningQueue(limit = screeningWorkerBatchSize()): Promise<{ processed: number; completed: number; failed: number; waiting: number }> {
  const safeLimit = Math.min(5, Math.max(1, Math.floor(limit)));
  const lockClient = await getPool().connect();
  try {
    const lock = await lockClient.query('select pg_try_advisory_lock($1::bigint) as acquired', [4729013601]);
    if (!lock.rows[0]?.acquired) return { processed: 0, completed: 0, failed: 0, waiting: 0 };

    const tenants = await getPool().query("select id from public.tenants where status = 'active' order by id");
    const router = TenantConnectionRouter.getInstance();
    const tasks: Array<{ tenant: Tenant; db: TenantRepository; fileId: string }> = [];

    for (const row of tenants.rows) {
      if (tasks.length >= safeLimit) break;
      const tenant = await router.getTenantById(String(row.id));
      if (!tenant) continue;
      const db = new TenantRepository(tenant.id);
      for (const fileId of await db.listQueuedScreeningIds(safeLimit - tasks.length)) {
        tasks.push({ tenant, db, fileId });
      }
    }

    const results = await Promise.allSettled(tasks.map(task => processScreeningFile(task.tenant, task.db, task.fileId)));
    return {
      processed: results.length,
      completed: results.filter(result => result.status === 'fulfilled' && (result.value === 'completed' || result.value === 'needs_data')).length,
      failed: results.filter(result => result.status === 'fulfilled' && result.value === 'failed').length,
      waiting: results.filter(result => result.status === 'fulfilled' && result.value === 'waiting').length
    };
  } finally {
    await lockClient.query('select pg_advisory_unlock($1::bigint)', [4729013601]).catch(() => undefined);
    lockClient.release();
  }
}
