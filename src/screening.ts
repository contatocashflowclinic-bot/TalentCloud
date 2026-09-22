import type {
  EvidenceLevel,
  PipelineStage,
  RequirementStatus,
  ResumeAnalysis,
  ResumeScreeningStatus,
  ScreeningFlag,
  ScreeningRow,
  ScreeningSummary
} from './types.js';
import { MEDIUM_FIT_MIN } from './utils/aiEvaluation.js';

/**
 * Regras da Triagem Inteligente de Currículos, em funções puras. O servidor (que calcula e grava) e a tela (que mostra e filtra)
 * usam este mesmo arquivo, então um número nunca difere entre os dois. A IA só LÊ e dá a nota técnica; a aderência cultural, a
 * nota geral e os selos são calculados aqui, com a mesma fórmula para todos os currículos.
 */

/** Peso de cada parte da nota geral quando a cultura é totalmente verificável; se o currículo mostra pouco dela, ela pesa menos. */
export const OVERALL_WEIGHTS = { technical: 0.6, cultural: 0.4 } as const;
/** Quanto cada nível de evidência conta na aderência cultural (nível "none" não conta: sem sinal, sem nota). */
export const EVIDENCE_FACTOR: Record<EvidenceLevel, number> = { high: 1, medium: 0.7, low: 0.35, none: 0 };
/** Abaixo desta cobertura dos pilares, a cultura é "não verificável pelo currículo" (confirmar na entrevista). */
export const MIN_CULTURAL_COVERAGE = 0.5;
/** Piso técnico do selo "segunda olhada": não destaca quem não tem nenhuma base para a vaga. */
export const SECOND_LOOK_TECH_FLOOR = 40;
/** Diferença (em pontos) entre a nota técnica da IA e o que os requisitos mostram, a partir da qual o RH é avisado. */
export const SCORE_INCONSISTENCY_GAP = 35;
/** Uma leitura "em andamento" há mais que isto foi abandonada (a função da Vercel morre aos 60 s). */
export const ANALYSIS_LEASE_MS = 90_000;
/** Tentativas automáticas por arquivo; depois disso só com "Reanalisar", que é explícito e conta no limite mensal. */
export const MAX_AUTO_ATTEMPTS = 3;

const clampScore = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface PillarInput {
  weight: number;
  score: number;
  confidence: EvidenceLevel;
}

/**
 * Aderência cultural: média dos pilares ponderada pelo peso do DNA (1 a 5) e pelo nível de evidência. `coverage` (0 a 1) diz
 * quanto do DNA o currículo permitiu verificar. Sem nenhuma evidência a nota é `null` ("não verificável"), nunca um número baixo.
 */
export function culturalFromPillars(pillars: readonly PillarInput[]): { score: number | null; coverage: number } {
  const total = pillars.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
  if (total <= 0) return { score: null, coverage: 0 };
  let weighted = 0;
  let evidenced = 0;
  for (const p of pillars) {
    const w = Math.max(0, p.weight) * EVIDENCE_FACTOR[p.confidence];
    weighted += w * clampScore(p.score);
    evidenced += w;
  }
  if (evidenced <= 0) return { score: null, coverage: 0 };
  return { score: clampScore(weighted / evidenced), coverage: round2(Math.min(1, evidenced / total)) };
}

/** Nota geral: 60% técnica e 40% cultural, com o peso cultural reduzido pela cobertura. Sem cultura verificável, vale só a técnica. */
export function computeOverall(technical: number, cultural: number | null, coverage: number): number {
  if (cultural === null || coverage <= 0) return clampScore(technical);
  const wc = OVERALL_WEIGHTS.cultural * Math.min(1, coverage);
  return clampScore((OVERALL_WEIGHTS.technical * technical + wc * cultural) / (OVERALL_WEIGHTS.technical + wc));
}

export function requirementCounts(requirements: ReadonlyArray<{ status: RequirementStatus }>) {
  const counts = { total: requirements.length, met: 0, partial: 0, notMet: 0, noEvidence: 0 };
  for (const r of requirements) {
    if (r.status === 'met') counts.met++;
    else if (r.status === 'partial') counts.partial++;
    else if (r.status === 'not_met') counts.notMet++;
    else counts.noEvidence++;
  }
  return counts;
}

/** O que os requisitos, sozinhos, sugerem para a nota técnica (0 a 100); serve para detectar uma nota técnica destoante. */
export function requirementScore(counts: ReturnType<typeof requirementCounts>): number | null {
  return counts.total > 0 ? clampScore((100 * (counts.met + 0.5 * counts.partial)) / counts.total) : null;
}

