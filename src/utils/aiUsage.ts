import type { AiUsageOverview } from '../types.js';

/** Formatting and plain-language reading of the AI credit panel (Conta Mãe). No technical terms reach the user. */

/** R$ with cents; very small amounts (a single evaluation costs fractions of a cent) get 4 decimals so they are not shown as zero. */
export function formatBrl(value: number): string {
  const small = value > 0 && value < 0.1;
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: small ? 4 : 2,
    maximumFractionDigits: small ? 4 : 2
  });
}

export const formatInt = (value: number): string => value.toLocaleString('pt-BR');

export const formatPercent = (value: number): string => `${Math.round(value)}%`;

/** "1 avaliação" / "2 avaliações" */
export const plural = (n: number, one: string, many: string): string => `${formatInt(n)} ${n === 1 ? one : many}`;

/** 'YYYY-MM-DD' -> 'dd/mm' */
export const dayLabel = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Reads what the user typed in a number field (accepts a decimal comma). Empty = cleared (null). */
export function parseNumberInput(text: string): { value: number | null; valid: boolean } {
  const t = text.trim();
  if (t === '') return { value: null, valid: true };
  // With a comma, dots are thousands separators ("1.500,50"); without one, a dot is the decimal point ("0.75").
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? { value: n, valid: true } : { value: null, valid: false };
}

export type InsightLevel = 'attention' | 'tip' | 'good';

export interface AiInsight {
  id: string;
  level: InsightLevel;
  title: string;
  detail: string;
  /** Opens the rules card so the person can act right away. */
  action?: 'rules';
}

