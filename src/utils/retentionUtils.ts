import type { AlertStatus, CampaignStatus, EnpsZone, RiskLevel, TurnoverRiskAlert } from '../types.js';
import { isActiveAlert } from '../retention.js';

export const RISK_STYLE: Record<RiskLevel, string> = {
  Alto: 'bg-rose-100 text-rose-800',
  Médio: 'bg-amber-100 text-amber-800',
  Baixo: 'bg-blue-100 text-blue-800'
};

export const RISK_WEIGHT: Record<RiskLevel, number> = { Alto: 3, Médio: 2, Baixo: 1 };

export const ALERT_STATUS_STYLE: Record<AlertStatus, string> = {
  open: 'bg-slate-100 text-slate-700',
  monitoring: 'bg-indigo-100 text-indigo-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  dismissed: 'bg-slate-100 text-slate-500',
  left: 'bg-rose-100 text-rose-800'
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Rascunho',
  open: 'Aberta',
  closed: 'Encerrada'
};

export const CAMPAIGN_STATUS_STYLE: Record<CampaignStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  open: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-slate-200 text-slate-700'
};

export const ZONE_STYLE: Record<EnpsZone, string> = {
  critical: 'bg-rose-500/20 text-rose-200',
  good: 'bg-amber-500/20 text-amber-200',
  great: 'bg-sky-500/20 text-sky-200',
  excellent: 'bg-emerald-500/20 text-emerald-300'
};

/** Same zone colors on a light background. */
export const ZONE_STYLE_LIGHT: Record<EnpsZone, string> = {
  critical: 'bg-rose-100 text-rose-800',
  good: 'bg-amber-100 text-amber-800',
  great: 'bg-sky-100 text-sky-800',
  excellent: 'bg-emerald-100 text-emerald-800'
};

export const formatEnps = (score: number): string => (score > 0 ? `+${score}` : `${score}`);

/** An alert that nobody has worked on yet (only its "opened" line in the history). */
export const isUntouchedAlert = (alert: TurnoverRiskAlert): boolean =>
  alert.status === 'open' && alert.history.every(h => h.kind === 'created');

/** Active first (highest risk first), then closed ones by most recent change. */
export function sortAlerts(alerts: readonly TurnoverRiskAlert[]): TurnoverRiskAlert[] {
  return [...alerts].sort((a, b) => {
    const activeDiff = Number(isActiveAlert(b.status)) - Number(isActiveAlert(a.status));
    if (activeDiff !== 0) return activeDiff;
    if (isActiveAlert(a.status)) {
      const riskDiff = RISK_WEIGHT[b.riskLevel] - RISK_WEIGHT[a.riskLevel];
      if (riskDiff !== 0) return riskDiff;
    }
    return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
  });
}

/** Suggested period for a new survey: the current quarter, e.g. "2026-Q3". */
export function currentQuarter(day: string): string {
  const [year, month] = day.split('-');
  return `${year}-Q${Math.floor((Number(month) - 1) / 3) + 1}`;
}