export function summaryOf(a: Pick<ResumeAnalysis, 'overallScore' | 'technicalScore' | 'culturalScore' | 'culturalCoverage' | 'requirements' | 'documentQuality' | 'instructionsInDocument' | 'hiddenText' | 'criteriaHash'>): ScreeningSummary {
  return {
    overallScore: a.overallScore,
    technicalScore: a.technicalScore,
    culturalScore: a.culturalScore,
    culturalCoverage: a.culturalCoverage,
    requirements: requirementCounts(a.requirements),
    documentQuality: a.documentQuality,
    instructionsInDocument: a.instructionsInDocument,
    hiddenText: a.hiddenText,
    criteriaHash: a.criteriaHash
  };
}

export interface FlagContext {
  /** Corte de aderência cultural do DNA atual (null = DNA sem corte). */
  culturalFitThreshold: number | null;
  /** Hash dos critérios (Cargo + DNA) de agora; se difere do da leitura, o RH é avisado. */
  criteriaHash: string;
}

/** Selos derivados na leitura: refletem o DNA e o Cargo de agora, não os de quando o currículo foi lido. */
export function deriveFlags(summary: ScreeningSummary | undefined, ctx: FlagContext): ScreeningFlag[] {
  if (!summary) return [];
  const flags: ScreeningFlag[] = [];
  const { overallScore, technicalScore, culturalScore, culturalCoverage, requirements } = summary;
  const culturalKnown = culturalScore !== null && culturalCoverage >= MIN_CULTURAL_COVERAGE;

  if (!culturalKnown) flags.push('cultural_unverified');
  else if (ctx.culturalFitThreshold !== null) {
    if (culturalScore! < ctx.culturalFitThreshold) flags.push('below_cultural_cut');
    else if (overallScore < MEDIUM_FIT_MIN && technicalScore >= SECOND_LOOK_TECH_FLOOR) flags.push('second_look');
  }
  if (requirements.notMet > 0) flags.push('missing_requirements');
  if (summary.documentQuality === 'partial' || (requirements.total > 0 && requirements.noEvidence / requirements.total >= 0.5)) {
    flags.push('incomplete_resume');
  }
  if (summary.instructionsInDocument || summary.hiddenText) flags.push('injection_suspected');
  const fromRequirements = requirementScore(requirements);
  if (fromRequirements !== null && Math.abs(technicalScore - fromRequirements) > SCORE_INCONSISTENCY_GAP) flags.push('score_inconsistent');
  if (summary.criteriaHash !== ctx.criteriaHash) flags.push('criteria_changed');
  return flags;
}

/** "Lendo" sem fôlego (função morta) volta a "guardado": a leitura pode ser retomada sem cron. */
export function effectiveStatus(
  row: { status: ResumeScreeningStatus; analyzingSince?: string | null },
  now: number = Date.now()
): ResumeScreeningStatus {
  if (row.status !== 'analyzing') return row.status;
  const since = row.analyzingSince ? Date.parse(row.analyzingSince) : NaN;
  return Number.isFinite(since) && now - since <= ANALYSIS_LEASE_MS ? 'analyzing' : 'uploaded';
}

/** Próxima etapa da vaga na ordem do funil (undefined quando já está na última). */
export function nextStage(stages: readonly PipelineStage[], currentStageId: string): PipelineStage | undefined {
  const ordered = [...stages].sort((a, b) => a.order - b.order);
  const at = ordered.findIndex(s => s.id === currentStageId);
  return at >= 0 ? ordered[at + 1] : undefined;
}

// ---- lista: ordenação e filtros -------------------------------------------------------------------------------------------
export type ScreeningFilter = 'all' | 'high' | 'medium' | 'low' | 'second_look' | 'review' | 'no_resume' | 'archived';

const REVIEW_FLAGS: readonly ScreeningFlag[] = ['incomplete_resume', 'injection_suspected', 'score_inconsistent', 'criteria_changed'];

export function matchesFilter(row: ScreeningRow, filter: ScreeningFilter): boolean {
  const archived = row.applicationStatus === 'rejected';
  if (filter === 'archived') return archived;
  if (filter === 'all') return true;
  if (archived) return false;
  const overall = row.evaluation?.overallFitScore;
  switch (filter) {
    case 'high': return overall !== undefined && overall >= 80;
    case 'medium': return overall !== undefined && overall >= 60 && overall < 80;
    case 'low': return overall !== undefined && overall < 60;
    case 'second_look': return row.flags.includes('second_look');
    case 'review': return row.flags.some(f => REVIEW_FLAGS.includes(f));
    case 'no_resume': return row.flags.includes('no_resume');
  }
}