const list = (names: string[]) => (names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} e mais ${names.length - 3}`);

/** "What deserves attention and how to spend less", in everyday words. */
export function buildAiInsights(o: AiUsageOverview): AiInsight[] {
  const out: AiInsight[] = [];
  const { totals, month, settings } = o;
  const attempts = totals.evaluations + totals.failures;

  if (!settings.enabled) {
    out.push({
      id: 'paused', level: 'attention', title: 'A IA está pausada',
      detail: 'Nenhuma avaliação está usando a IA agora: todas recebem a estimativa local, sem custo. Religue no topo desta tela quando quiser voltar a usar.'
    });
  }
  if (!o.connectionConfigured) {
    out.push({
      id: 'no-key', level: 'attention', title: 'A conexão com o Google não está configurada',
      detail: 'Sem a chave do Google no servidor, todas as avaliações saem como estimativa local. Peça a quem administra o servidor para cadastrar a chave.'
    });
  }
  if (!o.pricesReady || totals.unpriced > 0) {
    out.push({
      id: 'prices', level: 'attention', title: 'Informe os preços para ver os gastos em R$',
      detail: 'Sem os preços e a cotação do dólar não dá para calcular quanto a IA custou. Preencha em "Ajustes de custo" logo abaixo.',
      action: 'rules'
    });
  }

  // Monthly ceiling
  if (month.budgetBrl != null && month.budgetPercent != null) {
    const stopWhat = settings.onLimit === 'block' ? 'os novos pedidos estão sendo bloqueados' : 'as novas avaliações estão saindo como estimativa local, sem custo';
    if (month.budgetPercent >= 100) {
      out.push({
        id: 'budget-hit', level: 'attention', title: 'O teto de gasto do mês foi atingido',
        detail: `Já foram gastos ${formatBrl(month.costBrl)} de ${formatBrl(month.budgetBrl)}. Enquanto o mês não virar, ${stopWhat}. Aumente o teto se quiser liberar a IA de novo.`,
        action: 'rules'
      });
    } else if (month.budgetPercent >= 80) {
      out.push({
        id: 'budget-near', level: 'attention', title: `Você já usou ${formatPercent(month.budgetPercent)} do teto do mês`,
        detail: `Foram ${formatBrl(month.costBrl)} de ${formatBrl(month.budgetBrl)}. Ao chegar em 100%, ${settings.onLimit === 'block' ? 'os novos pedidos serão bloqueados' : 'as novas avaliações passarão a sair como estimativa local, sem custo'} até o mês virar.`,
        action: 'rules'
      });
    } else if (o.projectionBrl != null && o.projectionBrl > month.budgetBrl) {
      out.push({
        id: 'budget-forecast', level: 'attention', title: 'No ritmo atual você deve passar do teto do mês',
        detail: `A previsão para o fim do mês é ${formatBrl(o.projectionBrl)}, acima do teto de ${formatBrl(month.budgetBrl)}. Reduza o uso ou aumente o teto.`,
        action: 'rules'
      });
    }
  } else {
    out.push({
      id: 'no-budget', level: 'tip', title: 'Defina um teto de gasto para o mês',
      detail: 'É a trava de segurança: quando o gasto do mês chegar ao valor definido, a IA deixa de ser usada e você não leva susto na fatura.',
      action: 'rules'
    });
  }

  // Limits per organization
  const withLimit = o.organizations.filter(g => g.monthlyLimit != null);
  const hit = withLimit.filter(g => g.monthEvaluations >= g.monthlyLimit!);
  const near = withLimit.filter(g => g.monthEvaluations < g.monthlyLimit! && g.monthEvaluations >= g.monthlyLimit! * 0.8);
  if (hit.length) {
    out.push({
      id: 'org-hit', level: 'attention',
      title: hit.length === 1 ? `${hit[0].name} atingiu o limite do mês` : `${hit.length} organizações atingiram o limite do mês`,
      detail: `${list(hit.map(g => g.name))}. ${settings.onLimit === 'block' ? 'Novos pedidos delas estão sendo bloqueados' : 'Novas avaliações delas saem como estimativa local'} até o mês virar. Se fizer sentido, aumente o limite na tabela abaixo.`
    });
  }
  if (near.length) {
    out.push({
      id: 'org-near', level: 'tip',
      title: near.length === 1 ? `${near[0].name} está perto do limite do mês` : `${near.length} organizações estão perto do limite do mês`,
      detail: `${list(near.map(g => g.name))} já usaram mais de 80% das avaliações do mês.`
    });
  }
  if (withLimit.length === 0) {
    out.push({
      id: 'no-limit', level: 'tip', title: 'Nenhuma organização tem limite de avaliações',
      detail: 'Defina um limite padrão por organização (ou um limite próprio na tabela abaixo) para que nenhuma delas consuma sozinha todo o orçamento.',
      action: 'rules'
    });
  }

  // Where the money goes
  const active = o.organizations.filter(g => g.costBrl > 0);
  if (active.length >= 2 && totals.costBrl > 0) {
    const top = active[0];
    const share = (top.costBrl / totals.costBrl) * 100;
    if (share >= 60) {
      out.push({
        id: 'concentration', level: 'tip', title: `${top.name} concentra ${formatPercent(share)} do gasto`,
        detail: 'Se quiser reduzir os custos, comece por ela: defina um limite mensal próprio na tabela abaixo.'
      });
    }
  }
  if (totals.repeated > 0 && totals.evaluations > 0 && (totals.repeated >= 3 || totals.repeated / totals.evaluations >= 0.1)) {
    out.push({
      id: 'repeated', level: 'tip',
      title: `${totals.repeated === 1 ? '1 avaliação repetiu' : `${formatInt(totals.repeated)} avaliações repetiram`} a mesma pessoa na mesma vaga`,
      detail: `Isso é ${formatPercent((totals.repeated / totals.evaluations) * 100)} das avaliações${o.pricesReady ? ` e custou ${formatBrl(totals.repeatedCostBrl)}` : ''}. Oriente as equipes a reavaliar só quando o currículo ou a vaga mudarem.`
    });
  }
  if (totals.evaluations >= 5 && totals.unreviewed / totals.evaluations >= 0.4) {
    out.push({
      id: 'unreviewed', level: 'tip',
      title: `${formatPercent((totals.unreviewed / totals.evaluations) * 100)} das avaliações com IA não foram revisadas por ninguém`,
      detail: 'Se o resultado não está sendo olhado, o gasto pode ser evitado. Sugira avaliar com IA apenas quem já avançou para as etapas finais do processo.'
    });
  }
  if (totals.failures > 0 && attempts > 0 && totals.failures / attempts >= 0.1) {
    out.push({
      id: 'failures', level: 'attention',
      title: `${totals.failures === 1 ? '1 tentativa falhou' : `${formatInt(totals.failures)} tentativas falharam`} no Google`,
      detail: 'Falha não gera custo, mas a pessoa recebeu só a estimativa local. Se isso se repetir, confira a chave e o modelo em "Ajustes de custo".',
      action: 'rules'
    });
  }
  if (totals.blocked > 0) {
    out.push({
      id: 'blocked', level: 'tip',
      title: `${totals.blocked === 1 ? '1 pedido foi barrado' : `${formatInt(totals.blocked)} pedidos foram barrados`} por limite`,
      detail: 'Se eram pedidos legítimos, aumente o limite da organização. Se não, o limite está cumprindo o papel de segurar o gasto.'
    });
  }

  if (!out.some(i => i.level === 'attention')) {
    const anyUse = totals.evaluations + totals.estimates + totals.failures + totals.blocked > 0;
    out.push(anyUse
      ? { id: 'ok', level: 'good', title: 'Tudo sob controle neste período', detail: 'Nenhum ponto de atenção: o gasto está dentro do esperado e as regras estão funcionando.' }
      : { id: 'no-use', level: 'tip', title: 'Ainda não houve uso da IA neste período', detail: 'Assim que as organizações fizerem avaliações com IA, o consumo e os alertas aparecem aqui.' });
  }
  const weight: Record<InsightLevel, number> = { attention: 0, tip: 1, good: 2 };
  return out.sort((a, b) => weight[a.level] - weight[b.level]);
}
