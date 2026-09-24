import { createHash } from 'node:crypto';
import type {
  AIAssistedEvaluation,
  ApplicationStatus,
  Candidate,
  JobPosition,
  OrganizationalDNA,
  PipelineStage,
  ResumeExtraction,
  ResumeScreening,
  ScreeningBoard,
  ScreeningCriteriaInfo,
  ScreeningCriteriaSnapshot,
  ScreeningDecisionAction,
  ScreeningFile,
  ScreeningRow,
  SelectionApplication
} from '../../src/types.js';
import { deriveFlags, effectiveStatus, nextStage, rankRows } from '../../src/screening.js';
import { ConflictError, ValidationError } from '../errors.js';
import { normName } from '../gemini.js';

/**
 * Regras da Triagem Inteligente de Currículos que dependem do vocabulário do domínio (vaga, Cargo, DNA, candidatura),
 * mas não de banco de dados nem de rede — puras e testáveis. `server/resumeAi.ts` cuida só da IA; `TenantRepository`
 * cuida só da gravação; este arquivo faz a ponte entre os dois.
 */

/** O que a IA recebe como régua: sempre o Cargo vinculado à vaga (nunca texto livre) e o DNA da organização. */
export function criteriaOf(
  job: { title: string },
  position: Pick<JobPosition, 'title' | 'level' | 'technicalRequirements' | 'behavioralCompetencies'>,
  dna: OrganizationalDNA
): ScreeningCriteriaSnapshot {
  return {
    jobTitle: job.title,
    positionTitle: position.title,
    level: position.level,
    requirements: [...position.technicalRequirements, ...position.behavioralCompetencies],
    pillars: dna.pillars.map(p => ({ id: p.id, name: p.name, weight: p.weight })),
    culturalFitThreshold: dna.culturalFitThreshold
  };
}

/**
 * Hash estável só do que muda a régua da avaliação (requisitos, pilares com peso, corte cultural, nível do Cargo) —
 * não do título da vaga nem do Cargo, que são só rótulos. Editar o Cargo ou o DNA depois de uma leitura muda o hash,
 * e a tela avisa "os critérios mudaram" (src/screening.ts, flag `criteria_changed`) sem precisar reanalisar sozinho.
 */
