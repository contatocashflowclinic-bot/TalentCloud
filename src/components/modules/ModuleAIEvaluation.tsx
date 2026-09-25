import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  Brain,
  MessageSquareQuote,
  RotateCw,
  Undo2,
  X,
  type LucideIcon
} from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { Candidate, JobOpening, AIAssistedEvaluation, OrganizationalDNA } from '../../types.js';
import { formatDateTimeSP } from '../../utils/dateUtils.js';
import { FIT_LEVEL_LABEL, fitLevel, isLocalEstimate, type FitLevel } from '../../utils/aiEvaluation.js';

type HumanDecision = NonNullable<AIAssistedEvaluation['humanReviewerDecision']>;

const DECISION_OPTIONS: { value: HumanDecision; label: string; Icon: LucideIcon; active: string; icon: string }[] = [
  { value: 'APPROVED', label: 'Aprovar para Próxima Etapa', Icon: ThumbsUp, active: 'bg-emerald-50 border-emerald-300 text-emerald-900', icon: 'text-emerald-600' },
  { value: 'REQUEST_ADDITIONAL_INTERVIEW', label: 'Aprofundar em Entrevista', Icon: HelpCircle, active: 'bg-amber-50 border-amber-300 text-amber-900', icon: 'text-amber-600' },
  { value: 'REJECTED', label: 'Desqualificar com Feedback', Icon: ThumbsDown, active: 'bg-rose-50 border-rose-300 text-rose-900', icon: 'text-rose-600' },
  { value: 'OVERRIDDEN', label: 'Divergir da Avaliação da IA', Icon: Undo2, active: 'bg-violet-50 border-violet-300 text-violet-900', icon: 'text-violet-600' }
];

const DECISION_STATUS: Record<HumanDecision, { label: string; cls: string }> = {
  APPROVED: { label: 'Aprovado para a próxima etapa', cls: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: 'Desqualificado', cls: 'bg-rose-100 text-rose-800' },
  REQUEST_ADDITIONAL_INTERVIEW: { label: 'Aprofundar em entrevista', cls: 'bg-amber-100 text-amber-800' },
  OVERRIDDEN: { label: 'Divergiu da avaliação da IA', cls: 'bg-violet-100 text-violet-800' }
};

const FIT_BADGE: Record<FitLevel, string> = {
  high: 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40',
  medium: 'bg-amber-500/30 text-amber-300 border border-amber-500/40',
  low: 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
};

const SOURCE_LABEL: Record<NonNullable<AIAssistedEvaluation['source']>, string> = {
  gemini: 'Modelo de IA (Gemini)',
  heuristic: 'Estimativa local por regras — não é IA'
};

