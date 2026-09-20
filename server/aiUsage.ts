import { getPool, Queryable } from './db/pool.js';
import { fromRow } from './db/crud.js';
import { newId } from './ids.js';
import type { AiOrgUsage, AiSettings, AiUsageOverview, AiUsagePeriod } from '../src/types.js';
import {
  decideAllowance,
  estimateCostBrl,
  pricesReady,
  projectMonthCostBrl,
  type Allowance,
  type AiPriceSettings,
  type SettingsChange
} from './aiCost.js';
import { isGeminiConfigured, resolveModel } from './gemini.js';

/**
 * Credit / consumption control of the AI (Conta Mãe). Every evaluation request leaves one row in ai_usage_events;
 * the panel, the monthly limits and the spending ceiling all read from there. Months are calendar months in São Paulo time.
 */
const TZ = 'America/Sao_Paulo';
const MONTH_START_SQL = `(date_trunc('month', now() at time zone '${TZ}') at time zone '${TZ}')`;
const ORGS_SHOWN = 200;

export const PERIOD_LABEL: Record<AiUsagePeriod, string> = {
  this_month: 'Este mês',
  last_month: 'Mês passado',
  last_30: 'Últimos 30 dias'
};

export const isPeriod = (v: unknown): v is AiUsagePeriod => typeof v === 'string' && v in PERIOD_LABEL;

// ---- settings ---------------------------------------------------------------------------------------------------
const SETTINGS_COLUMNS =
  'enabled, model, monthly_budget_brl, default_org_monthly_limit, on_limit, price_input_usd, price_output_usd, usd_brl_rate, ' +
  'prices_updated_at, updated_at, updated_by';

export async function getAiSettings(db: Queryable = getPool()): Promise<AiSettings> {
  let { rows } = await db.query(`select ${SETTINGS_COLUMNS} from public.ai_settings where id`);
  if (!rows[0]) {
    // The migration seeds this single row; recreate it if someone removed it.
    await db.query('insert into public.ai_settings (id) values (true) on conflict (id) do nothing');
    rows = (await db.query(`select ${SETTINGS_COLUMNS} from public.ai_settings where id`)).rows;
  }
  return fromRow<AiSettings>({}, rows[0]);
}

/** Column names come from the static field table in aiCost.ts, never from the request. */
export async function updateAiSettings(change: SettingsChange, actorName: string, db: Queryable = getPool()): Promise<AiSettings> {
  const columns = Object.keys(change.columns);
  const sets = columns.map((c, i) => `${c} = $${i + 1}`);
  sets.push('updated_at = now()', `updated_by = $${columns.length + 1}`);
  if (change.touchesPrices) sets.push('prices_updated_at = now()');
  await db.query(`update public.ai_settings set ${sets.join(', ')} where id`, [...columns.map(c => change.columns[c]), actorName]);
  return getAiSettings(db);
}

/** `null` removes the organization's own limit (the platform default applies again). */
export async function setOrgLimit(tenantId: string, limit: number | null, actorName: string, db: Queryable = getPool()): Promise<void> {
  if (limit === null) {
    await db.query('delete from public.ai_org_limits where tenant_id = $1', [tenantId]);
    return;
  }
  await db.query(
    `insert into public.ai_org_limits (tenant_id, monthly_limit, updated_by) values ($1, $2, $3)
     on conflict (tenant_id) do update set monthly_limit = excluded.monthly_limit, updated_at = now(), updated_by = excluded.updated_by`,
    [tenantId, limit, actorName]
  );
}

// ---- allowance + recording (used by the evaluation route) ---------------------------------------------------------
export interface AllowanceResult {
  decision: Allowance;
  settings: AiSettings;
  model: string;
}

/** May this organization use the AI right now? Looks at the pause switch, its monthly limit and the platform ceiling. */
export async function assessAllowance(tenantId: string, db: Queryable = getPool()): Promise<AllowanceResult> {
  const settings = await getAiSettings(db);
  const model = resolveModel(settings.model);
  const { rows } = await db.query(
    `select
       (select count(*)::int from public.ai_usage_events
         where tenant_id = $1 and outcome = 'ai' and occurred_at >= ${MONTH_START_SQL})              as org_used,
       (select coalesce(sum(cost_brl), 0) from public.ai_usage_events
         where occurred_at >= ${MONTH_START_SQL})                                                    as month_cost,
       (select monthly_limit from public.ai_org_limits where tenant_id = $1)                         as custom_limit`,
    [tenantId]
  );
  const r = rows[0];
  const decision = decideAllowance({
    enabled: settings.enabled,
    onLimit: settings.onLimit,
    orgLimit: r.custom_limit ?? settings.defaultOrgMonthlyLimit ?? null,
    orgUsed: r.org_used,
    monthlyBudgetBrl: settings.monthlyBudgetBrl ?? null,
    monthCostBrl: r.month_cost
  });
  return { decision, settings, model };
}

