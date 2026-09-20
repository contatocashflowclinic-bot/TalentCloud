import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  Lightbulb,
  Loader2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  X
} from 'lucide-react';
import { MasterApi } from '../../services/api.js';
import { AiLimitPolicy, AiOrgUsage, AiSettings, AiUsageOverview, AiUsagePeriod } from '../../types.js';
import {
  AiInsight,
  buildAiInsights,
  dayLabel,
  formatBrl,
  formatInt,
  formatPercent,
  parseNumberInput,
  plural
} from '../../utils/aiUsage.js';
import { formatDateTimeSP } from '../../utils/dateUtils.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';

/**
 * Conta Mãe › Uso da IA. Answers, in everyday words: how much is the AI costing, who is using it, and what to do to spend less.
 * Amounts in R$ are ESTIMATES (volume of text processed × the prices informed here); the official bill is Google's.
 */
const PERIODS: Array<{ id: AiUsagePeriod; label: string }> = [
  { id: 'this_month', label: 'Este mês' },
  { id: 'last_month', label: 'Mês passado' },
  { id: 'last_30', label: 'Últimos 30 dias' }
];

const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

const barTone = (percent: number) => (percent >= 100 ? 'bg-rose-500' : percent >= 80 ? 'bg-amber-500' : 'bg-indigo-500');