/** Maior nota geral primeiro; quem ainda não tem avaliação vem depois, do mais recente ao mais antigo. */
export function rankRows(rows: readonly ScreeningRow[]): ScreeningRow[] {
  return [...rows].sort((a, b) => {
    const sa = a.evaluation?.overallFitScore;
    const sb = b.evaluation?.overallFitScore;
    if (sa !== undefined && sb !== undefined && sa !== sb) return sb - sa;
    if ((sa === undefined) !== (sb === undefined)) return sa === undefined ? 1 : -1;
    return Date.parse(b.appliedAt) - Date.parse(a.appliedAt);
  });
}

// ---- permissões (as mesmas no servidor e na tela) ---------------------------------------------------------------------------
/** Todas as permissões da lista são exigidas (não "qualquer uma"). Sem o módulo de IA, as de `ai_evaluation` não existem. */
export const SCREENING_PERMISSIONS = {
  view: ['selection:view', 'candidates:view', 'ai_evaluation:view'],
  upload: ['selection:create', 'candidates:create', 'ai_evaluation:create'],
  decide: ['selection:edit', 'ai_evaluation:edit']
} as const;

export function screeningAccess(permissions: readonly string[], aiEnabled: boolean) {
  const has = (list: readonly string[]) => list.every(p => permissions.includes(p));
  return {
    canView: aiEnabled && has(SCREENING_PERMISSIONS.view),
    canUpload: aiEnabled && has(SCREENING_PERMISSIONS.upload),
    canDecide: aiEnabled && has(SCREENING_PERMISSIONS.decide)
  };
}

// ---- rótulos em português -----------------------------------------------------------------------------------------------------
export type FlagTone = 'good' | 'info' | 'warn' | 'bad';

export const FLAG_LABEL: Record<ScreeningFlag, { label: string; hint: string; tone: FlagTone }> = {
  second_look: {
    label: 'Segunda olhada',
    hint: 'Boa aderência ao DNA, mas a nota geral ficou baixa por requisitos técnicos. Vale conferir o currículo antes de decidir.',
    tone: 'good'
  },
  below_cultural_cut: { label: 'Abaixo do corte do DNA', hint: 'A aderência cultural estimada ficou abaixo do corte definido no DNA da organização.', tone: 'warn' },
  cultural_unverified: {
    label: 'Cultura a confirmar',
    hint: 'O currículo mostra pouco sobre o DNA. A aderência cultural fica para a entrevista e pesa pouco na nota geral.',
    tone: 'info'
  },
  missing_requirements: { label: 'Requisitos faltando', hint: 'O currículo contradiz ao menos um requisito do Cargo.', tone: 'warn' },
  incomplete_resume: { label: 'Currículo incompleto', hint: 'O arquivo tem pouca informação, ou não permite verificar boa parte dos requisitos.', tone: 'info' },
  injection_suspected: {
    label: 'Texto suspeito',
    hint: 'O arquivo contém texto oculto ou instruções dirigidas à IA. Revise o currículo com atenção.',
    tone: 'bad'
  },
  score_inconsistent: { label: 'Conferir a nota', hint: 'A nota técnica destoa do que os requisitos mostram. Confira o detalhe.', tone: 'warn' },
  criteria_changed: { label: 'Critérios mudaram', hint: 'O Cargo ou o DNA mudaram depois da leitura. Considere reanalisar.', tone: 'info' },
  no_resume: { label: 'Sem currículo', hint: 'Esta candidatura não tem arquivo de currículo. A nota, se houver, vem só dos campos preenchidos.', tone: 'info' }
};

export const STATUS_LABEL: Record<ResumeScreeningStatus, string> = {
  uploaded: 'Aguardando leitura',
  analyzing: 'Lendo com IA',
  analyzed: 'Lido',
  needs_data: 'Precisa de dados',
  failed: 'Não foi possível ler'
};

export const REQUIREMENT_LABEL: Record<RequirementStatus, string> = {
  met: 'Atende',
  partial: 'Atende em parte',
  not_met: 'Não atende',
  no_evidence: 'Sem evidência no currículo'
};

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  high: 'Evidência forte',
  medium: 'Evidência moderada',
  low: 'Pouca evidência',
  none: 'Sem evidência'
};
