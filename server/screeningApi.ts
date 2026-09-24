import { createHash } from 'node:crypto';
import express, { Express, Request } from 'express';
import { ConflictError, NotFoundError, TooManyRequestsError, ValidationError } from './errors.js';
import { h, required } from './http.js';
import { can } from './auth/middleware.js';
import { logAudit } from './audit.js';
import { assessAllowance, recordUsage } from './aiUsage.js';
import { isGeminiConfigured } from './gemini.js';
import { analyzeResume, ResumeAiError, type ResumeInput } from './resumeAi.js';
import { docxToText, PDF_MIME, sniffResume } from './resumeFile.js';
import { getFile, MAX_FILE_BYTES, putFile, removeFile, RESUME_BUCKET, safeFileName } from './storage.js';
import { newId } from './ids.js';
import { consumeQuota } from './rateLimit.js';
import { buildScreeningBoard, criteriaHashOf, criteriaOf, fileOf, planDecision, screeningCriteriaInfo } from './tenant/screening.js';
import { deriveFlags, effectiveStatus, MAX_AUTO_ATTEMPTS, SCREENING_PERMISSIONS } from '../src/screening.js';
import { RESUME_LIMITS, type ScreeningDecisionAction, type ScreeningDecisionResult } from '../src/types.js';

/**
 * Rotas de "Triagem Inteligente de Currículos". Reaproveita o middleware `/api/v1` já montado em `server/app.ts`
 * (autenticação, senha trocada, roteamento por tenant): esta função só ACRESCENTA rotas à mesma `app`. Sem módulo de
 * IA contratado, a organização perde as permissões `ai_evaluation:*` da sessão (server/auth/AuthService.ts) e todas
 * estas rotas respondem 403 sozinhas — nenhuma checagem extra é necessária aqui.
 */
const ctx = (req: Request) => req.tenantContext!;

/** `can()` é "qualquer uma da lista" (OR); a triagem exige TODAS as permissões da rotina, então cada uma vira sua própria guarda. */
const canAll = (perms: readonly string[]) => perms.map(p => can(p));

const ANALYZE_HOURLY_LIMIT = 200;
const UPLOAD_HOURLY_LIMIT = 300;

