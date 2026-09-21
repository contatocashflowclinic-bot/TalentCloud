/**
 * Retenção de Talentos & Clima: regras puras compartilhadas pelo servidor (que calcula e valida) e pela tela (que
 * apenas rotula). Nada aqui toca banco, rede ou DOM.
 */
import {
  CLIMATE_CATEGORIES,
  type AlertStatus,
  type ClimateCategory,
  type EnpsBreakdown,
  type EnpsZone,
  type RiskLevel
} from './types.js';

/**
 * Anonimato: nenhum resultado de pesquisa aparece para um grupo com menos respostas do que isto (a campanha inteira e
 * cada departamento). Com poucas respostas, "quem disse o quê" deixa de ser secreto.
 */
export const MIN_GROUP = 5;

export const RISK_LEVELS: readonly RiskLevel[] = ['Baixo', 'Médio', 'Alto'];

export const ACTIVE_ALERT_STATUSES: readonly AlertStatus[] = ['open', 'monitoring'];
export const isActiveAlert = (status: AlertStatus): boolean => ACTIVE_ALERT_STATUSES.includes(status);

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  open: 'Aberto',
  monitoring: 'Em acompanhamento',
  resolved: 'Resolvido',
  dismissed: 'Descartado',
  left: 'Colaborador saiu'
};

export const CATEGORY_LABEL: Record<ClimateCategory, string> = {
  lideranca: 'Liderança',
  cultura: 'Cultura',
  crescimento: 'Crescimento',
  remuneracao: 'Remuneração',
  ambiente: 'Ambiente'
};

export const ZONE_LABEL: Record<EnpsZone, string> = {
  critical: 'Precisa melhorar',
  good: 'Zona de Qualidade',
  great: 'Zona de Destaque',
  excellent: 'Zona de Excelência'
};

/** Promotores dão 9–10, neutros 7–8 e detratores 0–6. */
export const isPromoter = (score: number): boolean => score >= 9;
export const isDetractor = (score: number): boolean => score <= 6;

export const sentimentOf = (score: number): 'positive' | 'neutral' | 'negative' =>
  isPromoter(score) ? 'positive' : isDetractor(score) ? 'negative' : 'neutral';

/** eNPS = % de promotores − % de detratores, de −100 a +100. `null` quando não há respostas. */
export function enpsOf(scores: readonly number[]): EnpsBreakdown | null {
  if (scores.length === 0) return null;
  const promoters = scores.filter(isPromoter).length;
  const detractors = scores.filter(isDetractor).length;
  return {
    score: Math.round(((promoters - detractors) / scores.length) * 100),
    promoters,
    passives: scores.length - promoters - detractors,
    detractors,
    responses: scores.length
  };
}

export function zoneOf(score: number): EnpsZone {
  if (score >= 70) return 'excellent';
  if (score >= 30) return 'great';
  if (score >= 0) return 'good';
  return 'critical';
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Média (1 casa) de cada categoria. `null` sem respostas. */
export function categoryAverages(ratings: readonly Record<ClimateCategory, number>[]): Record<ClimateCategory, number> | null {
  if (ratings.length === 0) return null;
  return Object.fromEntries(
    CLIMATE_CATEGORIES.map(c => [c, round1(ratings.reduce((sum, r) => sum + Number(r[c] ?? 0), 0) / ratings.length)])
  ) as Record<ClimateCategory, number>;
}