const Bar: React.FC<{ percent: number }> = ({ percent }) => (
  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={Math.round(Math.min(percent, 100))} aria-valuemin={0} aria-valuemax={100}>
    <div className={`h-full rounded-full transition-all ${barTone(percent)}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
  </div>
);

const Kpi: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; title?: string; children?: React.ReactNode }> = ({ label, value, sub, title, children }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col gap-1.5" title={title}>
    <div className="text-xs font-semibold text-slate-500">{label}</div>
    <div className="text-2xl font-bold text-slate-900 leading-tight">{value}</div>
    {children}
    {sub && <div className="text-[11px] text-slate-500 leading-snug">{sub}</div>}
  </div>
);

// --------------------------------------------------------------------------------------------- daily chart
const DailyChart: React.FC<{ daily: AiUsageOverview['daily']; showMoney: boolean }> = ({ daily, showMoney }) => {
  const value = (d: AiUsageOverview['daily'][number]) => (showMoney ? d.costBrl : d.evaluations);
  const max = Math.max(0, ...daily.map(value));
  if (max === 0) {
    return <p className="text-xs text-slate-400 py-10 text-center">Nenhuma avaliação com IA neste período.</p>;
  }
  const peak = daily.reduce((a, b) => (value(b) > value(a) ? b : a));
  const mid = daily[Math.floor(daily.length / 2)];
  return (
    <div>
      <div className="flex items-end gap-[3px] h-52" role="img" aria-label={showMoney ? 'Gasto estimado por dia' : 'Avaliações por dia'}>
        {daily.map(d => (
          <div
            key={d.day}
            className="flex-1 min-w-0 h-full flex items-end group"
            title={`${dayLabel(d.day)} — ${plural(d.evaluations, 'avaliação', 'avaliações')}${showMoney ? ` · ${formatBrl(d.costBrl)}` : ''}`}
          >
            <div
              className={`w-full rounded-t-sm ${value(d) > 0 ? 'bg-indigo-500 group-hover:bg-indigo-600' : 'bg-slate-100'}`}
              style={{ height: value(d) > 0 ? `${Math.max(4, (value(d) / max) * 100)}%` : '2px' }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1.5 px-0.5">
        <span>{dayLabel(daily[0].day)}</span>
        <span>{dayLabel(mid.day)}</span>
        <span>{dayLabel(daily[daily.length - 1].day)}</span>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">
        Dia de maior {showMoney ? 'gasto' : 'uso'}: <b className="text-slate-700">{dayLabel(peak.day)}</b>
        {' — '}{plural(peak.evaluations, 'avaliação', 'avaliações')}{showMoney ? ` · ${formatBrl(peak.costBrl)}` : ''}
      </p>
    </div>
  );
};

// --------------------------------------------------------------------------------------------- insights
const INSIGHT_STYLE: Record<AiInsight['level'], { box: string; icon: React.ReactNode }> = {
  attention: { box: 'bg-amber-50 border-amber-200', icon: <AlertTriangle className="w-4 h-4 text-amber-600" /> },
  tip: { box: 'bg-indigo-50/60 border-indigo-100', icon: <Lightbulb className="w-4 h-4 text-indigo-600" /> },
  good: { box: 'bg-emerald-50 border-emerald-200', icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" /> }
};

const Insights: React.FC<{ items: AiInsight[]; onOpenRules: () => void }> = ({ items, onOpenRules }) => (
  <div className="space-y-2.5">
    {items.map(i => (
      <div key={i.id} className={`flex items-start gap-3 p-3.5 rounded-xl border ${INSIGHT_STYLE[i.level].box}`}>
        <span className="mt-0.5 shrink-0">{INSIGHT_STYLE[i.level].icon}</span>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="text-sm font-semibold text-slate-900">{i.title}</div>
          <p className="text-xs text-slate-600 leading-relaxed">{i.detail}</p>
        </div>
        {i.action === 'rules' && (
          <button onClick={onOpenRules} className="shrink-0 text-xs font-semibold text-indigo-700 hover:text-indigo-900 whitespace-nowrap">
            Ajustar regras
          </button>
        )}
      </div>
    ))}
  </div>
);

// --------------------------------------------------------------------------------------------- limit dialog
const OrgLimitModal: React.FC<{
  org: AiOrgUsage;
  defaultLimit?: number;
  onClose: () => void;
  onSaved: () => void;
}> = ({ org, defaultLimit, onClose, onSaved }) => {
  const [mode, setMode] = useState<'default' | 'custom'>(org.limitSource === 'custom' ? 'custom' : 'default');
  const [value, setValue] = useState(org.limitSource === 'custom' && org.monthlyLimit != null ? String(org.monthlyLimit) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backdrop = useBackdropClose(onClose);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let limit: number | null = null;
    if (mode === 'custom') {
      const n = parseNumberInput(value);
      if (!n.valid || n.value === null || !Number.isInteger(n.value) || n.value < 0) {
        return setError('Informe um número inteiro de avaliações por mês (0 desliga a IA para esta organização).');
      }
      limit = n.value;
    }
    try {
      setSaving(true);
      await MasterApi.setAiOrgLimit(org.tenantId, limit);
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar o limite.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs" {...backdrop}>
      <form onSubmit={save} className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Limite de avaliações com IA</h2>
            <p className="text-xs text-slate-500">{org.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Até quantas avaliações com IA esta organização pode fazer <b>por mês</b>. No mês atual ela já fez <b>{formatInt(org.monthEvaluations)}</b>.
        </p>

        <div className="space-y-2">
          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${mode === 'default' ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}>
            <input type="radio" name="limit-mode" checked={mode === 'default'} onChange={() => setMode('default')} className="mt-0.5" />
            <span className="text-sm">
              <span className="font-semibold text-slate-900">Seguir o padrão da plataforma</span>
              <span className="block text-xs text-slate-500">
                {defaultLimit != null ? `Hoje o padrão é ${formatInt(defaultLimit)} avaliações por mês.` : 'Hoje não há padrão definido: sem limite.'}
              </span>
            </span>
          </label>
          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${mode === 'custom' ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}>
            <input type="radio" name="limit-mode" checked={mode === 'custom'} onChange={() => setMode('custom')} className="mt-0.5" />
            <span className="text-sm flex-1">
              <span className="font-semibold text-slate-900">Definir um limite só para esta organização</span>
              <span className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={value}
                  disabled={mode !== 'custom'}
                  onChange={e => setValue(e.target.value)}
                  placeholder="Ex.: 50"
                  aria-label="Avaliações por mês"
                  className={`${inputCls} max-w-[140px] disabled:bg-slate-50 disabled:text-slate-400`}
                />
                <span className="text-xs text-slate-500">avaliações por mês</span>
              </span>
            </span>
          </label>
        </div>

        {error && <div role="alert" className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar limite
          </button>
        </div>
      </form>
    </div>
  );
};

// --------------------------------------------------------------------------------------------- rules
const numText = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

const RulesCard: React.FC<{
  settings: AiSettings;
  effectiveModel: string;
  pricesReady: boolean;
  onSaved: () => void;
}> = ({ settings, effectiveModel, pricesReady, onSaved }) => {
  const [budget, setBudget] = useState(numText(settings.monthlyBudgetBrl));
  const [defaultLimit, setDefaultLimit] = useState(numText(settings.defaultOrgMonthlyLimit));
  const [onLimit, setOnLimit] = useState<AiLimitPolicy>(settings.onLimit);
  const [model, setModel] = useState(settings.model ?? '');
  const [priceIn, setPriceIn] = useState(numText(settings.priceInputUsd));
  const [priceOut, setPriceOut] = useState(numText(settings.priceOutputUsd));
  const [rate, setRate] = useState(numText(settings.usdBrlRate));
  const [advanced, setAdvanced] = useState(!pricesReady);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const fields = {
      monthlyBudgetBrl: { raw: budget, label: 'Teto de gasto', current: settings.monthlyBudgetBrl, integer: false },
      defaultOrgMonthlyLimit: { raw: defaultLimit, label: 'Limite padrão', current: settings.defaultOrgMonthlyLimit, integer: true },
      priceInputUsd: { raw: priceIn, label: 'Preço do texto enviado', current: settings.priceInputUsd, integer: false },
      priceOutputUsd: { raw: priceOut, label: 'Preço do texto respondido', current: settings.priceOutputUsd, integer: false },
      usdBrlRate: { raw: rate, label: 'Cotação do dólar', current: settings.usdBrlRate, integer: false }
    };
    const patch: Record<string, unknown> = {};
    for (const [key, f] of Object.entries(fields)) {
      const n = parseNumberInput(f.raw);
      if (!n.valid || (n.value !== null && (n.value < 0 || (f.integer && !Number.isInteger(n.value))))) {
        return setMessage({ ok: false, text: `${f.label}: informe ${f.integer ? 'um número inteiro' : 'um número'} válido (ou deixe em branco).` });
      }
      if (n.value !== (f.current ?? null)) patch[key] = n.value;
    }
    if (onLimit !== settings.onLimit) patch.onLimit = onLimit;
    if (model.trim() !== (settings.model ?? '')) patch.model = model.trim() || null;
    if (Object.keys(patch).length === 0) return setMessage({ ok: true, text: 'Nada foi alterado.' });

    try {
      setSaving(true);
      await MasterApi.updateAiSettings(patch);
      setMessage({ ok: true, text: 'Regras salvas. Já valem para as próximas avaliações.' });
      onSaved();
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Não foi possível salvar as regras.' });
    } finally {
      setSaving(false);
    }
  };

  const policy = (value: AiLimitPolicy, title: string, help: string) => (
    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${onLimit === value ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}>
      <input type="radio" name="on-limit" checked={onLimit === value} onChange={() => setOnLimit(value)} className="mt-0.5" />
      <span className="text-sm">
        <span className="font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500 leading-relaxed">{help}</span>
      </span>
    </label>
  );

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid md:grid-cols-2 gap-5">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Teto de gasto por mês (todas as organizações somadas)</span>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-slate-500">R$</span>
            <input type="text" inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Ex.: 200,00" className={inputCls} />
          </div>
          <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">
            Quando o gasto estimado do mês chegar a este valor, a IA deixa de ser usada até o mês virar. Deixe em branco para não ter teto.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-700">Limite padrão de avaliações por organização, por mês</span>
          <div className="mt-1 flex items-center gap-2">
            <input type="text" inputMode="numeric" value={defaultLimit} onChange={e => setDefaultLimit(e.target.value)} placeholder="Ex.: 100" className={inputCls} />
            <span className="text-xs text-slate-500 whitespace-nowrap">avaliações</span>
          </div>
          <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">
            Vale para toda organização que não tiver limite próprio (defina um limite próprio na tabela acima). Deixe em branco para não limitar.
          </span>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-slate-700 mb-1">Quando um limite for atingido</legend>
        {policy('estimate', 'Continuar com a estimativa local (recomendado)', 'A pessoa segue trabalhando e recebe uma avaliação simples, sem custo, com aviso claro de que não é IA.')}
        {policy('block', 'Bloquear e avisar', 'Novos pedidos não são feitos e a pessoa vê uma mensagem pedindo para falar com a administração da plataforma.')}
      </fieldset>

      <div className="border border-slate-200 rounded-2xl">
        <button
          type="button"
          onClick={() => setAdvanced(a => !a)}
          aria-expanded={advanced}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-slate-800">
            Ajustes de custo <span className="font-normal text-slate-400">(avançado)</span>
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${advanced ? 'rotate-180' : ''}`} />
        </button>
        {advanced && (
          <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Cada avaliação envia um texto para a IA (currículo, vaga e cultura da empresa) e recebe outro de volta (o parecer). O Google cobra pelo volume de
              texto, que ele chama de "tokens". O painel multiplica esse volume pelos preços abaixo para estimar o gasto em reais. Os preços mudam de tempos em
              tempos: confira no site do Google (ai.google.dev/gemini-api/docs/pricing).
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Preço do texto enviado à IA</span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm text-slate-500">US$</span>
                  <input type="text" inputMode="decimal" value={priceIn} onChange={e => setPriceIn(e.target.value)} className={inputCls} />
                </div>
                <span className="block text-[11px] text-slate-500 mt-1">por 1 milhão de unidades de texto</span>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Preço do texto respondido pela IA</span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm text-slate-500">US$</span>
                  <input type="text" inputMode="decimal" value={priceOut} onChange={e => setPriceOut(e.target.value)} className={inputCls} />
                </div>
                <span className="block text-[11px] text-slate-500 mt-1">por 1 milhão de unidades de texto</span>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Cotação do dólar</span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm text-slate-500">R$</span>
                  <input type="text" inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} className={inputCls} />
                </div>
                <span className="block text-[11px] text-slate-500 mt-1">para converter o preço do Google em reais</span>
              </label>
            </div>
            <p className="text-[11px] text-slate-400">
              Valores iniciais de referência (preço do Gemini Flash e dólar de 20/09/2026).
              {settings.pricesUpdatedAt && <> Última atualização dos preços: {formatDateTimeSP(settings.pricesUpdatedAt)}.</>}
            </p>

            <label className="block max-w-md">
              <span className="text-xs font-semibold text-slate-700">Modelo de IA</span>
              <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder={effectiveModel} className={`${inputCls} mt-1`} />
              <span className="block text-[11px] text-slate-500 mt-1 leading-relaxed">
                É a "versão" da IA que faz as avaliações; modelos menores costumam custar menos. Deixe em branco para usar o padrão do servidor
                (hoje: <b>{effectiveModel}</b>). Se digitar um nome que não existe, as avaliações passam a sair como estimativa local. Ao trocar de modelo, atualize também os preços acima.
              </span>
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar regras
        </button>
        {message && (
          <span role="status" className={`text-xs font-medium ${message.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{message.text}</span>
        )}
        {settings.updatedAt && (
          <span className="text-[11px] text-slate-400 sm:ml-auto">
            Última alteração: {formatDateTimeSP(settings.updatedAt)}{settings.updatedBy ? ` por ${settings.updatedBy}` : ''}
          </span>
        )}
      </div>
    </form>
  );
};

// --------------------------------------------------------------------------------------------- the panel
const Section: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, right, children }) => (
  <section className="bg-white rounded-2xl border border-slate-200 shadow-xs">
    <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
    <div className="p-4 sm:p-5">{children}</div>
  </section>
);

export const PlatformAiPanel: React.FC = () => {
  const [period, setPeriod] = useState<AiUsagePeriod>('this_month');
  const [data, setData] = useState<AiUsageOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AiOrgUsage | null>(null);
  const [toggling, setToggling] = useState(false);
  const [search, setSearch] = useState('');
  const rulesRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      setLoading(true);
      const overview = await MasterApi.getAiUsage(period);
      if (mine !== seq.current) return;
      setData(overview);
      setError(null);
    } catch (err: any) {
      if (mine !== seq.current) return;
      setError(err.message || 'Não foi possível carregar o painel de uso da IA.');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const openRules = () => rulesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const togglePause = async () => {
    if (!data) return;
    const pausing = data.settings.enabled;
    if (pausing && !confirm('Pausar a IA? Enquanto estiver pausada, todas as avaliações usam a estimativa local (sem custo). Você pode religar quando quiser.')) return;
    try {
      setToggling(true);
      await MasterApi.updateAiSettings({ enabled: !pausing });
      await load();
    } catch (err: any) {
      alert(`Não foi possível ${pausing ? 'pausar' : 'religar'} a IA: ${err.message}`);
    } finally {
      setToggling(false);
    }
  };

  const o = data;
  const insights = o ? buildAiInsights(o) : [];
  const money = (v: number) => (o?.pricesReady ? formatBrl(v) : '—');
  const term = search.trim().toLowerCase();
  const orgs = o ? o.organizations.filter(g => !term || g.name.toLowerCase().includes(term) || g.slug.includes(term)) : [];
  const dailyAvg = o && o.daily.length ? o.totals.costBrl / o.daily.length : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" /> Uso da IA
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl">
            Acompanhe quanto a avaliação com IA está custando, quais organizações mais usam e defina limites para controlar, reduzir e otimizar os gastos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5" role="group" aria-label="Período">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                aria-pressed={period === p.id}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${period === p.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading} title="Atualizar" aria-label="Atualizar" className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="flex-1">{error}</p>
          <button onClick={load} className="font-semibold underline">Tentar de novo</button>
        </div>
      )}

      {!o && loading && (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando o painel…
        </div>
      )}

      {o && (
        <>
          {/* Situação agora */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-wrap items-center gap-x-8 gap-y-3 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-slate-500">IA</span>
              <span className={`px-2.5 py-1 rounded-full font-bold ${o.settings.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {o.settings.enabled ? 'Ligada' : 'Pausada'}
              </span>
              <button
                onClick={togglePause}
                disabled={toggling}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                title={o.settings.enabled ? 'Faz todas as avaliações usarem a estimativa local, sem custo' : 'Volta a usar a IA nas avaliações'}
              >
                {toggling ? <Loader2 className="w-3 h-3 animate-spin" /> : o.settings.enabled ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                {o.settings.enabled ? 'Pausar IA' : 'Religar IA'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Conexão com o Google</span>
              <span className={`font-semibold ${o.connectionConfigured ? 'text-emerald-700' : 'text-rose-700'}`}>
                {o.connectionConfigured ? 'Configurada' : 'Não configurada'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Modelo de IA em uso</span>
              <span className="font-mono font-semibold text-slate-800">{o.effectiveModel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500">
              <span title="Horário de São Paulo">Última resposta da IA: <b className="text-slate-700">{o.lastSuccessAt ? formatDateTimeSP(o.lastSuccessAt) : 'ainda não houve'}</b></span>
              {o.lastFailureAt && <span title="Horário de São Paulo">Última falha: <b className="text-slate-700">{formatDateTimeSP(o.lastFailureAt)}</b></span>}
            </div>
          </div>

          {/* Números principais */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Kpi
              label={`Gasto estimado · ${o.periodLabel.toLowerCase()}`}
              value={money(o.totals.costBrl)}
              sub={
                !o.pricesReady ? 'Informe os preços em "Ajustes de custo" para ver o valor.'
                : o.lastMonthCostBrl != null ? `Mês passado inteiro: ${formatBrl(o.lastMonthCostBrl)}`
                : undefined
              }
              title="Estimativa: volume de texto processado × preços informados. A cobrança oficial é a do Google."
            />
            <Kpi
              label="Avaliações feitas com IA"
              value={formatInt(o.totals.evaluations)}
              sub={o.totals.avgCostBrl != null ? `${formatBrl(o.totals.avgCostBrl)} cada · ${formatBrl(o.totals.avgCostBrl * 1000)} a cada 1.000` : undefined}
            />
            {period === 'this_month' ? (
              <Kpi
                label="Previsão para o fim do mês"
                value={o.projectionBrl != null ? formatBrl(o.projectionBrl) : '—'}
                sub={o.projectionBrl != null ? 'se o ritmo de uso continuar igual' : o.pricesReady ? 'Ainda há poucos dias de dados para prever.' : 'Informe os preços para ver a previsão.'}
              />
            ) : (
              <Kpi label="Média por dia" value={money(dailyAvg)} sub={`em ${o.daily.length} dia(s)`} />
            )}
            {o.month.budgetBrl != null && o.month.budgetPercent != null ? (
              <Kpi label="Teto do mês" value={formatPercent(o.month.budgetPercent)} sub={`${formatBrl(o.month.costBrl)} de ${formatBrl(o.month.budgetBrl)}`} title="Sempre o mês atual, independente do período escolhido">
                <Bar percent={o.month.budgetPercent} />
              </Kpi>
            ) : (
              <Kpi label="Teto do mês" value="Sem teto" sub={<button onClick={openRules} className="font-semibold text-indigo-700 hover:text-indigo-900">Definir um teto de gasto</button>} />
            )}
            <Kpi
              label="Pedidos sem usar a IA"
              value={formatInt(o.totals.estimates + o.totals.failures + o.totals.blocked)}
              sub={`${plural(o.totals.estimates, 'estimativa', 'estimativas')} · ${plural(o.totals.failures, 'falha', 'falhas')} · ${plural(o.totals.blocked, 'bloqueio', 'bloqueios')}`}
              title="Estimativa: a IA estava pausada, sem chave ou o limite foi atingido. Falha: o Google não respondeu. Bloqueio: pedido barrado por limite."
            />
          </div>

          <div className="grid xl:grid-cols-5 gap-6">
            <div className="xl:col-span-3 space-y-6">
              <Section title={o.pricesReady ? 'Gasto estimado por dia' : 'Avaliações com IA por dia'} subtitle={o.periodLabel}>
                <DailyChart daily={o.daily} showMoney={o.pricesReady} />
              </Section>
              <details open className="bg-white rounded-2xl border border-slate-200 shadow-xs group">
                <summary className="cursor-pointer list-none p-4 sm:p-5 flex items-center justify-between text-sm font-bold text-slate-900">
                  Dicas para reduzir o gasto com IA
                  <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                </summary>
                <ul className="px-5 pb-5 space-y-2 text-xs text-slate-600 leading-relaxed list-disc list-inside">
                  <li><b>Defina um limite por organização.</b> Assim nenhuma delas consome sozinha todo o orçamento.</li>
                  <li><b>Use o teto do mês como trava de segurança.</b> Ao atingi-lo, a IA para de ser usada e o gasto não passa dali.</li>
                  <li><b>Evite reavaliar a mesma pessoa na mesma vaga.</b> Cada nova análise custa de novo; reavalie só se o currículo ou a vaga mudarem.</li>
                  <li><b>Avalie com IA quem já avançou de etapa.</b> Usar a IA em todos os candidatos, inclusive os que serão descartados, é o que mais pesa no gasto.</li>
                  <li><b>Teste um modelo mais econômico.</b> Em "Ajustes de custo" você troca o modelo de IA; experimente em poucas avaliações e compare a qualidade antes de adotar de vez.</li>
                  <li><b>Pause a IA em caso de dúvida.</b> Com a IA pausada as avaliações continuam saindo (como estimativa local), mas sem custo.</li>
                </ul>
              </details>
            </div>
            <div className="xl:col-span-2">
              <Section title="O que chama atenção" subtitle="E como gastar menos">
                <Insights items={insights} onOpenRules={openRules} />
              </Section>
            </div>
          </div>

          {/* Por organização */}
          <Section
            title="Consumo por organização"
            subtitle={`${o.periodLabel} — o limite é sempre contado no mês atual`}
            right={
              o.organizations.length > 8 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar organização" className="pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs w-56 focus:outline-hidden focus:border-indigo-500" />
                </div>
              )
            }
          >
            <div className="overflow-x-auto -mx-4 sm:-mx-5">
              <table className="w-full text-left text-sm text-slate-600 min-w-[760px]">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-semibold border-y border-slate-100">
                  <tr>
                    <th className="px-5 py-3">Organização</th>
                    <th className="px-3 py-3 text-right">Avaliações com IA</th>
                    <th className="px-3 py-3 text-right">Gasto</th>
                    <th className="px-3 py-3 w-40">Parte do gasto</th>
                    <th className="px-3 py-3 w-52">Limite do mês</th>
                    <th className="px-3 py-3 text-right" title="Estimativas locais, falhas e bloqueios">Sem usar IA</th>
                    <th className="px-5 py-3 text-right"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orgs.map(g => {
                    const share = o.totals.costBrl > 0 ? (g.costBrl / o.totals.costBrl) * 100 : 0;
                    const used = g.monthlyLimit ? (g.monthEvaluations / g.monthlyLimit) * 100 : 0;
                    return (
                      <tr key={g.tenantId} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3">
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-slate-400" />{g.name}</div>
                          <div className="text-[11px] font-mono text-slate-400 ml-5">{g.slug}</div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{formatInt(g.evaluations)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{money(g.costBrl)}</td>
                        <td className="px-3 py-3">
                          {o.totals.costBrl > 0 ? (
                            <div className="flex items-center gap-2"><Bar percent={share} /><span className="text-[11px] w-9 text-right">{formatPercent(share)}</span></div>
                          ) : <span className="text-[11px] text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          {g.monthlyLimit == null ? (
                            <div className="text-xs text-slate-500">Sem limite <span className="text-slate-400">· usou {formatInt(g.monthEvaluations)} no mês</span></div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className={used >= 100 ? 'font-bold text-rose-700' : 'text-slate-700'}>{formatInt(g.monthEvaluations)} de {formatInt(g.monthlyLimit)}</span>
                                <span className="text-[10px] text-slate-400">{g.limitSource === 'custom' ? 'limite próprio' : 'padrão'}</span>
                              </div>
                              <Bar percent={used} />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{formatInt(g.withoutAi)}</td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => setEditing(g)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-white">
                            <Pencil className="w-3 h-3" /> Definir limite
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {orgs.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-10 text-center text-xs text-slate-400">Nenhuma organização encontrada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {o.organizationsTruncated && <p className="text-[11px] text-slate-400 mt-3">Mostrando as 200 organizações com maior gasto.</p>}
          </Section>

          {/* Regras */}
          <div ref={rulesRef} className="scroll-mt-24">
            <Section title="Regras de controle" subtitle="Valem para todas as organizações. Use para reduzir e travar o gasto.">
              <RulesCard key={o.settings.updatedAt ?? 'initial'} settings={o.settings} effectiveModel={o.effectiveModel} pricesReady={o.pricesReady} onSaved={load} />
            </Section>
          </div>


          <p className="text-[11px] text-slate-400 leading-relaxed">
            Os valores em reais são <b>estimativas</b>, calculadas a partir do volume de texto processado e dos preços informados em "Ajustes de custo".
            A cobrança oficial é a do Google e pode diferir um pouco. Datas e horas no horário de São Paulo.
          </p>
        </>
      )}

      {editing && o && (
        <OrgLimitModal
          org={editing}
          defaultLimit={o.settings.defaultOrgMonthlyLimit}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </div>
  );
};