export function registerScreeningApi(app: Express): void {
  // ---------------------------------------------------------------------------------------------------------------
  // Quadro da vaga (ranking) e pré-checagem de limite
  // ---------------------------------------------------------------------------------------------------------------
  app.get('/api/v1/screening/jobs/:jobId', ...canAll(SCREENING_PERMISSIONS.view), h(async (req, res) => {
    const { db } = ctx(req);
    const job = await db.openings.get(req.params.jobId);
    if (!job) throw new NotFoundError('Vaga não encontrada.');
    const [position, dna, applications, candidates, evaluations, screenings] = await Promise.all([
      db.positions.get(job.positionId), db.getDna(), db.applications.list(), db.candidates.list(),
      db.aiEvaluations.list(), db.listScreeningsForJob(job.id)
    ]);
    const criteriaHash = position && dna ? criteriaHashOf(criteriaOf(job, position, dna)) : '';
    const criteria = screeningCriteriaInfo(position, dna, criteriaHash);
    const board = buildScreeningBoard({
      job: { id: job.id, title: job.title, status: job.status, stages: job.stages },
      applications: applications.filter(a => a.jobOpeningId === job.id),
      candidates,
      evaluations,
      screenings,
      criteria
    });
    res.json({ success: true, board });
  }));

  app.get('/api/v1/screening/allowance', ...canAll(SCREENING_PERMISSIONS.view), h(async (req, res) => {
    const { tenant } = ctx(req);
    if (!isGeminiConfigured()) {
      return res.json({
        success: true,
        allowance: { available: false, reason: 'not_configured', message: 'O Gemini não está configurado neste ambiente.', remaining: null, limit: null, used: 0 }
      });
    }
    const { decision, orgUsed, orgLimit } = await assessAllowance(tenant.id);
    const available = decision.mode === 'allow';
    res.json({
      success: true,
      allowance: {
        available,
        reason: available ? undefined : decision.reason,
        message: available ? undefined : decision.message,
        remaining: orgLimit === null ? null : Math.max(0, orgLimit - orgUsed),
        limit: orgLimit,
        used: orgUsed
      }
    });
  }));

  // ---------------------------------------------------------------------------------------------------------------
  // Envio do arquivo (corpo bruto — mesmo padrão do upload de documentos de proposta)
  // ---------------------------------------------------------------------------------------------------------------
  app.post(
    '/api/v1/screening/jobs/:jobId/files',
    ...canAll(SCREENING_PERMISSIONS.upload),
    express.raw({ type: () => true, limit: MAX_FILE_BYTES + 64 * 1024 }),
    h(async (req, res) => {
      const { db, tenant } = ctx(req);
      const job = await db.openings.get(req.params.jobId);
      if (!job) throw new NotFoundError('Vaga não encontrada.');
      if (job.status === 'filled' || job.status === 'cancelled') {
        throw new ValidationError('Esta vaga está encerrada; não é possível enviar novos currículos.');
      }

      const { mime } = sniffResume(req.body); // já valida tipo pelo CONTEÚDO e tamanho; lança ValidationError com mensagem amigável
      const contentHash = createHash('sha256').update(req.body as Buffer).digest('hex');

      const already = await db.listScreeningsForJob(job.id);
      if (already.length >= RESUME_LIMITS.perJob) {
        throw new ValidationError(`Esta vaga já atingiu o limite de ${RESUME_LIMITS.perJob} currículos enviados.`);
      }
      if (already.some(s => s.contentHash === contentHash)) {
        throw new ConflictError('Este mesmo arquivo já foi enviado para esta vaga.');
      }

      // Disjuntor simples contra envio em massa (mesmo mecanismo usado no login e no portal público de vagas).
      await consumeQuota(
        'resume-upload', [tenant.id], { limit: UPLOAD_HOURLY_LIMIT, windowSeconds: 3600 },
        'Muitos currículos enviados nesta hora. Tente novamente em instantes.'
      );

      const id = newId('scr');
      const name = safeFileName(String(req.query.name ?? 'curriculo'));
      const storagePath = `${tenant.id}/resumes/${job.id}/${id}-${name}`;
      await putFile(storagePath, req.body as Buffer, mime, RESUME_BUCKET);
      try {
        const screening = await db.resumeScreenings.insert({
          id, jobOpeningId: job.id, fileName: name, mime, sizeBytes: (req.body as Buffer).length, contentHash, storagePath,
          status: 'uploaded', attempts: 0, inputTokens: 0, outputTokens: 0,
          uploadedById: req.auth!.id, uploadedByName: req.auth!.name, uploadedAt: new Date().toISOString()
        });
        await logAudit({
          tenantId: tenant.id, userId: req.auth!.id, userName: req.auth!.name, action: 'RESUME_UPLOADED', category: 'CANDIDATE_DATA',
          details: `Currículo enviado para a vaga '${job.title}' (${name}).`, ipAddress: req.ip || '127.0.0.1', databaseAffected: tenant.dbConfig.dbName
        });
        res.status(201).json({ success: true, file: fileOf(screening) });
      } catch (err) {
        await removeFile(storagePath, RESUME_BUCKET);
        throw err;
      }
    })
  );

  // ---------------------------------------------------------------------------------------------------------------
  // Análise pela IA (extração + verificação de requisitos + leitura por pilar, numa única chamada)
  // ---------------------------------------------------------------------------------------------------------------
  app.post('/api/v1/screening/files/:id/analyze', ...canAll(SCREENING_PERMISSIONS.upload), h(async (req, res) => {
    const { db, tenant } = ctx(req);
    const force = req.body?.force === true;

    const existing = await db.resumeScreenings.get(req.params.id);
    if (!existing) throw new NotFoundError('Arquivo de currículo não encontrado.');
    if (!force && effectiveStatus(existing) === 'analyzed') {
      return res.json({ success: true, file: fileOf(existing) }); // já lido: não cobra de novo
    }
    if (!force && existing.attempts >= MAX_AUTO_ATTEMPTS) {
      throw new ValidationError('Este arquivo já teve várias tentativas sem sucesso. Use "Reanalisar" para tentar de novo.');
    }

    const job = await db.openings.get(existing.jobOpeningId);
    if (!job) throw new NotFoundError('Vaga não encontrada.');
    const [position, dna] = await Promise.all([db.positions.get(job.positionId), db.getDna()]);
    if (!position) throw new ValidationError('Esta vaga não tem um Cargo vinculado.');
    if (!dna) throw new ValidationError('Configure o DNA Organizacional antes de usar a triagem de currículos.');
    if (dna.pillars.length === 0) throw new ValidationError('O DNA Organizacional ainda não tem pilares cadastrados.');

    const criteria = criteriaOf(job, position, dna);
    const criteriaHash = criteriaHashOf(criteria);

    // Sem a IA configurada, o arquivo fica como está (nunca uma nota inventada): nenhuma reserva é feita.
    if (!isGeminiConfigured()) {
      return res.json({
        success: true, file: fileOf(existing),
        notice: 'O Gemini não está configurado neste ambiente. O arquivo continua aguardando.'
      });
    }

    const { decision, settings: aiSettings, model } = await assessAllowance(tenant.id);
    const who = { tenantId: tenant.id, userId: req.auth!.id, userName: req.auth!.name, model };
    if (decision.mode === 'block') {
      await recordUsage({ ...who, outcome: 'blocked', reason: decision.reason }, aiSettings);
      throw new TooManyRequestsError(decision.message);
    }
    if (decision.mode === 'estimate') {
      // Não há estimativa local de currículo (evitaria uma nota inventada): o arquivo fica como está, aguardando.
      await recordUsage({ ...who, outcome: 'blocked', reason: decision.reason }, aiSettings);
      return res.json({ success: true, file: fileOf(existing), notice: decision.message });
    }

    await consumeQuota(
      'resume-analyze', [tenant.id], { limit: ANALYZE_HOURLY_LIMIT, windowSeconds: 3600 },
      'Muitas análises de currículo nesta hora. Tente novamente em instantes.'
    );

    const claimed = await db.claimScreening(existing.id, { force });
    if (!claimed) throw new ConflictError('Este arquivo já está sendo analisado (ou acabou de ser lido). Atualize a lista.');

    try {
      const fileBuffer = await getFile(claimed.storagePath, RESUME_BUCKET);
      const resume: ResumeInput =
        claimed.mime === PDF_MIME
          ? { kind: 'pdf', content: fileBuffer }
          : (() => {
              const { text, hiddenText, truncated } = docxToText(fileBuffer);
              return { kind: 'docx', text, hiddenText, truncated };
            })();

      const { analysis, usage } = await analyzeResume({ criteria, criteriaHash, model, resume, seedHint: claimed.contentHash });
      const result = await db.completeScreeningAnalysis(claimed.id, analysis, { model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });

      await recordUsage({
        ...who, evaluationId: result.evaluation?.id, candidateId: result.candidate?.id, jobOpeningId: job.id,
        outcome: 'ai', inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, durationMs: usage.durationMs
      }, aiSettings);

      if (result.evaluation && result.candidate) {
        await logAudit({
          tenantId: tenant.id, userId: req.auth!.id, userName: req.auth!.name, action: 'RESUME_SCREENING_ANALYZED', category: 'AI_EXECUTION',
          details: `Currículo lido pela IA para a vaga '${job.title}': ${result.candidate.name} (${analysis.overallScore}%).`,
          ipAddress: req.ip || '127.0.0.1', databaseAffected: tenant.dbConfig.dbName
        });
      }
      res.json({ success: true, file: fileOf(result.screening) });
    } catch (err) {
      if (err instanceof ResumeAiError) {
        await recordUsage({ ...who, outcome: 'failed', inputTokens: err.inputTokens, outputTokens: err.outputTokens, durationMs: err.durationMs }, aiSettings);
        const released = await db.releaseScreeningAsFailed(claimed.id, err.message);
        return res.json({ success: true, file: fileOf(released ?? claimed) });
      }
      await db.releaseScreeningAsFailed(claimed.id, 'Erro interno ao processar este currículo.').catch(() => undefined);
      throw err;
    }
  }));

  // Sem e-mail, sem nome, ou nome incompatível com um candidato existente do mesmo e-mail: o RH confirma manualmente.
  app.post('/api/v1/screening/files/:id/complete', ...canAll(SCREENING_PERMISSIONS.upload), h(async (req, res) => {
    const { db, tenant } = ctx(req);
    const existing = await db.resumeScreenings.get(req.params.id);
    if (!existing) throw new NotFoundError('Arquivo de currículo não encontrado.');
    if (existing.status !== 'needs_data' || !existing.analysis) {
      throw new ValidationError('Este arquivo não está aguardando confirmação de dados.');
    }

    const name = required(req.body?.name, 'name');
    const email = required(req.body?.email, 'email').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('E-mail inválido.');

    const analysis = { ...existing.analysis, extraction: { ...existing.analysis.extraction, name, email } };
    const result = await db.completeScreeningAnalysis(existing.id, analysis, {
      model: existing.model ?? analysis.model, inputTokens: 0, outputTokens: 0
    });

    if (result.evaluation && result.candidate) {
      await logAudit({
        tenantId: tenant.id, userId: req.auth!.id, userName: req.auth!.name, action: 'RESUME_SCREENING_COMPLETED', category: 'CANDIDATE_DATA',
        details: `Dados confirmados manualmente para o currículo '${existing.fileName}': ${result.candidate.name}.`,
        ipAddress: req.ip || '127.0.0.1', databaseAffected: tenant.dbConfig.dbName
      });
    }
    res.json({ success: true, file: fileOf(result.screening) });
  }));

  // ---------------------------------------------------------------------------------------------------------------
  // Detalhe, download e exclusão de um arquivo
  // ---------------------------------------------------------------------------------------------------------------
  app.get('/api/v1/screening/files/:id', ...canAll(SCREENING_PERMISSIONS.view), h(async (req, res) => {
    const { db } = ctx(req);
    const row = await db.resumeScreenings.get(req.params.id);
    if (!row) throw new NotFoundError('Arquivo não encontrado.');
    const [dna, job] = await Promise.all([db.getDna(), db.openings.get(row.jobOpeningId)]);
    const position = job ? await db.positions.get(job.positionId) : undefined;
    const culturalFitThreshold = dna?.culturalFitThreshold ?? null;
    const currentCriteriaHash = position && dna ? criteriaHashOf(criteriaOf(job!, position, dna)) : '';
    const candidate = row.candidateId ? await db.candidates.get(row.candidateId) : undefined;

    res.json({
      success: true,
      detail: {
        file: fileOf(row),
        analysis: row.analysis,
        flags: deriveFlags(row.summary, { culturalFitThreshold, criteriaHash: currentCriteriaHash }),
        candidate: candidate && {
          id: candidate.id, name: candidate.name, email: candidate.email, phone: candidate.phone, location: candidate.location,
          currentRole: candidate.currentRole, yearsOfExperience: candidate.yearsOfExperience, education: candidate.education,
          skills: candidate.skills, archived: candidate.archived
        },
        culturalFitThreshold
      }
    });
  }));

  // Nunca exposto por URL direta: passa sempre pela API, com checagem de permissão e de prefixo do tenant.
  app.get('/api/v1/screening/files/:id/file', ...canAll(SCREENING_PERMISSIONS.view), h(async (req, res) => {
    const { db, tenant } = ctx(req);
    const row = await db.resumeScreenings.get(req.params.id);
    if (!row || !row.storagePath.startsWith(`${tenant.id}/resumes/`)) throw new NotFoundError('Arquivo não encontrado.');
    const content = await getFile(row.storagePath, RESUME_BUCKET);
    res.setHeader('Content-Type', row.mime);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    await logAudit({
      tenantId: tenant.id, userId: req.auth!.id, userName: req.auth!.name, action: 'RESUME_DOWNLOADED', category: 'CANDIDATE_DATA',
      details: `Currículo baixado: ${row.fileName}.`, ipAddress: req.ip || '127.0.0.1', databaseAffected: tenant.dbConfig.dbName
    });
    res.send(content);
  }));

  app.delete('/api/v1/screening/files/:id', ...canAll(SCREENING_PERMISSIONS.decide), h(async (req, res) => {
    const { db, tenant } = ctx(req);
    const reason = required(req.body?.reason, 'reason');
    const row = await db.resumeScreenings.get(req.params.id);
    if (!row) throw new NotFoundError('Arquivo não encontrado.');
    await db.resumeScreenings.delete(row.id);
    if (row.storagePath.startsWith(`${tenant.id}/resumes/`)) void removeFile(row.storagePath, RESUME_BUCKET);
    void logAudit({
      tenantId: tenant.id, userId: req.auth!.id, userName: req.auth!.name, action: 'RESUME_DELETED', category: 'CANDIDATE_DATA',
      details: `Currículo excluído (${row.fileName}). Motivo: ${reason}`, ipAddress: req.ip || '127.0.0.1', databaseAffected: tenant.dbConfig.dbName
    }).catch(err => console.warn('[audit] falha ao registrar exclusão de currículo:', err));
    res.json({ success: true });
  }));

  // ---------------------------------------------------------------------------------------------------------------
  // Decisão em lote (avançar / manter em espera / arquivar) — sempre um clique humano, nunca a IA
  // ---------------------------------------------------------------------------------------------------------------
  app.post('/api/v1/screening/jobs/:jobId/decisions', ...canAll(SCREENING_PERMISSIONS.decide), h(async (req, res) => {
    const { db, tenant } = ctx(req);
    const action = req.body?.action as ScreeningDecisionAction;
    if (!['advance', 'hold', 'archive'].includes(action)) throw new ValidationError('Ação inválida.');
    const items: Array<{ applicationId?: unknown; fromStageId?: unknown }> = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) throw new ValidationError('Selecione ao menos uma candidatura.');
    if (items.length > 50) throw new ValidationError('No máximo 50 candidaturas por decisão em lote.');
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;

    const job = await db.openings.get(req.params.jobId);
    if (!job) throw new NotFoundError('Vaga não encontrada.');

    const results: ScreeningDecisionResult[] = [];
    for (const item of items) {
      const applicationId = String(item?.applicationId ?? '');
      const fromStageId = String(item?.fromStageId ?? '');
      try {
        const application = await db.applications.get(applicationId);
        if (!application || application.jobOpeningId !== job.id) throw new NotFoundError('Candidatura não encontrada nesta vaga.');
        const plan = planDecision({ action, fromStageId, currentStageId: application.currentStageId, stages: job.stages, reason });
        const updated = await db.moveApplication(applicationId, { stageId: plan.stageId, status: plan.status, note: plan.note });
        results.push({ applicationId, ok: true, stageId: updated.currentStageId, status: updated.status });
        await logAudit({
          tenantId: tenant.id, userId: req.auth!.id, userName: req.auth!.name,
          action: `RESUME_SCREENING_DECISION_${action.toUpperCase()}`, category: 'CANDIDATE_DATA', details: plan.note,
          ipAddress: req.ip || '127.0.0.1', databaseAffected: tenant.dbConfig.dbName
        });
      } catch (err) {
        results.push({ applicationId, ok: false, message: err instanceof Error ? err.message : 'Erro ao processar esta candidatura.' });
      }
    }
    res.json({ success: true, results });
  }));
}
