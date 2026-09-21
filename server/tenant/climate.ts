import { createHash } from 'node:crypto';
import {
  CLIMATE_CATEGORIES,
  type CampaignComment,
  type CampaignDepartmentResult,
  type CampaignResults,
  type CampaignStatus,
  type ClimateCampaign,
  type ClimateCampaignSummary,
  type ClimateCategory,
  type ClimateSurveyResponse,
  type ClimateTrendPoint,
  type RetentionMetrics,
  type SurveyAnswer,
  type TenantUser
} from '../../src/types.js';
import { CATEGORY_LABEL, MIN_GROUP, categoryAverages, enpsOf, zoneOf } from '../../src/retention.js';
import { ValidationError } from '../errors.js';
import { cleanText, isoDay, requiredText } from './development.js';

/**
 * Business rules of the internal climate survey: campaigns, who may answer, validation of an answer and the results with
 * the anonymity threshold applied. Everything here is pure; the repository does the reads and writes.
 */
type Body = Record<string, unknown>;
export type CampaignPatch = Record<string, unknown>;

const has = (body: Body, key: string) => body[key] !== undefined;
const isBlank = (value: unknown) => value === undefined || value === null || value === '';

// ---- Campaign ----------------------------------------------------------------------------------
/** An open campaign is closed on its own once the closing date has passed (nothing is written: it is derived when read). */
export function effectiveStatus(campaign: Pick<ClimateCampaign, 'status' | 'closesOn'>, today: string): CampaignStatus {
  return campaign.status === 'open' && campaign.closesOn && campaign.closesOn < today ? 'closed' : campaign.status;
}

export const withEffectiveStatus = <T extends Pick<ClimateCampaign, 'status' | 'closesOn'>>(campaign: T, today: string): T =>
  ({ ...campaign, status: effectiveStatus(campaign, today) });

export interface CampaignRefs {
  departmentIds: ReadonlySet<string>;
}

const CAMPAIGN_FIELDS = ['name', 'period', 'description', 'audience', 'departmentIds', 'closesOn', 'actionPlan'] as const;

/** What can still be changed in each situation. */
const EDITABLE: Record<CampaignStatus, readonly string[]> = {
  draft: CAMPAIGN_FIELDS,
  open: ['closesOn', 'actionPlan'],
  closed: ['actionPlan']
};

function closingDate(value: unknown, today: string): string | null {
  if (isBlank(value)) return null;
  const day = isoDay(value, 'Data de encerramento');
  if (day < today) throw new ValidationError('A data de encerramento não pode estar no passado.');
  return day;
}

function audienceOf(body: Body, current: Pick<ClimateCampaign, 'audience' | 'departmentIds'> | undefined, refs: CampaignRefs) {
  const audience = has(body, 'audience') ? body.audience : current?.audience ?? 'all';
  if (audience !== 'all' && audience !== 'departments') throw new ValidationError('Público da pesquisa inválido.');
  if (audience === 'all') return { audience, departmentIds: [] as string[] };

  const raw = has(body, 'departmentIds') ? body.departmentIds : current?.departmentIds ?? [];
  if (!Array.isArray(raw)) throw new ValidationError('Departamentos: formato inválido.');
  const ids = [...new Set(raw.map(String))];
  if (ids.length === 0) throw new ValidationError('Escolha ao menos um departamento para a pesquisa.');
  if (ids.some(id => !refs.departmentIds.has(id))) throw new ValidationError('Departamento não encontrado nesta organização.');
  return { audience, departmentIds: ids };
}

/** A new campaign (always a draft) from a request body. */
export function buildCampaign(body: Body, refs: CampaignRefs, today: string, by: { id: string; name: string }): CampaignPatch {
  const description = cleanText(body.description, 'Descrição', 500);
  const closesOn = closingDate(body.closesOn, today);
  return {
    name: requiredText(body.name, 'Nome da pesquisa', 120),
    period: requiredText(body.period, 'Período', 40),
    ...(description ? { description } : {}),
    ...audienceOf(body, undefined, refs),
    ...(closesOn ? { closesOn } : {}),
    status: 'draft',
    createdById: by.id,
    createdByName: by.name
  };
}