export function criteriaHashOf(criteria: ScreeningCriteriaSnapshot): string {
  const canonical = JSON.stringify({
    level: criteria.level,
    requirements: criteria.requirements,
    pillars: criteria.pillars,
    culturalFitThreshold: criteria.culturalFitThreshold
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 24);
}

export const RESUME_IMPORT_TAG = 'Currículo importado';

export interface NewCandidateFields {
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
  tags: string[];
  dataOrigin: 'rh';
}

/**
 * Candidato a partir do que a IA extraiu do currículo. Nunca inventa dado: campo que o currículo não trouxe fica em
 * branco (nunca um telefone, cargo ou resumo de mentirinha). `dataOrigin: 'rh'` (com a tag abaixo) deixa o RH corrigir
 * um erro de leitura sem a justificativa que os campos declarados pelo próprio candidato exigem.
 */
export function candidateFromAnalysis(extraction: Pick<ResumeExtraction, 'name' | 'email' | 'phone' | 'location' | 'linkedinUrl' | 'currentRole' | 'yearsOfExperience' | 'education' | 'summary' | 'skills' | 'languages'>): NewCandidateFields {
  if (!extraction.name) throw new Error('candidateFromAnalysis chamado sem nome extraído (deveria ter ficado em needs_data)');
  if (!extraction.email) throw new Error('candidateFromAnalysis chamado sem e-mail extraído (deveria ter ficado em needs_data)');
  return {
    name: extraction.name,
    email: extraction.email,
    phone: extraction.phone ?? '',
    location: extraction.location ?? '',
    linkedinUrl: extraction.linkedinUrl,
    currentRole: extraction.currentRole ?? '',
    yearsOfExperience: extraction.yearsOfExperience ?? 0,
    education: extraction.education ?? '',
    resumeSummary: extraction.summary ?? '',
    skills: extraction.skills,
    languages: extraction.languages,
    tags: [RESUME_IMPORT_TAG],
    dataOrigin: 'rh'
  };
}

/**
 * O nome extraído do currículo bate, ainda que aproximadamente, com o de um candidato já cadastrado com o mesmo
 * e-mail? Um e-mail compartilhado (família, empresa antiga) com um nome completamente diferente é sinal de que o
 * currículo pode não ser da mesma pessoa — melhor pedir confirmação humana do que juntar os dois perfis sozinho.
 */
export function namesCompatible(extractedName: string | undefined, existingName: string): boolean {
  if (!extractedName) return true; // sem nome extraído, não há o que comparar
  const a = normName(extractedName);
  const b = normName(existingName);
  if (!a || !b || a === b) return true;
  const tokensOf = (s: string) => new Set(s.split(/\s+/).filter(t => t.length > 1));
  const tokensA = tokensOf(a);
  const tokensB = tokensOf(b);
  if (tokensA.size === 0 || tokensB.size === 0) return true;
  for (const t of tokensA) if (tokensB.has(t)) return true;
  return false;
}

// ---- decisão em lote (avançar / manter em espera / arquivar) ---------------------------------------------------------------
export interface DecisionPlanInput {
  action: ScreeningDecisionAction;
  /** Etapa em que a TELA viu a candidatura; se já mudou, a decisão é recusada (evita avanço duplo por clique repetido). */
  fromStageId: string;
  currentStageId: string;
  stages: readonly PipelineStage[];
  reason?: string;
}

export interface DecisionPlanResult {
  stageId?: string;
  status?: ApplicationStatus;
  note: string;
}

/** Valida e traduz uma decisão do RH num patch para `TenantRepository.moveApplication`. Nunca decide sozinha: só executa o que o RH escolheu. */
export function planDecision(input: DecisionPlanInput): DecisionPlanResult {
  if (input.fromStageId !== input.currentStageId) {
    throw new ConflictError('Esta candidatura já mudou de etapa (outra pessoa deve ter agido nela). Atualize a lista e tente de novo.');
  }
  if (input.action === 'archive') {
    const reason = (input.reason ?? '').trim();
    if (!reason) throw new ValidationError('Informe o motivo do arquivamento.');
    return { status: 'rejected', note: `Candidatura arquivada pela Triagem de Currículos. Motivo: ${reason}` };
  }
  if (input.action === 'hold') {
    return { status: 'hold', note: 'Candidatura mantida em espera pela Triagem de Currículos.' };
  }
  const next = nextStage(input.stages, input.currentStageId);
  if (!next) throw new ValidationError('Esta candidatura já está na última etapa do funil.');
  return { stageId: next.id, note: `Avançado para a etapa '${next.name}' pela Triagem de Currículos.` };
}

// ---- montagem da lista (pura: a rota só busca os dados e chama isto) ---------------------------------------------------------
/** Bloqueios (a triagem não pode rodar) e avisos (roda, mas com menos precisão), em português, prontos para a tela. */
export function screeningCriteriaInfo(
  position: Pick<JobPosition, 'title' | 'technicalRequirements' | 'behavioralCompetencies'> | undefined,
  dna: OrganizationalDNA | undefined,
  criteriaHash: string
): ScreeningCriteriaInfo {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!dna) blockers.push('Configure o DNA Organizacional antes de usar a triagem de currículos.');
  else if (dna.pillars.length === 0) blockers.push('O DNA Organizacional ainda não tem pilares cadastrados.');
  if (!position) blockers.push('Esta vaga não tem um Cargo vinculado.');
  else if (position.technicalRequirements.length === 0 && position.behavioralCompetencies.length === 0) {
    warnings.push('O Cargo desta vaga não tem requisitos cadastrados: a triagem fica menos precisa.');
  }
  const requirementCount = (position?.technicalRequirements.length ?? 0) + (position?.behavioralCompetencies.length ?? 0);
  return {
    positionTitle: position?.title ?? '',
    requirementCount,
    pillarCount: dna?.pillars.length ?? 0,
    culturalFitThreshold: dna?.culturalFitThreshold ?? null,
    criteriaHash,
    blockers,
    warnings
  };
}

/** A linha crua do banco como a tela precisa (status já efetivo, sem os campos internos de armazenamento). Reusado pela rota de detalhe. */
export const fileOf = (s: ResumeScreening): ScreeningFile => ({
  id: s.id,
  fileName: s.fileName,
  mime: s.mime,
  sizeBytes: s.sizeBytes,
  status: effectiveStatus(s),
  failureCode: s.failureCode,
  failureMessage: s.failureMessage,
  attempts: s.attempts,
  applicationId: s.applicationId,
  candidateId: s.candidateId,
  summary: s.summary,
  uploadedByName: s.uploadedByName,
  uploadedAt: s.uploadedAt,
  analyzedAt: s.analyzedAt
});

