import type { AIAssistedEvaluation } from '../types.js';

/** True when the scores came from the local rule-based estimate, not from an AI model. */
export const isLocalEstimate = (e?: Pick<AIAssistedEvaluation, 'source'> | null): boolean => e?.source === 'heuristic';

/** Short notice for summaries, shares and exports where the full banner does not fit. */
export const LOCAL_ESTIMATE_NOTICE = 'Estimativa local por regras simples — NÃO é uma avaliação de IA.';

export const HIGH_FIT_MIN = 80;
export const MEDIUM_FIT_MIN = 60;

export type FitLevel = 'high' | 'medium' | 'low';

export const fitLevel = (score: number): FitLevel => (score >= HIGH_FIT_MIN ? 'high' : score >= MEDIUM_FIT_MIN ? 'medium' : 'low');

export const FIT_LEVEL_LABEL: Record<FitLevel, string> = {
  high: 'Alta Aderência',
  medium: 'Aderência Média',
  low: 'Aderência Baixa'
};
