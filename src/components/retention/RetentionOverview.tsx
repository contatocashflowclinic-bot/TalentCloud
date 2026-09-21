import React from 'react';
import { CLIMATE_CATEGORIES, type RetentionMetrics } from '../../types.js';
import { CATEGORY_LABEL, ZONE_LABEL } from '../../retention.js';
import { ZONE_STYLE, formatEnps } from '../../utils/retentionUtils.js';

interface Props {
  metrics: RetentionMetrics;
}

/** Visão geral: eNPS, alertas ativos, retenção em 90 dias, notas por categoria e evolução das pesquisas. */
export const RetentionOverview: React.FC<Props> = ({ metrics }) => {
  const { enps, zone, categoryAverages, trend } = metrics;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-900 to-slate-900 text-white shadow-md space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">eNPS da Organização</span>
          {enps ? (
            <>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-4xl font-extrabold font-mono text-white">{formatEnps(enps.score)}</span>
                {zone && <span className={`text-xs font-semibold px-2 py-0.5 rounded ${ZONE_STYLE[zone]}`}>{ZONE_LABEL[zone]}</span>}
              </div>
              <p className="text-[11px] text-slate-300">
                {enps.promoters} promotores · {enps.passives} neutros · {enps.detractors} detratores
                {metrics.enpsSource ? ` — ${metrics.enpsSource}` : ''}
              </p>
            </>
          ) : (
            <>
              <div className="text-3xl font-extrabold font-mono text-slate-400">—</div>
              <p className="text-[11px] text-slate-300">Ainda não há pesquisa com resultado liberado. Publique uma pesquisa na aba Pesquisas.</p>
            </>
          )}
        </div>

        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Alertas de Risco Ativos</span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold font-mono text-amber-600">{metrics.activeAlerts}</span>
            <span className="text-xs text-slate-500">{metrics.activeAlerts === 1 ? 'colaborador sob observação' : 'colaboradores sob observação'}</span>
          </div>
          <p className="text-[11px] text-slate-500">
            {metrics.alertsByRisk.Alto} de risco alto · {metrics.alertsByRisk['Médio']} médio · {metrics.alertsByRisk.Baixo} baixo
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Taxa de Retenção (90 dias)</span>
          {metrics.retention90Rate !== null ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold font-mono text-emerald-600">{metrics.retention90Rate.toLocaleString('pt-BR')}%</span>
              </div>
              <p className="text-[11px] text-slate-500">Permanência após o onboarding, a mesma taxa do módulo Indicadores.</p>
            </>
          ) : (
            <>
              <div className="text-3xl font-extrabold font-mono text-slate-300">—</div>
              <p className="text-[11px] text-slate-500">Sem base de cálculo: ainda não há contratações registradas nos Indicadores.</p>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Notas por categoria</h3>
          {categoryAverages ? (
            <div className="space-y-3">
              {CLIMATE_CATEGORIES.map(c => (
                <div key={c} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{CATEGORY_LABEL[c]}</span>
                    <span className="font-mono text-slate-600">{categoryAverages[c].toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`${CATEGORY_LABEL[c]}: ${categoryAverages[c]} de 10`}>
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(categoryAverages[c] / 10) * 100}%` }} />
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-slate-400">Média de 0 a 10 na pesquisa mais recente com resultado liberado.</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">As notas aparecem quando uma pesquisa tiver resultado liberado.</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Evolução do eNPS</h3>
          {trend.length > 0 ? (
            <div className="space-y-2.5">
              {trend.map(point => (
                <div key={point.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-700 truncate">{point.label}</span>
                    <span className="font-mono text-slate-600 shrink-0">
                      {formatEnps(point.enps)} <span className="text-slate-400">· {point.responses} {point.responses === 1 ? 'resposta' : 'respostas'}</span>
                    </span>
                  </div>
                  {/* -100..+100 mapped to 0..100% */}
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`eNPS ${point.enps} em ${point.label}`}>
                    <div className={`h-full rounded-full ${point.enps < 0 ? 'bg-rose-400' : 'bg-emerald-500'}`} style={{ width: `${Math.max(2, (point.enps + 100) / 2)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Ainda não há pesquisas para comparar.</p>
          )}
        </div>
      </div>
    </div>
  );
};