/** Changes to a campaign: everything while it is a draft; afterwards only the closing date and the action plan. */
export function editCampaign(campaign: ClimateCampaign, body: Body, refs: CampaignRefs, today: string): CampaignPatch {
  const allowed = EDITABLE[campaign.status];
  const blocked = CAMPAIGN_FIELDS.filter(key => has(body, key) && !allowed.includes(key));
  if (blocked.length > 0) {
    throw new ValidationError(
      campaign.status === 'open'
        ? 'Depois de publicada, só é possível alterar a data de encerramento e o plano de ação.'
        : 'Uma pesquisa encerrada só aceita alterações no plano de ação.'
    );
  }

  const patch: CampaignPatch = {};
  if (has(body, 'name')) patch.name = requiredText(body.name, 'Nome da pesquisa', 120);
  if (has(body, 'period')) patch.period = requiredText(body.period, 'Período', 40);
  if (has(body, 'description')) patch.description = cleanText(body.description, 'Descrição', 500) || null;
  if (has(body, 'closesOn')) patch.closesOn = closingDate(body.closesOn, today);
  if (has(body, 'actionPlan')) patch.actionPlan = cleanText(body.actionPlan, 'Plano de ação', 2000) || null;
  if (has(body, 'audience') || has(body, 'departmentIds')) Object.assign(patch, audienceOf(body, campaign, refs));
  return patch;
}

export function publishCampaign(campaign: ClimateCampaign, today: string): CampaignPatch {
  if (campaign.status !== 'draft') throw new ValidationError('Só uma pesquisa em rascunho pode ser publicada.');
  if (campaign.closesOn && campaign.closesOn < today) throw new ValidationError('A data de encerramento já passou. Ajuste-a antes de publicar.');
  return { status: 'open', publishedAt: new Date().toISOString() };
}

export function closeCampaign(campaign: ClimateCampaign): CampaignPatch {
  if (campaign.status !== 'open') throw new ValidationError('Só uma pesquisa aberta pode ser encerrada.');
  return { status: 'closed', closedAt: new Date().toISOString() };
}

export function assertCampaignRemovable(campaign: ClimateCampaign): void {
  if (campaign.status !== 'draft') throw new ValidationError('Só uma pesquisa em rascunho pode ser excluída. Uma pesquisa publicada tem respostas e fica no histórico.');
}

/** Active member inside the campaign's audience. */
export function isEligible(campaign: Pick<ClimateCampaign, 'audience' | 'departmentIds'>, member: Pick<TenantUser, 'active' | 'departmentId'>): boolean {
  if (!member.active) return false;
  return campaign.audience === 'all' || (!!member.departmentId && campaign.departmentIds.includes(member.departmentId));
}

// ---- Answer ---------------------------------------------------------------------------------
function score(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10) {
    throw new ValidationError(`${label}: informe uma nota de 0 a 10.`);
  }
  return value;
}

export function parseAnswer(body: Body): SurveyAnswer & { comment?: string } {
  const categories = body.categories;
  if (!categories || typeof categories !== 'object') throw new ValidationError('Avalie todas as categorias.');
  const comment = cleanText(body.comment, 'Comentário', 1000);
  return {
    enps: score(body.enps, 'Recomendação'),
    categories: Object.fromEntries(
      CLIMATE_CATEGORIES.map(c => [c, score((categories as Record<string, unknown>)[c], CATEGORY_LABEL[c])])
    ) as Record<ClimateCategory, number>,
    ...(comment ? { comment } : {})
  };
}

// ---- Results ---------------------------------------------------------------------------------
/** Order that has nothing to do with when each comment arrived: stable per comment, unrelated to the insertion order. */
const shuffleKey = (id: string) => createHash('sha256').update(id).digest('hex');

interface Group {
  key: string;
  label: string;
  order: string;
  responses: ClimateSurveyResponse[];
}

