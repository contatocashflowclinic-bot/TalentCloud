import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell
} from 'recharts';
import { Layers, Calendar, Users, Briefcase, Info } from 'lucide-react';
import { TenantIndicators, Department, JobOpening } from '../../types.js';

interface DepartmentRow {
  id: string;
  name: string;
  code: string;
  headcount: number;
  headcountTarget: number;
  occupancy: number | null;
  vacancies: number; // positions still open
  filled: number;    // positions already filled
}

interface IndicatorsOverviewChartsProps {
  indicators: TenantIndicators | null;
  departments: Department[];
  openings: JobOpening[];
  /** false = organization without the AI module: the funnel does not mention AI. */
  aiEnabled?: boolean;
}

const OPEN_STATUSES: JobOpening['status'][] = ['open', 'in_progress', 'offer'];

/**
 * Every number here comes from the organization's own records: the stored indicator set
 * (funnel) and live departments / job openings. Nothing is estimated or invented, so a
 * brand-new organization correctly shows zeros.
 */
export const IndicatorsOverviewCharts: React.FC<IndicatorsOverviewChartsProps> = ({
  indicators,
  departments,
  openings,
  aiEnabled = true
}) => {
  const [funnelMetricView, setFunnelMetricView] = useState<'volume' | 'conversion'>('volume');

  const rows: DepartmentRow[] = departments.map((d, index) => {
    const deptOpenings = openings.filter(o => o.departmentId === d.id);
    return {
      id: d.id,
      name: d.name,
      code: d.code || `D-${index + 1}`,
      headcount: d.currentHeadcount,
      headcountTarget: d.headcountTarget,
      occupancy: d.headcountTarget > 0 ? Number(((d.currentHeadcount / d.headcountTarget) * 100).toFixed(1)) : null,
      vacancies: deptOpenings
        .filter(o => OPEN_STATUSES.includes(o.status))
        .reduce((acc, o) => acc + Math.max(o.openingsCount - o.filledCount, 0), 0),
      filled: deptOpenings.reduce((acc, o) => acc + o.filledCount, 0)
    };
  });

  const funnel = indicators?.recruitmentFunnel ?? { applied: 0, screened: 0, interviewed: 0, offered: 0, hired: 0 };
  const pct = (part: number, whole: number) => (whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : 0);

  const funnelData = [
    { stage: '1. Inscrições', label: 'Triagem Inicial', candidatos: funnel.applied, conversaoEtapa: funnel.applied > 0 ? 100 : 0, conversaoGlobal: funnel.applied > 0 ? 100 : 0, dropoff: 0, color: '#4f46e5' },
    { stage: aiEnabled ? '2. Fit Cultural IA' : '2. Triagem', label: aiEnabled ? 'Calibração DNA' : 'Avaliação de perfil', candidatos: funnel.screened, conversaoEtapa: pct(funnel.screened, funnel.applied), conversaoGlobal: pct(funnel.screened, funnel.applied), dropoff: Math.max(funnel.applied - funnel.screened, 0), color: '#2563eb' },
    { stage: '3. Entrevista', label: 'Scorecard & Cases', candidatos: funnel.interviewed, conversaoEtapa: pct(funnel.interviewed, funnel.screened), conversaoGlobal: pct(funnel.interviewed, funnel.applied), dropoff: Math.max(funnel.screened - funnel.interviewed, 0), color: '#0891b2' },
    { stage: '4. Proposta Enviada', label: 'Oferta Salarial', candidatos: funnel.offered, conversaoEtapa: pct(funnel.offered, funnel.interviewed), conversaoGlobal: pct(funnel.offered, funnel.applied), dropoff: Math.max(funnel.interviewed - funnel.offered, 0), color: '#d97706' },
    { stage: '5. Admissão', label: 'Contratação Aceita', candidatos: funnel.hired, conversaoEtapa: pct(funnel.hired, funnel.offered), conversaoGlobal: pct(funnel.hired, funnel.applied), dropoff: Math.max(funnel.offered - funnel.hired, 0), color: '#059669' }
  ];

  const totalHeadcount = rows.reduce((a, r) => a + r.headcount, 0);
  const totalTarget = rows.reduce((a, r) => a + r.headcountTarget, 0);
  const totalVacancies = rows.reduce((a, r) => a + r.vacancies, 0);
  const totalFilled = rows.reduce((a, r) => a + r.filled, 0);

  const tooltipBox = 'bg-slate-900 text-white p-3 rounded-xl shadow-xs text-xs space-y-1 border border-slate-800';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Painel de Visão Geral Analítica</h2>
            <p className="text-xs text-slate-500">
              Funil de contratação e situação do quadro por departamento, calculados com os dados desta organização.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <span className="font-semibold">Período:</span>
            <span className="font-mono text-indigo-700 font-bold">{indicators?.period ?? '—'}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
            <Users className="w-3.5 h-3.5 text-indigo-600" />
            <span className="font-semibold">Quadro:</span>
            <span className="font-mono font-bold">{totalHeadcount}/{totalTarget}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
            <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
            <span className="font-semibold">Vagas em aberto:</span>
            <span className="font-mono font-bold">{totalVacancies}</span>
          </div>
        </div>
      </div>

      {/* Chart 1: Funil */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
              Pipeline Seletivo
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1">Funil de Contratação & Taxas de Conversão</h3>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
            {(['volume', 'conversion'] as const).map(view => (
              <button
                key={view}
                onClick={() => setFunnelMetricView(view)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  funnelMetricView === view ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {view === 'volume' ? 'Volume de Candidatos' : 'Taxas de Conversão (%)'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {funnelData.map((item, idx) => (
            <div key={idx} className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col justify-between">
              <div>
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{item.stage}</div>
                <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                  {item.candidatos} <span className="text-xs font-normal text-slate-500">cand.</span>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Do total:</span>
                <span className="font-mono font-bold text-indigo-600">{item.conversaoGlobal}%</span>
              </div>
            </div>
          ))}
        </div>

        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelData} layout="vertical" margin={{ top: 10, right: 30, left: 40, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#64748b' }}
                domain={funnelMetricView === 'volume' ? [0, (max: number) => Math.max(max, 1)] : [0, 100]}
                unit={funnelMetricView === 'volume' ? '' : '%'}
              />
              <YAxis type="category" dataKey="stage" tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} width={120} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className={tooltipBox}>
                      <div className="font-bold text-slate-100">{d.stage} ({d.label})</div>
                      <div className="text-indigo-300">Volume: <span className="font-mono font-bold text-white">{d.candidatos}</span> candidatos</div>
                      <div className="text-emerald-300">Conversão da etapa: <span className="font-mono font-bold text-white">{d.conversaoEtapa}%</span></div>
                      <div className="text-slate-400">Conversão fim-a-fim: <span className="font-mono font-bold text-white">{d.conversaoGlobal}%</span></div>
                      {d.dropoff > 0 && (
                        <div className="text-rose-300 text-[10px] pt-1 border-t border-slate-800">Perda nesta transição: {d.dropoff} candidatos</div>
                      )}
                    </div>
                  );
                }}
              />
              <Bar
                dataKey={funnelMetricView === 'volume' ? 'candidatos' : 'conversaoEtapa'}
                name={funnelMetricView === 'volume' ? 'Candidatos' : 'Conversão (%)'}
                radius={[0, 8, 8, 0]}
              >
                {funnelData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-indigo-600 flex-shrink-0" />
            <span>
              Do total de inscrições, <strong>{funnelData[2].conversaoGlobal}%</strong> chegaram à etapa de entrevistas e{' '}
              <strong>{funnelData[4].conversaoGlobal}%</strong> foram admitidas.
            </span>
          </div>
          <span className="hidden sm:inline font-mono text-[11px] text-slate-400">Período {indicators?.period ?? '—'}</span>
        </div>
      </div>

      {/* Charts 2 & 3 */}
      {rows.length === 0 ? (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs text-center text-xs text-slate-500">
          Cadastre departamentos no módulo <strong>Estrutura Organizacional</strong> para ver o quadro e as vagas por departamento.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
                Estrutura
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1">Quadro Atual vs Meta por Departamento</h3>
              <p className="text-xs text-slate-500">Colaboradores atuais comparados ao quadro planejado.</p>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} interval={0} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as DepartmentRow;
                      return (
                        <div className={tooltipBox}>
                          <div className="font-bold text-slate-100">{d.name}</div>
                          <div>Quadro atual: <span className="font-mono font-bold">{d.headcount}</span></div>
                          <div>Meta de quadro: <span className="font-mono font-bold">{d.headcountTarget}</span></div>
                          <div className="text-slate-400">Ocupação: {d.occupancy === null ? '—' : `${d.occupancy}%`}</div>
                        </div>
                      );
                    }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }} />
                  <Bar dataKey="headcount" name="Quadro atual" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="headcountTarget" name="Meta de quadro" fill="#e2e8f0" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-100">
                Vagas
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1">Vagas em Aberto vs Preenchidas por Departamento</h3>
              <p className="text-xs text-slate-500">
                Posições ainda em aberto e posições já preenchidas nas vagas cadastradas ({totalVacancies} em aberto, {totalFilled} preenchidas).
              </p>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} interval={0} angle={-15} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as DepartmentRow;
                      return (
                        <div className={tooltipBox}>
                          <div className="font-bold text-slate-100">{d.name}</div>
                          <div>Em aberto: <span className="font-mono font-bold">{d.vacancies}</span></div>
                          <div>Preenchidas: <span className="font-mono font-bold">{d.filled}</span></div>
                        </div>
                      );
                    }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }} />
                  <Bar dataKey="vacancies" name="Em aberto" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="filled" name="Preenchidas" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Summary table */}
      {rows.length > 0 && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Diagnóstico Consolidado por Departamento</h3>
              <p className="text-xs text-slate-500">Quadro, ocupação e vagas, direto dos registros da organização.</p>
            </div>
            <span className="text-xs font-mono text-slate-400">{rows.length} departamentos</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/70">
                  <th className="py-2.5 px-3">Departamento</th>
                  <th className="py-2.5 px-3">Quadro atual</th>
                  <th className="py-2.5 px-3">Meta de quadro</th>
                  <th className="py-2.5 px-3">Ocupação</th>
                  <th className="py-2.5 px-3">Vagas em aberto</th>
                  <th className="py-2.5 px-3">Vagas preenchidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-3 font-semibold text-slate-900">
                      {r.name}
                      <span className="ml-1.5 px-1.5 rounded text-[10px] font-mono bg-slate-100 text-slate-500">{r.code}</span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">{r.headcount}</td>
                    <td className="py-3 px-3 font-mono text-slate-500">{r.headcountTarget}</td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-900">{r.occupancy === null ? '—' : `${r.occupancy}%`}</td>
                    <td className="py-3 px-3 font-mono text-indigo-600 font-bold">{r.vacancies}</td>
                    <td className="py-3 px-3 font-mono text-slate-700">{r.filled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
