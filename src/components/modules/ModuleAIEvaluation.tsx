import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  User,
  Layers,
  ChevronRight,
  TrendingUp,
  Brain,
  MessageSquareQuote,
  Clock,
  RotateCw
} from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { Candidate, JobOpening, AIAssistedEvaluation, OrganizationalDNA } from '../../types.js';
import { formatDateTimeSP } from '../../utils/dateUtils.js';

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

  // Human Review Form
  const [humanDecision, setHumanDecision] = useState<'APPROVED' | 'REJECTED' | 'REQUEST_ADDITIONAL_INTERVIEW' | 'OVERRIDDEN'>('APPROVED');
  const [humanNotes, setHumanNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [cands, ops, evals, dnaData] = await Promise.all([
        TenantApi.getCandidates(),
        TenantApi.getOpenings(),
        TenantApi.getAIEvaluations(),
        TenantApi.getDNA()
      ]);
      setCandidates(cands);
      setOpenings(ops);
      setEvaluations(evals);
      setDna(dnaData);

      const targetCand = preselectedCandidateId || (cands[0]?.id ?? '');
      const targetJob = preselectedJobId || (ops[0]?.id ?? '');
      setSelectedCandidateId(targetCand);
      setSelectedJobId(targetJob);
    } catch (err) {
      console.error('Failed to load AI evaluation data:', err);
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

  const activeCandidate = candidates.find(c => c.id === selectedCandidateId);
  const activeJob = openings.find(j => j.id === selectedJobId);
  const activeEvaluation = evaluations.find(
    e => e.candidateId === selectedCandidateId && e.jobOpeningId === selectedJobId
  );

  const handleRunEvaluation = async () => {
    if (!selectedCandidateId || !selectedJobId) return;
    try {
      setIsEvaluating(true);
      const result = await TenantApi.evaluateCandidateWithAI(selectedCandidateId, selectedJobId);
      // Reload evaluations
      const updatedEvals = await TenantApi.getAIEvaluations();
      setEvaluations(updatedEvals);
    } catch (err: any) {
      alert(`Falha na avaliação com IA: ${err.message}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSubmitHumanReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEvaluation) return;
    try {
      setIsSubmittingReview(true);
      await TenantApi.submitHumanReview(
        activeEvaluation.id,
        humanDecision,
        humanNotes,
        'Recrutador / Gestor Humano'
      );
      const updatedEvals = await TenantApi.getAIEvaluations();
      setEvaluations(updatedEvals);
      setHumanNotes('');
    } catch (err: any) {
      alert(`Erro ao submeter decisão humana: ${err.message}`);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Módulo 9</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-mono text-slate-500">Partição: {activeTenant?.dbConfig?.dbName}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Avaliação Assistida por IA</h1>
          <p className="text-xs text-slate-500">
            Apoio preditivo explicável com pilares do DNA cultural do tenant e garantia de decisão final humana.
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

      {/* Evaluation Results or Empty State */}
      {activeEvaluation ? (
        <div className="space-y-6">
          
          {/* Top Score Cards - Elevated Visuals */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            
            {/* Overall Fit Score */}
            <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white shadow-lg space-y-3 relative overflow-hidden border border-indigo-800/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  Fit Geral Ponderado
                </span>
                <Sparkles className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-extrabold text-white font-mono tracking-tight">
                  {activeEvaluation.overallFitScore}%
                </span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                  activeEvaluation.overallFitScore >= 80 ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                }`}>
                  {activeEvaluation.overallFitScore >= 80 ? 'Alta Aderência' : 'Aderência Média'}
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
                  Corte: {dna?.culturalFitThreshold || 75}%
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-extrabold text-indigo-600 font-mono tracking-tight">
                  {activeEvaluation.culturalFitScore}%
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
                <p className="text-xs text-slate-500">Parecer qualitativo fundamentado gerado pelo motor analítico</p>
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
              Aderência por Pilar do DNA Cultural do Tenant
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
              Perguntas Sugeridas pela IA para Validação Humana
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
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  activeEvaluation.humanReviewerDecision === 'APPROVED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : activeEvaluation.humanReviewerDecision === 'REJECTED'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  Status: {activeEvaluation.humanReviewerDecision}
                </span>
              )}
            </div>

            <form onSubmit={handleSubmitHumanReview} className="space-y-4 text-xs pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label
                  onClick={() => setHumanDecision('APPROVED')}
                  className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2.5 transition-all ${
                    humanDecision === 'APPROVED'
                      ? 'bg-emerald-50 border-emerald-300 font-semibold text-emerald-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <ThumbsUp className="w-4 h-4 text-emerald-600" />
                  <span>Aprovar para Próxima Etapa</span>
                </label>

                <label
                  onClick={() => setHumanDecision('REQUEST_ADDITIONAL_INTERVIEW')}
                  className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2.5 transition-all ${
                    humanDecision === 'REQUEST_ADDITIONAL_INTERVIEW'
                      ? 'bg-amber-50 border-amber-300 font-semibold text-amber-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <HelpCircle className="w-4 h-4 text-amber-600" />
                  <span>Aprofundar em Entrevista</span>
                </label>

                <label
                  onClick={() => setHumanDecision('REJECTED')}
                  className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2.5 transition-all ${
                    humanDecision === 'REJECTED'
                      ? 'bg-rose-50 border-rose-300 font-semibold text-rose-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <ThumbsDown className="w-4 h-4 text-rose-600" />
                  <span>Desqualificar com Feedback</span>
                </label>
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
                  {activeEvaluation.reviewedAt && (
                    <span title="Fuso horário oficial: América/São Paulo">
                      Última revisão humana: {formatDateTimeSP(activeEvaluation.reviewedAt)} por {activeEvaluation.reviewedBy}
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors"
                >
                  {isSubmittingReview ? 'Gravando Decisão...' : 'Registrar Parecer Humano'}
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
