import { ValidationError } from './errors.js';
import type { AiLimitPolicy, AiSettings } from '../src/types.js';

/** Pure rules of the AI credit control (no database): cost estimate, projection, allowance and settings validation. */

export type AiPriceSettings = Pick<AiSettings, 'priceInputUsd' | 'priceOutputUsd' | 'usdBrlRate'>;

export const pricesReady = (s: AiPriceSettings): boolean =>
  s.priceInputUsd != null && s.priceOutputUsd != null && !!s.usdBrlRate;

/** Estimated cost in R$ of one call. 0 when nothing was processed; null when there was consumption but no price was informed. */
export function estimateCostBrl(inputTokens: number, outputTokens: number, s: AiPriceSettings): number | null {
  if (inputTokens + outputTokens === 0) return 0;
  if (!pricesReady(s)) return null;
  return ((inputTokens * s.priceInputUsd! + outputTokens * s.priceOutputUsd!) / 1_000_000) * s.usdBrlRate!;
}

/** Linear projection of the month's cost. null while there is less than one day of data (a forecast would be noise). */
export function projectMonthCostBrl(costSoFar: number, elapsedDays: number, daysInMonth: number): number | null {
  if (!(elapsedDays >= 1)) return null;
  return (costSoFar / elapsedDays) * daysInMonth;
}

// ---------------------------------------------------------------------------------------------------------------------
// Allowance: may this organization use the AI right now?
// ---------------------------------------------------------------------------------------------------------------------
export type AiSkipReason = 'paused' | 'limit_reached' | 'budget_reached';

export interface AllowanceInput {
  enabled: boolean;
  onLimit: AiLimitPolicy;
  /** Limit of the organization (own or platform default); null = no limit. */
  orgLimit: number | null;
  /** Evaluations that used the AI this month for this organization. */
  orgUsed: number;
  monthlyBudgetBrl: number | null;
  /** Estimated cost of the whole platform this month. */
  monthCostBrl: number;
}

export type Allowance =
  | { mode: 'allow' }
  | { mode: 'estimate' | 'block'; reason: AiSkipReason; message: string };

export function decideAllowance(i: AllowanceInput): Allowance {
  // Pausing is an emergency stop: it never blocks the user, it just avoids any cost.
  if (!i.enabled) {
    return { mode: 'estimate', reason: 'paused', message: 'A IA está pausada pela administração da plataforma.' };
  }
  const deny = (reason: AiSkipReason, message: string): Allowance => ({ mode: i.onLimit, reason, message });
  if (i.orgLimit != null && i.orgUsed >= i.orgLimit) {
    return deny(
      'limit_reached',
      `O limite mensal de avaliações com IA desta organização foi atingido (${i.orgUsed} de ${i.orgLimit}). ` +
      'Fale com a administração da plataforma para liberar mais avaliações.'
    );
  }
  if (i.monthlyBudgetBrl != null && i.monthCostBrl >= i.monthlyBudgetBrl) {
    return deny('budget_reached', 'O orçamento mensal de IA da plataforma foi atingido. Fale com a administração da plataforma.');
  }
  return { mode: 'allow' };
}

// ---------------------------------------------------------------------------------------------------------------------
// Settings validation (what the Conta Mãe may change)
// ---------------------------------------------------------------------------------------------------------------------
interface FieldSpec {
  column: string;
  label: string;
  parse: (value: unknown, label: string) => unknown;
}

/** Empty / null clears the field; otherwise it must be a number inside [min, max]. */
const numberOrNull = (min: number, max: number, integer = false, minExclusive = false) => (value: unknown, label: string) => {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || n > max || (minExclusive ? n <= min : n < min)) {
    throw new ValidationError(
      `${label}: informe ${integer ? 'um número inteiro' : 'um número'} ${minExclusive ? 'maior que' : 'entre'} ${min}${minExclusive ? '' : ` e ${max}`}.`
    );
  }
  return n;
};

const FIELDS: Record<string, FieldSpec> = {
  enabled: {
    column: 'enabled',
    label: 'IA ligada',
    parse: (v, label) => {
      if (typeof v !== 'boolean') throw new ValidationError(`${label}: valor inválido.`);
      return v;
    }
  },
  model: {
    column: 'model',
    label: 'Modelo de IA',
    parse: (v, label) => {
      if (v === null || v === undefined || String(v).trim() === '') return null;
      const s = String(v).trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(s)) throw new ValidationError(`${label}: use apenas letras, números, ponto, hífen e sublinhado.`);
      return s;
    }
  },
  monthlyBudgetBrl: { column: 'monthly_budget_brl', label: 'Teto de gasto do mês', parse: numberOrNull(0, 99_999_999) },
  defaultOrgMonthlyLimit: { column: 'default_org_monthly_limit', label: 'Limite padrão por organização', parse: numberOrNull(0, 1_000_000, true) },
  onLimit: {
    column: 'on_limit',
    label: 'Ao atingir o limite',
    parse: (v, label) => {
      if (v !== 'estimate' && v !== 'block') throw new ValidationError(`${label}: escolha "estimate" ou "block".`);
      return v;
    }
  },
  priceInputUsd: { column: 'price_input_usd', label: 'Preço do texto enviado', parse: numberOrNull(0, 100_000) },
  priceOutputUsd: { column: 'price_output_usd', label: 'Preço do texto respondido', parse: numberOrNull(0, 100_000) },
  usdBrlRate: { column: 'usd_brl_rate', label: 'Cotação do dólar', parse: numberOrNull(0, 100, false, true) }
};

const PRICE_KEYS = ['priceInputUsd', 'priceOutputUsd', 'usdBrlRate'];

export interface SettingsChange {
  /** column -> value, only for fields present in the request. */
  columns: Record<string, unknown>;
  /** Human labels of what changed, for the audit trail. */
  labels: string[];
  touchesPrices: boolean;
}

export function parseSettingsPatch(body: unknown): SettingsChange {
  const src = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const columns: Record<string, unknown> = {};
  const labels: string[] = [];
  for (const [key, spec] of Object.entries(FIELDS)) {
    if (!(key in src)) continue;
    columns[spec.column] = spec.parse(src[key], spec.label);
    labels.push(spec.label);
  }
  if (labels.length === 0) throw new ValidationError('Nenhuma alteração informada.');
  return { columns, labels, touchesPrices: PRICE_KEYS.some(k => k in src) };
}

/** Limit of ONE organization: a non-negative whole number, or null to go back to the platform default. */
export function parseOrgLimit(value: unknown): number | null {
  return numberOrNull(0, 1_000_000, true)(value, 'Limite da organização') as number | null;
}