export interface UsageRecord {
  tenantId: string;
  userId?: string;
  userName?: string;
  candidateId?: string;
  jobOpeningId?: string;
  evaluationId?: string;
  model: string;
  outcome: 'ai' | 'failed' | 'estimate' | 'blocked';
  reason?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
}

/** Best effort: failing to record consumption must never break the evaluation the user asked for. */
export async function recordUsage(u: UsageRecord, prices: AiPriceSettings, db: Queryable = getPool()): Promise<void> {
  const input = u.inputTokens ?? 0;
  const output = u.outputTokens ?? 0;
  try {
    await db.query(
      `insert into public.ai_usage_events
         (id, tenant_id, user_id, user_name, candidate_id, job_opening_id, evaluation_id, model, outcome, reason,
          input_tokens, output_tokens, duration_ms, cost_brl)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        newId('aiu'), u.tenantId, u.userId ?? null, u.userName ?? null, u.candidateId ?? null, u.jobOpeningId ?? null,
        u.evaluationId ?? null, u.model, u.outcome, u.reason ?? null, input, output, u.durationMs ?? null,
        estimateCostBrl(input, output, prices)
      ]
    );
  } catch (err) {
    console.error('[AI] Não foi possível registrar o consumo desta avaliação:', err);
  }
}

// ---- the panel --------------------------------------------------------------------------------------------------
/** 'YYYY-MM-DD' for every day from `from` to `to` (inclusive). */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function getUsageOverview(period: AiUsagePeriod, db: Queryable = getPool()): Promise<AiUsageOverview> {
  const {
    rows: [b]
  } = await db.query(
    `with n as (select now() at time zone '${TZ}' as ln)
     select
       (date_trunc('month', ln) at time zone '${TZ}')                                        as month_start,
       ((date_trunc('month', ln) + interval '1 month') at time zone '${TZ}')                 as next_month_start,
       ((date_trunc('month', ln) - interval '1 month') at time zone '${TZ}')                 as prev_month_start,
       ((date_trunc('day', ln) - interval '29 days') at time zone '${TZ}')                   as last30_start,
       ((date_trunc('day', ln) + interval '1 day') at time zone '${TZ}')                     as next_day_start,
       extract(epoch from (now() - (date_trunc('month', ln) at time zone '${TZ}'))) / 86400  as elapsed_days,
       extract(day from (date_trunc('month', ln) + interval '1 month' - interval '1 day'))::int as days_in_month
     from n`
  );

  const range =
    period === 'this_month' ? { from: b.month_start, to: b.next_month_start }
    : period === 'last_month' ? { from: b.prev_month_start, to: b.month_start }
    : { from: b.last30_start, to: b.next_day_start };
  const inRange = 'occurred_at >= $1::timestamptz and occurred_at < $2::timestamptz';
  const p = [range.from, range.to];

  const [settings, days, totals, daily, repeated, unreviewed, orgs, monthRows, last, lastMonth, limits] = await Promise.all([
    getAiSettings(db),
    db.query(
      `select to_char($1::timestamptz at time zone '${TZ}', 'YYYY-MM-DD') as from_day,
              to_char(least($2::timestamptz - interval '1 second', now()) at time zone '${TZ}', 'YYYY-MM-DD') as to_day`,
      p
    ),
    db.query(
      `select
         count(*) filter (where outcome = 'ai')::int       as evaluations,
         count(*) filter (where outcome = 'estimate')::int as estimates,
         count(*) filter (where outcome = 'failed')::int   as failures,
         count(*) filter (where outcome = 'blocked')::int  as blocked,
         coalesce(sum(cost_brl), 0)                        as cost_brl,
         count(*) filter (where cost_brl is null)::int     as unpriced
       from public.ai_usage_events where ${inRange}`,
      p
    ),
    db.query(
      `select to_char(occurred_at at time zone '${TZ}', 'YYYY-MM-DD') as day,
              count(*) filter (where outcome = 'ai')::int as evaluations,
              coalesce(sum(cost_brl), 0)                  as cost_brl
         from public.ai_usage_events where ${inRange} group by 1`,
      p
    ),
    // A repeat = the same candidate for the same job evaluated with AI again (looks at the whole history up to the period end)
    db.query(
      `select count(*)::int as repeated, coalesce(sum(cost_brl), 0) as repeated_cost
         from (select occurred_at, cost_brl,
                      row_number() over (partition by tenant_id, candidate_id, job_opening_id order by occurred_at, seq) as rn
                 from public.ai_usage_events
                where outcome = 'ai' and candidate_id is not null and job_opening_id is not null
                  and occurred_at < $2::timestamptz) t
        where rn > 1 and occurred_at >= $1::timestamptz`,
      p
    ),
    db.query(
      `select count(*)::int as unreviewed
         from public.ai_usage_events u
         join public.ai_evaluations e on e.tenant_id = u.tenant_id and e.id = u.evaluation_id
        where u.outcome = 'ai' and u.occurred_at >= $1::timestamptz and u.occurred_at < $2::timestamptz
          and e.human_reviewer_decision is null`,
      p
    ),
    db.query(
      `select t.id as tenant_id, t.name, t.slug,
              count(u.id) filter (where u.outcome = 'ai')::int  as evaluations,
              coalesce(sum(u.cost_brl), 0)                      as cost_brl,
              count(u.id) filter (where u.outcome <> 'ai')::int as without_ai
         from public.tenants t
         left join public.ai_usage_events u
                on u.tenant_id = t.id and u.occurred_at >= $1::timestamptz and u.occurred_at < $2::timestamptz
        group by t.id, t.name, t.slug
        order by cost_brl desc, evaluations desc, t.name
        limit ${ORGS_SHOWN + 1}`,
      p
    ),
    db.query(
      `select tenant_id, count(*) filter (where outcome = 'ai')::int as evaluations, coalesce(sum(cost_brl), 0) as cost_brl
         from public.ai_usage_events where occurred_at >= $1::timestamptz group by tenant_id`,
      [b.month_start]
    ),
    db.query(
      `select max(occurred_at) filter (where outcome = 'ai') as last_success,
              max(occurred_at) filter (where outcome = 'failed') as last_failure
         from public.ai_usage_events`
    ),
    period === 'this_month'
      ? db.query(
          `select coalesce(sum(cost_brl), 0) as cost_brl from public.ai_usage_events
            where occurred_at >= $1::timestamptz and occurred_at < $2::timestamptz`,
          [b.prev_month_start, b.month_start]
        )
      : Promise.resolve(null),
    db.query('select tenant_id, monthly_limit from public.ai_org_limits')
  ]);

  const t = totals.rows[0];
  const rep = repeated.rows[0];
  const dayMap = new Map<string, { evaluations: number; cost_brl: number }>(daily.rows.map(r => [r.day, r]));
  const customLimit = new Map<string, number>(limits.rows.map(r => [r.tenant_id, r.monthly_limit]));
  const monthMap = new Map<string, { evaluations: number; cost_brl: number }>(monthRows.rows.map(r => [r.tenant_id, r]));
  const monthCost = monthRows.rows.reduce((sum, r) => sum + r.cost_brl, 0);
  const monthEvaluations = monthRows.rows.reduce((sum, r) => sum + r.evaluations, 0);
  const budget = settings.monthlyBudgetBrl ?? null;
  const ready = pricesReady(settings);

  const organizations: AiOrgUsage[] = orgs.rows.slice(0, ORGS_SHOWN).map(r => {
    const own = customLimit.get(r.tenant_id);
    return {
      tenantId: r.tenant_id,
      name: r.name,
      slug: r.slug,
      evaluations: r.evaluations,
      costBrl: r.cost_brl,
      withoutAi: r.without_ai,
      monthEvaluations: monthMap.get(r.tenant_id)?.evaluations ?? 0,
      monthlyLimit: own ?? settings.defaultOrgMonthlyLimit ?? null,
      limitSource: own != null ? 'custom' : settings.defaultOrgMonthlyLimit != null ? 'default' : 'none'
    };
  });

  return {
    period,
    periodLabel: PERIOD_LABEL[period],
    settings,
    effectiveModel: resolveModel(settings.model),
    connectionConfigured: isGeminiConfigured(),
    lastSuccessAt: last.rows[0].last_success ?? undefined,
    lastFailureAt: last.rows[0].last_failure ?? undefined,
    pricesReady: ready,
    totals: {
      evaluations: t.evaluations,
      estimates: t.estimates,
      failures: t.failures,
      blocked: t.blocked,
      costBrl: t.cost_brl,
      avgCostBrl: ready && t.evaluations > 0 ? t.cost_brl / t.evaluations : null,
      repeated: rep.repeated,
      repeatedCostBrl: rep.repeated_cost,
      unreviewed: unreviewed.rows[0].unreviewed,
      unpriced: t.unpriced
    },
    lastMonthCostBrl: lastMonth ? lastMonth.rows[0].cost_brl : null,
    projectionBrl: period === 'this_month' && ready ? projectMonthCostBrl(monthCost, b.elapsed_days, b.days_in_month) : null,
    month: {
      costBrl: monthCost,
      evaluations: monthEvaluations,
      budgetBrl: budget,
      budgetPercent: budget ? (monthCost / budget) * 100 : null
    },
    daily: eachDay(days.rows[0].from_day, days.rows[0].to_day).map(day => ({
      day,
      evaluations: dayMap.get(day)?.evaluations ?? 0,
      costBrl: dayMap.get(day)?.cost_brl ?? 0
    })),
    organizations,
    organizationsTruncated: orgs.rows.length > ORGS_SHOWN
  };
}