export interface BoardSource {
  job: { id: string; title: string; status: string; stages: readonly PipelineStage[] };
  /** Já filtradas para esta vaga (a rota busca a lista inteira do tenant e filtra, como o resto do sistema já faz). */
  applications: readonly SelectionApplication[];
  /** Lista inteira do tenant (para achar nome/cargo/experiência de cada candidato pelo id). */
  candidates: readonly Candidate[];
  /** Lista inteira do tenant; só avaliações reais (source 'gemini') entram no ranking — uma estimativa local nunca entra. */
  evaluations: readonly AIAssistedEvaluation[];
  /** Já filtradas para esta vaga. */
  screenings: readonly ResumeScreening[];
  criteria: ScreeningCriteriaInfo;
}

/** Junta candidaturas, candidatos, avaliações e arquivos numa lista ranqueada, com os selos calculados na hora (nunca gravados). */
export function buildScreeningBoard(src: BoardSource): ScreeningBoard {
  const candidateById = new Map(src.candidates.map(c => [c.id, c] as const));

  // A avaliação real mais recente por candidato nesta vaga (as listas de aiEvaluations vêm ordenadas `seq desc`, então a
  // primeira ocorrência de cada candidato já é a mais nova).
  const evaluationByCandidate = new Map<string, AIAssistedEvaluation>();
  for (const ev of src.evaluations) {
    if (ev.source === 'heuristic' || ev.jobOpeningId !== src.job.id) continue;
    if (!evaluationByCandidate.has(ev.candidateId)) evaluationByCandidate.set(ev.candidateId, ev);
  }

  // O arquivo mais recente por candidatura (mesma regra da avaliação acima: `src.screenings` também vem `seq desc`,
  // então a primeira ocorrência já é a mais nova). Sem o `has()`, um currículo antigo da mesma candidatura — por
  // exemplo, o que ficou "failed" antes de uma nova tentativa dar certo — sobrescreveria o mais novo no fim do laço.
  const screeningByApplication = new Map<string, ResumeScreening>();
  const pending: ScreeningFile[] = [];
  for (const s of src.screenings) {
    if (s.applicationId) {
      if (!screeningByApplication.has(s.applicationId)) screeningByApplication.set(s.applicationId, s);
    } else {
      pending.push(fileOf(s));
    }
  }

  const rows: ScreeningRow[] = src.applications.flatMap(app => {
    const candidate = candidateById.get(app.candidateId);
    const evaluation = evaluationByCandidate.get(app.candidateId);
    const screening = screeningByApplication.get(app.id);
    const file = screening ? fileOf(screening) : undefined;
    if (!file && candidate?.tags.includes(RESUME_IMPORT_TAG)) return [];
    const flags = deriveFlags(screening?.summary, {
      culturalFitThreshold: src.criteria.culturalFitThreshold,
      criteriaHash: src.criteria.criteriaHash
    });
    if (!file) flags.push('no_resume');
    return [{
      applicationId: app.id,
      candidateId: app.candidateId,
      candidateName: candidate?.name ?? '(candidato removido)',
      currentRole: candidate?.currentRole ?? '',
      yearsOfExperience: candidate?.yearsOfExperience ?? 0,
      location: candidate?.location ?? '',
      stageId: app.currentStageId,
      applicationStatus: app.status,
      appliedAt: app.appliedAt,
      evaluation: evaluation && {
        id: evaluation.id,
        overallFitScore: evaluation.overallFitScore,
        technicalFitScore: evaluation.technicalFitScore,
        culturalFitScore: evaluation.culturalFitScore,
        evaluatedAt: evaluation.evaluatedAt,
        humanReviewerDecision: evaluation.humanReviewerDecision
      },
      file,
      flags
    }];
  });

  return {
    jobId: src.job.id,
    jobTitle: src.job.title,
    jobClosed: src.job.status === 'filled' || src.job.status === 'cancelled',
    criteria: src.criteria,
    rows: rankRows(rows),
    pending,
    fileCount: src.screenings.length
  };
}