export const ModuleAIEvaluation: React.FC<{
  preselectedCandidateId?: string;
  preselectedJobId?: string;
}> = ({ preselectedCandidateId, preselectedJobId }) => {
  const { activeTenant } = useTenant();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [evaluations, setEvaluations] = useState<AIAssistedEvaluation[]>([]);
  const [dna, setDna] = useState<OrganizationalDNA | null>(null);
  const [loading, setLoading] = useState(true);

  // Selection states
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Human Review Form. No decision is pre-selected: choosing one is the reviewer's own act.
  const [humanDecision, setHumanDecision] = useState<HumanDecision | null>(null);
  const [humanNotes, setHumanNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Not an error: the AI could not answer and the previous evaluation was kept
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setActionError(null);
      const [ops, dnaData] = await Promise.all([
        TenantApi.getOpenings(),
        TenantApi.getDNA()
      ]);
      setCandidates([]);
      setOpenings(ops);
      setEvaluations([]);
      setDna(dnaData);

      const targetJob = preselectedJobId || (ops[0]?.id ?? '');
      setSelectedJobId(targetJob);
      if (preselectedCandidateId) setSelectedCandidateId(preselectedCandidateId);
    } catch (err) {
      console.error('Failed to load AI evaluation data:', err);
      setActionError('Não foi possível carregar os dados da avaliação assistida. Atualize a página e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTenant?.id]);

  useEffect(() => {
    if (preselectedCandidateId) setSelectedCandidateId(preselectedCandidateId);
    if (preselectedJobId) setSelectedJobId(preselectedJobId);
  }, [preselectedCandidateId, preselectedJobId]);

  const loadJobContext = async (jobId = selectedJobId, preferredCandidateId = selectedCandidateId) => {
    if (!jobId) {
      setCandidates([]);
      setEvaluations([]);
      setSelectedCandidateId('');
      return;
    }
    try {
      setActionError(null);
      const [apps, evals] = await Promise.all([
        TenantApi.getApplications({ jobId }),
        TenantApi.getAIEvaluations({ jobId })
      ]);
      const candidateIds = [...new Set([
        ...apps.map(app => app.candidateId),
        ...(preferredCandidateId ? [preferredCandidateId] : [])
      ])];
      const cands = candidateIds.length > 0 ? await TenantApi.getCandidates({ ids: candidateIds }) : [];
      setCandidates(cands);
      setEvaluations(evals);
      setSelectedCandidateId(current => {
        const wanted = preferredCandidateId || current;
        if (wanted && cands.some(candidate => candidate.id === wanted)) return wanted;
        return cands[0]?.id ?? '';
      });
    } catch (err) {
      console.error('Failed to load AI evaluation context for selected job:', err);
      setActionError('Não foi possível carregar candidatos e avaliações da vaga selecionada.');
    }
  };

  useEffect(() => {
    void loadJobContext(selectedJobId, preselectedCandidateId || selectedCandidateId);
  }, [activeTenant?.id, selectedJobId, preselectedCandidateId]);

  const activeCandidate = candidates.find(c => c.id === selectedCandidateId);
  const activeJob = openings.find(j => j.id === selectedJobId);
  const activeEvaluation = evaluations.find(
    e => e.candidateId === selectedCandidateId && e.jobOpeningId === selectedJobId
  );

  // Show the decision already on record (if any) and start with an empty justification whenever the evaluation shown changes.
  useEffect(() => {
    setHumanDecision(activeEvaluation?.humanReviewerDecision ?? null);
    setHumanNotes('');
  }, [activeEvaluation?.id]);

  const handleRunEvaluation = async () => {
    if (!selectedCandidateId || !selectedJobId) return;
    try {
      setIsEvaluating(true);
      setActionError(null);
      setNotice(null);
      const result = await TenantApi.evaluateCandidateWithAI(selectedCandidateId, selectedJobId);
      if (result.kept) setNotice(result.notice ?? 'A IA não foi usada desta vez. Mantivemos a avaliação anterior.');
      await loadJobContext(selectedJobId, selectedCandidateId);
    } catch (err: any) {
      // A limit set by the platform is not a failure: show its message as it is
      setActionError(err.status === 429 ? err.message : `Falha na avaliação com IA: ${err.message}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSubmitHumanReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEvaluation || !humanDecision) return;
    try {
      setIsSubmittingReview(true);
      setActionError(null);
      await TenantApi.submitHumanReview(activeEvaluation.id, humanDecision, humanNotes);
      await loadJobContext(selectedJobId, selectedCandidateId);
      setHumanNotes('');
    } catch (err: any) {
      setActionError(`Erro ao registrar a decisão humana: ${err.message}`);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const localEstimate = isLocalEstimate(activeEvaluation);
  const culturalCut = dna?.culturalFitThreshold || 75;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Avaliação Assistida por IA</h1>
          <p className="text-xs text-slate-500">
            Apoio preditivo explicável com pilares do DNA cultural da organização e garantia de decisão final humana.
          </p>
        </div>

        {/* Principles Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs font-medium">
          <Brain className="w-4 h-4 text-purple-600" />
          <span>IA como Apoio • Decisão Humana Prioritária</span>
        </div>
      </div>

      {/* Selectors Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-4 text-xs items-end">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Candidato Avaliado</label>
          <select
            value={selectedCandidateId}
            onChange={(e) => setSelectedCandidateId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white font-medium text-slate-800"
          >
            {candidates.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.currentRole})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">Vaga de Destino</label>
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white font-medium text-slate-800"
          >
            {openings.map(j => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleRunEvaluation}
          disabled={isEvaluating}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-2"
        >
          {isEvaluating ? (
            <>
              <RotateCw className="w-4 h-4 animate-spin" />
              Executando avaliação assistida...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              {activeEvaluation ? 'Re-analisar com IA' : 'Executar Avaliação Assistida'}
            </>
          )}
        </button>
      </div>

      {actionError && (
        <div role="alert" className="flex items-start gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="flex-1 leading-relaxed">{actionError}</p>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Fechar aviso"
            className="p-0.5 rounded-md text-rose-500 hover:bg-rose-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {notice && (
        <div role="status" className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="flex-1 leading-relaxed">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Fechar aviso"
            className="p-0.5 rounded-md text-amber-600 hover:bg-amber-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Evaluation Results or Empty State */}
      {activeEvaluation ? (
        <div className="space-y-6">

          {/* Transparência: quando a nota NÃO vem de um modelo de IA, isso aparece antes de qualquer número */}
          {localEstimate && (
            <div role="alert" className="flex items-start gap-3 p-4 sm:p-5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs sm:text-sm leading-relaxed">
                <p className="font-bold">Estimativa local — esta NÃO é uma avaliação de IA</p>
                <p>
                  As notas abaixo vêm de regras simples (habilidades × requisitos e anos de experiência). O motivo aparece no início do
                  parecer. Use apenas como ponto de partida e valide em entrevista. Quando a IA estiver disponível, clique em
                  "Re-analisar com IA".
                </p>
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-500 font-mono" title="Fuso horário oficial: América/São Paulo">
            Avaliação de {formatDateTimeSP(activeEvaluation.evaluatedAt)} · Origem:{' '}
            {activeEvaluation.source ? SOURCE_LABEL[activeEvaluation.source] : 'não registrada (avaliação anterior ao registro de origem)'}
          </p>

          {/* Top Score Cards - Elevated Visuals */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">

            {/* Overall Fit Score */}
            <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white shadow-lg space-y-3 relative overflow-hidden border border-indigo-800/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  {localEstimate ? 'Fit Geral (estimativa local)' : 'Fit Geral Ponderado'}
                </span>
                <Sparkles className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-extrabold text-white font-mono tracking-tight">
                  {activeEvaluation.overallFitScore}%
                </span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${FIT_BADGE[fitLevel(activeEvaluation.overallFitScore)]}`}>
                  {FIT_LEVEL_LABEL[fitLevel(activeEvaluation.overallFitScore)]}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Ponderação equilibrada entre competências técnicas, experiência profissional e pilares do DNA cultural da organização.
              </p>
            </div>

            {/* Technical Fit */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Aderência Técnica do Cargo
                </span>
                <span className="text-xs text-slate-500 font-medium font-mono">
                  {activeCandidate?.yearsOfExperience} anos no cargo
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-extrabold text-slate-900 font-mono tracking-tight">
                  {activeEvaluation.technicalFitScore}%
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden mt-2">
                <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${activeEvaluation.technicalFitScore}%` }} />
              </div>
              <p className="text-xs text-slate-500">Avaliação do domínio técnico e correspondência curricular.</p>
            </div>

            {/* Cultural Fit */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Aderência ao DNA Cultural
                </span>
                <span className="text-xs text-slate-500 font-medium font-mono">
                  Corte: {culturalCut}%
                </span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-extrabold text-indigo-600 font-mono tracking-tight">
                  {activeEvaluation.culturalFitScore}%
                </span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                  activeEvaluation.culturalFitScore >= culturalCut
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}>
                  {activeEvaluation.culturalFitScore >= culturalCut ? 'Acima do corte' : 'Abaixo do corte'}
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden mt-2">
                <div className="h-full bg-indigo-600 rounded-full transition-all duration-500" style={{ width: `${activeEvaluation.culturalFitScore}%` }} />
              </div>
              <p className="text-xs text-slate-500">Conformidade com os valores e princípios institucionais cadastrados.</p>
            </div>

          </div>

          {/* Principle 3: Explicação das Recomendações */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 sm:p-7 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <MessageSquareQuote className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                  Explicabilidade Detalhada da Avaliação
                </h3>
                <p className="text-xs text-slate-500">
                  {localEstimate ? 'Parecer gerado por regras simples (estimativa local)' : 'Parecer qualitativo fundamentado gerado pelo motor analítico'}
                </p>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-slate-50/90 p-5 rounded-2xl border border-slate-100 font-normal">
              {activeEvaluation.detailedExplanation}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
              {/* Strengths */}
              <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-3">
                <span className="text-xs font-bold text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  Pontos Fortes Identificados no Perfil
                </span>
                <ul className="space-y-2 text-xs text-emerald-900 list-disc list-inside">
                  {activeEvaluation.keyStrengths.map((s, idx) => (
                    <li key={idx} className="leading-relaxed">{s}</li>
                  ))}
                </ul>
              </div>

              {/* Gaps / Questions to investigate */}
              <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-3">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  Gaps / Pontos a Investigar na Entrevista
                </span>
                <ul className="space-y-2 text-xs text-amber-900 list-disc list-inside">
                  {activeEvaluation.potentialGaps.map((g, idx) => (
                    <li key={idx} className="leading-relaxed">{g}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Cultural Pillars Breakdown (Ponderação por Pilar do DNA) */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs p-6 sm:p-7 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
              Aderência por Pilar do DNA Cultural da Organização
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
              {activeEvaluation.pillarScores.map((ps, idx) => (
                <div key={idx} className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs hover:border-indigo-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">{ps.pillarName}</span>
                    <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                      {ps.score}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {ps.analysis}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Suggested Interview Questions for the Human Interviewer */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-3">
            <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-600" />
              {localEstimate ? 'Perguntas Sugeridas para Validação Humana' : 'Perguntas Sugeridas pela IA para Validação Humana'}
            </h3>
            <div className="space-y-2">
              {activeEvaluation.suggestedInterviewQuestions.map((q, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{q}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Principle 2: Decisão Humana Final (Soberania do Recrutador/Gestor) */}
          <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-600 text-white">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Decisão Humana Final (Humano no Controle)</h3>
                  <p className="text-xs text-slate-500">
                    A IA fornece evidências; o recrutador e o gestor humano tomam e registram a decisão oficial.
                  </p>
                </div>
              </div>

              {activeEvaluation.humanReviewerDecision && (
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${DECISION_STATUS[activeEvaluation.humanReviewerDecision].cls}`}>
                  Status: {DECISION_STATUS[activeEvaluation.humanReviewerDecision].label}
                </span>
              )}
            </div>

            {activeEvaluation.humanReviewerDecision && activeEvaluation.humanNotes && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="font-semibold text-slate-700">Parecer humano registrado</div>
                <p className="text-slate-600 leading-relaxed whitespace-pre-line">{activeEvaluation.humanNotes}</p>
              </div>
            )}

            <form onSubmit={handleSubmitHumanReview} className="space-y-4 text-xs pt-2">
              <div role="radiogroup" aria-label="Decisão humana" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {DECISION_OPTIONS.map(({ value, label, Icon, active, icon }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={humanDecision === value}
                    onClick={() => setHumanDecision(value)}
                    className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2.5 text-left transition-all ${
                      humanDecision === value ? `${active} font-semibold` : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${icon}`} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Parecer do Recrutador / Gestor Humano (Justificativa)
                </label>
                <textarea
                  rows={2}
                  required
                  value={humanNotes}
                  onChange={(e) => setHumanNotes(e.target.value)}
                  placeholder="Registre as impressões humanas, validação das respostas e motivos da aprovação/rejeição..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="text-[11px] text-slate-400 font-mono">
                  {activeEvaluation.reviewedAt ? (
                    <span title="Fuso horário oficial: América/São Paulo">
                      Última revisão humana: {formatDateTimeSP(activeEvaluation.reviewedAt)} por {activeEvaluation.reviewedBy}
                      {' · '}registrar de novo substitui o parecer anterior
                    </span>
                  ) : (
                    <span>O revisor registrado será o usuário logado.</span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingReview || !humanDecision}
                  title={humanDecision ? undefined : 'Escolha uma decisão para registrar o parecer'}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingReview ? 'Gravando Decisão...' : activeEvaluation.humanReviewerDecision ? 'Atualizar Parecer Humano' : 'Registrar Parecer Humano'}
                </button>
              </div>
            </form>
          </div>

        </div>
      ) : (
        <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 text-base">Nenhuma avaliação assistida executada ainda</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Clique em "Executar Avaliação Assistida" acima para acionar a análise. A IA analisará a aderência técnica e cultural aos pilares da sua organização, gerando recomendações explicáveis.
          </p>
        </div>
      )}
    </div>
  );
};
