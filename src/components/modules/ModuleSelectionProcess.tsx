import React, { useState, useEffect } from 'react';
import { GitBranch, User, Sparkles, ChevronRight, CheckCircle2, ArrowRight } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { SelectionApplication, JobOpening, Candidate, AIAssistedEvaluation } from '../../types.js';

export const ModuleSelectionProcess: React.FC<{
  initialJobId?: string;
  initialCandidateId?: string;
  onNavigateToAI?: (candidateId: string, jobId: string) => void;
}> = ({ initialJobId, initialCandidateId, onNavigateToAI }) => {
  const { activeTenant } = useTenant();
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [applications, setApplications] = useState<SelectionApplication[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [aiEvaluations, setAiEvaluations] = useState<AIAssistedEvaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (initialJobId) {
      setSelectedJobId(initialJobId);
    }
  }, [initialJobId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ops, apps, cands, evals] = await Promise.all([
        TenantApi.getOpenings(),
        TenantApi.getApplications(),
        TenantApi.getCandidates(),
        TenantApi.getAIEvaluations()
      ]);
      setOpenings(ops);
      setApplications(apps);
      setCandidates(cands);
      setAiEvaluations(evals);

      if (initialJobId && ops.some(o => o.id === initialJobId)) {
        setSelectedJobId(initialJobId);
      } else if (ops.length > 0 && !selectedJobId) {
        setSelectedJobId(ops[0].id);
      }
    } catch (err) {
      console.error('Failed to load selection process:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTenant?.id]);

  const activeJob = openings.find(o => o.id === selectedJobId) || openings[0];

  const handleAdvanceStage = async (appId: string, currentStageId: string) => {
    if (!activeJob) return;
    const currentIndex = activeJob.stages.findIndex(s => s.id === currentStageId);
    if (currentIndex < activeJob.stages.length - 1) {
      const nextStage = activeJob.stages[currentIndex + 1];
      try {
        await TenantApi.updateApplicationStage(appId, nextStage.id, `Avançado para a etapa '${nextStage.name}'`);
        await loadData();
      } catch (err: any) {
        alert(`Erro ao avançar etapa: ${err.message}`);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Módulo 8</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-mono text-slate-500">Partição: {activeTenant?.dbConfig?.dbName}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Processo Seletivo & Pipeline Kanban</h1>
          <p className="text-xs text-slate-500">
            Acompanhamento visual de candidatos ao longo do funil de seleção com rastreabilidade auditável.
          </p>
        </div>

        {/* Job selector dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Vaga Selecionada:</span>
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800 focus:outline-hidden focus:border-indigo-500 shadow-xs"
          >
            {openings.map(o => (
              <option key={o.id} value={o.id}>{o.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Kanban Pipeline Stages - Spacious Columns */}
      {activeJob ? (
        <div className="flex gap-4 sm:gap-5 overflow-x-auto pb-6 pt-1">
          {activeJob.stages.map((stage, sIdx) => {
            const stageApps = applications.filter(
              a => a.jobOpeningId === activeJob.id && a.currentStageId === stage.id
            );

            return (
              <div
                key={stage.id}
                className="bg-slate-100/75 rounded-3xl p-4 sm:p-5 border border-slate-200/80 flex-1 min-w-[290px] xl:min-w-[320px] max-w-[380px] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-3.5 border-b border-slate-200">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                        {sIdx + 1}
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm truncate max-w-[160px]" title={stage.name}>
                        {stage.name}
                      </h3>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white text-slate-700 border border-slate-200/80 shadow-2xs font-mono">
                      {stageApps.length}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3.5">
                    {stageApps.map((app) => {
                      const candidate = candidates.find(c => c.id === app.candidateId);
                      const evalItem = aiEvaluations.find(e => e.candidateId === app.candidateId && e.jobOpeningId === activeJob.id);
                      const isHighlighted = initialCandidateId && candidate?.id === initialCandidateId;
                      const initials = candidate?.name
                        ? candidate.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
                        : 'CD';

                      return (
                        <div
                          key={app.id}
                          className={`p-4 rounded-2xl bg-white border transition-all space-y-3 group ${
                            isHighlighted
                              ? 'border-indigo-500 ring-4 ring-indigo-500/20 shadow-md bg-indigo-50/30'
                              : 'border-slate-200/90 shadow-2xs hover:shadow-md hover:border-indigo-300'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-900 text-sm truncate group-hover:text-indigo-600 transition-colors">
                                  {candidate?.name || 'Candidato'}
                                </span>
                                {isHighlighted && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-indigo-100 text-indigo-800">
                                    Busca
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 truncate mt-0.5">
                                {candidate?.currentRole || 'Profissional'} • {candidate?.yearsOfExperience}a exp
                              </div>
                            </div>
                          </div>

                          {/* AI Score Badge with Bar if evaluated */}
                          {evalItem ? (
                            <div className="p-2.5 rounded-xl bg-indigo-50/80 border border-indigo-100/90 space-y-1.5 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1 font-semibold text-indigo-950 text-[11px]">
                                  <Sparkles className="w-3 h-3 text-indigo-600" />
                                  Fit Preditivo IA:
                                </span>
                                <span className="font-mono font-bold text-indigo-700 text-xs">
                                  {evalItem.overallFitScore}%
                                </span>
                              </div>
                              <div className="w-full bg-indigo-200/60 rounded-full h-1 overflow-hidden">
                                <div
                                  className="bg-indigo-600 h-1 rounded-full"
                                  style={{ width: `${Math.min(100, Math.max(0, evalItem.overallFitScore))}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="px-2 py-1 rounded-lg bg-slate-50 text-[10px] text-slate-400 italic">
                              Avaliação IA não realizada
                            </div>
                          )}

                          {/* Actions */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                            {onNavigateToAI && (
                              <button
                                onClick={() => onNavigateToAI(app.candidateId, activeJob.id)}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 py-1 px-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                                title="Ver ou gerar avaliação assistida com IA (Gemini)"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                {evalItem ? 'Ver Análise IA' : 'Avaliar com IA'}
                              </button>
                            )}

                            {sIdx < activeJob.stages.length - 1 && (
                              <button
                                onClick={() => handleAdvanceStage(app.id, stage.id)}
                                className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 text-xs font-medium flex items-center gap-1 transition-colors"
                                title="Avançar para próxima etapa do processo"
                              >
                                <span>Avançar</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {stageApps.length === 0 && (
                      <div className="py-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl bg-white/50">
                        Nenhum candidato nesta etapa
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-8 text-center text-slate-500">Nenhuma vaga ativa encontrada.</div>
      )}
    </div>
  );
};
