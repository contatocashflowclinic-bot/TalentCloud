import React, { useState, useEffect } from 'react';
import { GitBranch, User, Sparkles, ChevronRight, CheckCircle2, ArrowRight } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { SelectionApplication, JobOpening, Candidate, AIAssistedEvaluation, InterviewSession } from '../../types.js';
import { useAuth } from '../../context/AuthContext.js';
import { ApplicationSummaryModal } from './ApplicationSummaryModal.js';
import { isLocalEstimate } from '../../utils/aiEvaluation.js';

export const ModuleSelectionProcess: React.FC<{
  initialJobId?: string;
  initialCandidateId?: string;
  onNavigateToAI?: (candidateId: string, jobId: string) => void;
  onNavigateToCandidate?: (candidateId: string, searchTerm?: string) => void;
}> = ({ initialJobId, initialCandidateId, onNavigateToAI, onNavigateToCandidate }) => {
  const { activeTenant } = useTenant();
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [applications, setApplications] = useState<SelectionApplication[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [aiEvaluations, setAiEvaluations] = useState<AIAssistedEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [interviews, setInterviews] = useState<InterviewSession[]>([]);
  const [summaryAppId, setSummaryAppId] = useState<string | null>(null);

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
        TenantApi.getAIEvaluations(),
        // Entrevistas só enriquecem o resumo; sem permissão de ver entrevistas o Kanban segue funcionando.
        TenantApi.getInterviews().then(setInterviews).catch(() => setInterviews([]))
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

  const summaryApp = applications.find(a => a.id === summaryAppId);

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

  // Archiving keeps the record (status "rejected") and the reason in the process history; it can be reactivated.
  const handleArchive = async (app: SelectionApplication, reason: string) => {
    try {
      await TenantApi.updateApplicationStage(app.id, undefined, `Candidatura arquivada. Motivo: ${reason}`, 'rejected');
      await loadData();
    } catch (err: any) {
      alert(`Erro ao arquivar: ${err.message}`);
    }
  };

  const handleReactivate = async (app: SelectionApplication) => {
    try {
      await TenantApi.updateApplicationStage(app.id, undefined, 'Candidatura reativada.', 'in_review');
      await loadData();
    } catch (err: any) {
      alert(`Erro ao reativar: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Processo Seletivo & Pipeline Kanban</h1>
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
                          onClick={() => setSummaryAppId(app.id)}
                          className={`p-4 rounded-2xl bg-white border transition-all space-y-3 group cursor-pointer ${app.status === 'rejected' ? 'opacity-70 ' : ''}${
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
                                {app.status === 'hired' && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800">Contratado</span>
                                )}
                                {app.status === 'rejected' && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-rose-100 text-rose-700">Arquivada</span>
                                )}
                                {app.status === 'hold' && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-800">Em espera</span>
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
                                  {isLocalEstimate(evalItem) ? 'Estimativa local (não é IA):' : 'Fit Preditivo IA:'}
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
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 cursor-default"
                          >
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

                            {sIdx < activeJob.stages.length - 1 && app.status !== 'rejected' && app.status !== 'hired' && (
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

      {summaryApp && activeJob && (
        <ApplicationSummaryModal
          application={summaryApp}
          candidate={candidates.find(c => c.id === summaryApp.candidateId)}
          job={activeJob}
          evaluation={aiEvaluations.find(e => e.candidateId === summaryApp.candidateId && e.jobOpeningId === activeJob.id)}
          interviews={interviews.filter(i => i.candidateId === summaryApp.candidateId && i.jobOpeningId === activeJob.id)}
          canEdit={!!user?.permissions.includes('selection:edit')}
          onAdvance={async () => {
            await handleAdvanceStage(summaryApp.id, summaryApp.currentStageId);
            setSummaryAppId(null);
          }}
          onArchive={async (reason) => { await handleArchive(summaryApp, reason); }}
          onReactivate={async () => { await handleReactivate(summaryApp); }}
          onOpenProfile={onNavigateToCandidate ? () => {
            const candidate = candidates.find(c => c.id === summaryApp.candidateId);
            onNavigateToCandidate(summaryApp.candidateId, candidate?.name);
          } : undefined}
          onOpenAI={onNavigateToAI ? () => onNavigateToAI(summaryApp.candidateId, activeJob.id) : undefined}
          organizationName={activeTenant?.name}
          printedBy={user?.name}
          onClose={() => setSummaryAppId(null)}
        />
      )}
    </div>
  );
};
