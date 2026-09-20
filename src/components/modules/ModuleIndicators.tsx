import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Clock,
  DollarSign,
  Target,
  UserCheck,
  TrendingUp,
  Award,
  Layers,
  ShieldCheck,
  Calendar,
  CheckCircle2
} from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { TenantIndicators, Department, JobOpening, AIAssistedEvaluation } from '../../types.js';
import { ExportButton } from '../ExportButton.js';
import { exportIndicatorsToCSV, exportIndicatorsToPDF } from '../../utils/exportUtils.js';
import { IndicatorsOverviewCharts } from '../indicators/IndicatorsOverviewCharts.js';

export const ModuleIndicators: React.FC = () => {
  const { activeTenant } = useTenant();
  const [indicators, setIndicators] = useState<TenantIndicators | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'governance'>('overview');
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [evaluations, setEvaluations] = useState<AIAssistedEvaluation[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [indicatorsData, deptsData, openingsData, evaluationsData] = await Promise.all([
          TenantApi.getIndicators(),
          TenantApi.getDepartments().catch(() => [] as Department[]),
          TenantApi.getOpenings().catch(() => [] as JobOpening[]),
          TenantApi.getAIEvaluations().catch(() => [] as AIAssistedEvaluation[])
        ]);
        setIndicators(indicatorsData);
        setDepartments(deptsData || []);
        setOpenings(openingsData || []);
        setEvaluations(evaluationsData || []);
      } catch (err) {
        console.error('Failed to load indicators:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeTenant?.id]);

  // Human-vs-AI governance, computed from this organization's reviewed evaluations
  const reviewed = evaluations.filter(e => e.humanReviewerDecision);
  const overruled = reviewed.filter(e => e.humanReviewerDecision === 'OVERRIDDEN').length;
  const overrulePct = reviewed.length ? (overruled / reviewed.length) * 100 : null;
  const agreementPct = overrulePct === null ? null : 100 - overrulePct;
  const fmtPct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`);

  const handleExportCSV = () => {
    exportIndicatorsToCSV(indicators, activeTenant?.name || 'TalentCloud');
  };

  const handleExportPDF = () => {
    exportIndicatorsToPDF(
      indicators,
      activeTenant?.name || 'TalentCloud',
      activeTenant?.dbConfig?.dbName || 'tenant'
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Módulo 15</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Indicadores & People Analytics</h1>
          <p className="text-xs text-slate-500">
            Painel consolidado com o funil de contratação, o quadro e as vagas por departamento desta organização.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Period of the stored indicator set */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-xs text-xs">
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-slate-500">Período:</span>
            <span className="font-mono font-bold text-indigo-700">{indicators?.period ?? '—'}</span>
          </div>

          <ExportButton
            onExportCSV={handleExportCSV}
            onExportPDF={handleExportPDF}
            label="Exportar Relatório"
          />
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-px">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
            activeTab === 'overview'
              ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Painel de Visão Geral (Gráficos)</span>
        </button>

        <button
          onClick={() => setActiveTab('governance')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 ${
            activeTab === 'governance'
              ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Governança & Decisão Humana</span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
            Time to Hire
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {indicators?.timeToHireDays ?? 0} <span className="text-xs font-normal text-slate-500">dias</span>
          </div>
          <div className="text-[10px] text-slate-500">Média no período</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
            <Target className="w-3.5 h-3.5 text-indigo-600" />
            Fit Cultural Médio
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-600">
            {indicators?.averageCulturalFit ?? 0}%
          </div>
          <div className="text-[10px] text-slate-500">Calibrado via DNA</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
            <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
            Custo / Contratação
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            R$ {(indicators?.costPerHire ?? 0).toLocaleString('pt-BR')}
          </div>
          <div className="text-[10px] text-slate-500">Média no período</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
            Retenção 90 dias
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600">
            {indicators && indicators.totalHiresThisQuarter > 0 ? `${(100 - indicators.earlyTurnover90DaysRate).toFixed(1)}%` : '—'}
          </div>
          <div className="text-[10px] text-slate-500">Pós-onboarding</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
            <Award className="w-3.5 h-3.5 text-indigo-600" />
            c-NPS Candidatos
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {(indicators?.candidateNPS ?? 0) > 0 ? '+' : ''}{indicators?.candidateNPS ?? 0}
          </div>
          <div className="text-[10px] text-slate-500">Net Promoter Score</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
            <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
            Vagas Fechadas
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {indicators?.totalHiresThisQuarter ?? 0}
          </div>
          <div className="text-[10px] text-slate-500">Neste trimestre</div>
        </div>

      </div>

      {/* Main Tab Content */}
      {activeTab === 'overview' ? (
        <IndicatorsOverviewCharts
          indicators={indicators}
          departments={departments}
          openings={openings}
        />
      ) : (
        /* Quality of Decision & Principles Tab */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                Auditoria de Princípios & Qualidade da Decisão
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Métricas de governança entre recomendações preditivas e o julgamento humano dos gestores ({reviewed.length} avaliações revisadas).
              </p>
            </div>
            
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">Concordância Humano vs IA Assistida</div>
                  <div className="text-[11px] text-slate-500">Taxa onde a validação humana confirmou a recomendação preditiva</div>
                </div>
                <span className="font-mono font-bold text-base text-indigo-600">{fmtPct(agreementPct)}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">Overrules Humanos Registrados com Justificativa</div>
                  <div className="text-[11px] text-slate-500">Decisões onde o gestor exerceu sua soberania técnica com parecer obrigatório</div>
                </div>
                <span className="font-mono font-bold text-base text-amber-600">{fmtPct(overrulePct)}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">Rastreabilidade das Ações Sensíveis</div>
                  <div className="text-[11px] text-slate-500">Ações sensíveis registradas no log de auditoria da plataforma</div>
                </div>
                <span className="font-mono font-bold text-base text-emerald-600">Ativa</span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">Carimbo de Data/Hora Oficial</div>
                  <div className="text-[11px] text-slate-500">Auditoria cronológica padronizada no fuso de Brasília / São Paulo (SP)</div>
                </div>
                <span className="font-mono font-bold text-base text-slate-700">GMT-3</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between space-y-4">
            <div>
              <div className="pb-2 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                  Declaração de Conformidade & Ética em IA
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Princípios inegociáveis de transparência algorítmica da plataforma TalentCloud.
                </p>
              </div>

              <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-600">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-900">Zero Caixa Preta (Explainability):</strong> Todo score de fit cultural e técnico é acompanhado por justificativa contextual, pontos fortes e lacunas detectadas.
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-900">Soberania da Decisão Humana:</strong> Nenhum candidato é reprovado ou admitido automaticamente. A decisão final é prerrogativa exclusiva do gestor da vaga.
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-900">Isolamento Absoluto de Dados:</strong> O modelo de IA nunca utiliza dados de candidatos de uma organização para treinar ou calibrar outras organizações.
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100 text-indigo-900 text-xs">
              <span className="font-bold block mb-0.5">Conformidade com a LGPD:</span>
              Garantia de auditoria perene para conformidade com a Lei Geral de Proteção de Dados e diretrizes de IA responsável.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

