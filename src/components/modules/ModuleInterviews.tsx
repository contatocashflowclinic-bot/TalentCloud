import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Plus, Clock, Video, CheckCircle2, Star, User, MessageSquare, AlertTriangle } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { InterviewSession, Candidate, JobOpening } from '../../types.js';
import { formatDateTimeSP } from '../../utils/dateUtils.js';

export const ModuleInterviews: React.FC = () => {
  const { activeTenant } = useTenant();
  const [interviews, setInterviews] = useState<InterviewSession[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<InterviewSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalInterviews, setTotalInterviews] = useState(0);
  const pageSize = 25;

  // Scorecard filling state
  const [scorecardScores, setScorecardScores] = useState<Record<string, number>>({});
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [recommendation, setRecommendation] = useState('STRONG_HIRE');
  const [isSaving, setIsSaving] = useState(false);

  const loadData = async (targetPage = page) => {
    try {
      setLoading(true);
      setLoadError(null);
      const interviewPage = await TenantApi.getInterviewsPage({ page: targetPage, pageSize });
      const candidateIds = [...new Set(interviewPage.items.map(item => item.candidateId))];
      const jobIds = [...new Set(interviewPage.items.map(item => item.jobOpeningId))];
      const [cands, ops] = await Promise.all([
        candidateIds.length > 0 ? TenantApi.getCandidates({ ids: candidateIds }) : Promise.resolve([] as Candidate[]),
        jobIds.length > 0 ? TenantApi.getOpenings({ ids: jobIds }) : Promise.resolve([] as JobOpening[])
      ]);
      setInterviews(interviewPage.items);
      setTotalInterviews(interviewPage.total);
      setPage(interviewPage.page);
      setCandidates(cands);
      setOpenings(ops);
      setActiveSession(current => current && interviewPage.items.some(item => item.id === current.id) ? current : (interviewPage.items[0] ?? null));
    } catch (err) {
      console.error('Failed to load interviews:', err);
      setLoadError('Não foi possível carregar as entrevistas e dados relacionados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(page);
  }, [activeTenant?.id, page]);

  useEffect(() => {
    setPage(1);
  }, [activeTenant?.id]);

  const totalPages = Math.max(1, Math.ceil(totalInterviews / pageSize));
  const candidateById = useMemo(() => new Map(candidates.map(candidate => [candidate.id, candidate] as const)), [candidates]);
  const openingById = useMemo(() => new Map(openings.map(opening => [opening.id, opening] as const)), [openings]);

  const handleSaveScorecard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    try {
      setIsSaving(true);
      const updatedScorecard = activeSession.scorecard.map(item => ({
        ...item,
        score: scorecardScores[item.competency] ?? item.score
      }));

      const res = await TenantApi.completeInterviewScorecard(
        activeSession.id,
        updatedScorecard,
        recommendation,
        feedbackNotes
      );
      setActiveSession(res);
      await loadData(page);
      alert('Scorecard e feedback registrados com sucesso!');
    } catch (err: any) {
      alert(`Erro ao salvar scorecard: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Entrevistas & Scorecards Estruturados</h1>
          <p className="text-xs text-slate-500">
            Agenda de entrevistas, roteiros baseados em competências e avaliação humana imparcial.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{loadError}</span>
          <button onClick={() => loadData(page)} className="font-semibold underline">Tentar novamente</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Interview list */}
        <div className="space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Sessões Agendadas ({totalInterviews})
          </span>
          {loading && interviews.length === 0 && (
            <div className="p-6 text-center text-slate-400 text-xs animate-pulse rounded-2xl border border-slate-200 bg-white">
              Carregando entrevistas...
            </div>
          )}
          {interviews.map((item) => {
            const cand = candidateById.get(item.candidateId);
            const job = openingById.get(item.jobOpeningId);
            const isSelected = activeSession?.id === item.id;

            return (
              <div
                key={item.id}
                onClick={() => setActiveSession(item)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all space-y-2 text-xs ${
                  isSelected
                    ? 'bg-indigo-50/70 border-indigo-300 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{cand?.name || 'Candidato'}</h3>
                    <div className="text-[11px] text-slate-500">{job?.title || 'Vaga'}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    item.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {item.status === 'completed' ? 'Concluída' : 'Agendada'}
                  </span>
                </div>

                <div className="text-slate-500 flex items-center gap-3 pt-1">
                  <span className="flex items-center gap-1 font-mono text-[11px]" title="Horário de São Paulo - SP">
                    <Clock className="w-3 h-3 text-indigo-600" /> {formatDateTimeSP(item.scheduledFor)} ({item.durationMinutes} min)
                  </span>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-xl border border-slate-200 font-semibold disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="font-mono">{page}/{totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 rounded-xl border border-slate-200 font-semibold disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>

        {/* Right 2 Cols: Active Session Detail & Scorecard */}
        {activeSession ? (
          <div className="lg:col-span-2 space-y-5">
            <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                    {activeSession.stageName}
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">
                    {candidateById.get(activeSession.candidateId)?.name}
                  </h2>
                </div>
                {activeSession.meetLink && (
                  <a
                    href={activeSession.meetLink}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 self-start"
                  >
                    <Video className="w-3.5 h-3.5" />
                    Sala Virtual
                  </a>
                )}
              </div>

              {/* Structured Script Questions */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Roteiro de Perguntas Estruturadas
                </h3>
                <div className="space-y-1.5">
                  {activeSession.structuredScript.map((script, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700 flex items-start gap-2">
                      <span className="font-bold text-indigo-600">{idx + 1}.</span>
                      <span>{script}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scorecard Form */}
              <form onSubmit={handleSaveScorecard} className="space-y-4 pt-4 border-t border-slate-100 text-xs">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Scorecard de Avaliação por Competência
                </h3>

                <div className="space-y-3">
                  {activeSession.scorecard.map((item, idx) => (
                    <div key={idx} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <span className="font-semibold text-slate-900">{item.competency}</span>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map(rating => (
                          <button
                            key={rating}
                            type="button"
                            onClick={() => setScorecardScores({ ...scorecardScores, [item.competency]: rating })}
                            className={`w-7 h-7 rounded-lg font-bold text-xs flex items-center justify-center transition-colors ${
                              (scorecardScores[item.competency] ?? item.score) === rating
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {rating}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Recomendação do Entrevistador</label>
                  <select
                    value={recommendation}
                    onChange={(e) => setRecommendation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white font-medium"
                  >
                    <option value="STRONG_HIRE">Forte Recomendação de Contratação (Aprovado com Destaque)</option>
                    <option value="HIRE">Recomendar Contratação (Aprovado)</option>
                    <option value="NEUTRAL">Neutro (Avaliar com segundo parecer)</option>
                    <option value="DO_NOT_HIRE">Não Recomendar Contratação (Reprovado)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Feedback Detalhado</label>
                  <textarea
                    rows={2}
                    value={feedbackNotes}
                    onChange={(e) => setFeedbackNotes(e.target.value)}
                    placeholder="Evidências concretas observadas, síntese das respostas e impressão geral..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors"
                  >
                    {isSaving ? 'Salvando...' : 'Concluir & Salvar Scorecard'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs">Selecione uma entrevista</div>
        )}

      </div>
    </div>
  );
};