/**
 * Trend and latest result of the whole organization. Responses of a campaign form a group once it has MIN_GROUP
 * answers (anonymity); historical responses (no campaign) group by period and need no threshold — there is nobody
 * to identify in them.
 */
export function buildClimateOverview(
  responses: readonly ClimateSurveyResponse[],
  campaigns: readonly ClimateCampaign[]
): Pick<RetentionMetrics, 'enps' | 'enpsSource' | 'zone' | 'categoryAverages' | 'trend'> {
  const groups = new Map<string, Group>();
  const campaignById = new Map(campaigns.map(c => [c.id, c]));

  for (const response of responses) {
    const campaign = response.campaignId ? campaignById.get(response.campaignId) : undefined;
    if (response.campaignId && !campaign) continue;
    const key = campaign ? `c:${campaign.id}` : `p:${response.period}`;
    // historical periods come first (alphabetical), campaigns after them by publication date
    const order = campaign ? `1|${campaign.publishedAt ?? campaign.createdAt}` : `0|${response.period}`;
    const group = groups.get(key) ?? { key, label: campaign ? campaign.name : response.period, order, responses: [] };
    group.responses.push(response);
    groups.set(key, group);
  }

  const released = [...groups.values()]
    .filter(g => !g.key.startsWith('c:') || g.responses.length >= MIN_GROUP)
    .sort((a, b) => a.order.localeCompare(b.order));

  const trend: ClimateTrendPoint[] = released.map(g => ({
    key: g.key,
    label: g.label,
    responses: g.responses.length,
    enps: enpsOf(g.responses.map(r => r.enpsScore))!.score
  }));

  const latest = released[released.length - 1];
  const enps = latest ? enpsOf(latest.responses.map(r => r.enpsScore)) : null;
  return {
    enps,
    enpsSource: latest?.label ?? null,
    zone: enps ? zoneOf(enps.score) : null,
    categoryAverages: latest ? categoryAverages(latest.responses.map(r => r.categoryRatings)) : null,
    trend
  };
}

/** Results of one campaign, with every anonymity rule applied. */
export function buildCampaignResults(input: {
  campaign: ClimateCampaignSummary;
  responses: readonly ClimateSurveyResponse[];
  departments: readonly { id: string; name: string }[];
  trend: readonly ClimateTrendPoint[];
}): CampaignResults {
  const { campaign, responses, departments, trend } = input;
  const released = responses.length >= MIN_GROUP;

  const enps = released ? enpsOf(responses.map(r => r.enpsScore)) : null;

  const byDepartment: CampaignDepartmentResult[] = [];
  if (released) {
    for (const department of departments) {
      const group = responses.filter(r => r.departmentId === department.id);
      if (group.length < MIN_GROUP) continue;
      byDepartment.push({
        departmentId: department.id,
        name: department.name,
        responses: group.length,
        enps: enpsOf(group.map(r => r.enpsScore))!.score,
        categoryAverages: categoryAverages(group.map(r => r.categoryRatings))!
      });
    }
  }

  const comments: CampaignComment[] = released
    ? responses
        .filter(r => !!r.anonymousComment)
        .sort((a, b) => shuffleKey(a.id).localeCompare(shuffleKey(b.id)))
        .map(r => ({ id: r.id, text: r.anonymousComment!, hidden: !!r.commentHidden }))
    : [];

  const at = trend.findIndex(point => point.key === `c:${campaign.id}`);
  const before = at > 0 ? trend[at - 1] : undefined;

  return {
    campaign,
    minGroup: MIN_GROUP,
    released,
    responseRate: campaign.eligible > 0 ? Math.round((campaign.responded / campaign.eligible) * 100) : 0,
    enps,
    zone: enps ? zoneOf(enps.score) : null,
    categoryAverages: released ? categoryAverages(responses.map(r => r.categoryRatings)) : null,
    departments: byDepartment,
    comments,
    previous: before ? { name: before.label, enps: before.enps } : null
  };
}
