import React from 'react';
import { X, Mail, Phone, MapPin, Linkedin, GraduationCap, Sparkles, ChevronRight, CalendarDays, MessageSquare, ThumbsUp, ThumbsDown } from 'lucide-react';
import {
  AIAssistedEvaluation, Candidate, InterviewSession, JobOpening, SelectionApplication
} from '../../types.js';
import { formatDateSP } from '../../utils/dateUtils.js';

const RECOMMENDATION: Record<NonNullable<InterviewSession['interviewerRecommendation']>, { label: string; cls: string }> = {
  STRONG_YES: { label: 'Fortemente recomendado', cls: 'bg-emerald-100 text-emerald-800' },
  YES: { label: 'Recomendado', cls: 'bg-emerald-50 text-emerald-700' },
  NEUTRAL: { label: 'Neutro', cls: 'bg-slate-100 text-slate-700' },
  NO: { label: 'Não recomendado', cls: 'bg-rose-100 text-rose-800' }
};

const DECISION: Record<NonNullable<AIAssistedEvaluation['humanReviewerDecision']>, string> = {
  APPROVED: 'Aprovada pelo revisor humano',
  REJECTED: 'Rejeitada pelo revisor humano',
  REQUEST_ADDITIONAL_INTERVIEW: 'Revisor pediu nova entrevista',
  OVERRIDDEN: 'Decisão da IA substituída pelo revisor'
};

const APPLICATION_STATUS: Record<SelectionApplication['status'], string> = {
  in_review: 'Em análise',
  advancing: 'Avançando',
  hold: 'Em espera',
  rejected: 'Reprovado',
  hired: 'Contratado'
};

const scoreColor = (score: number) => (score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500');

const Score: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono font-bold text-slate-900">{value}%</span>
    </div>
    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${scoreColor(value)}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-2">
    <div className="text-[10px] uppercase font-bold text-slate-400">{title}</div>
    {children}
  </div>
);

interface Props {
  application: SelectionApplication;
  candidate?: Candidate;
  job: JobOpening;
  evaluation?: AIAssistedEvaluation;
  interviews: InterviewSession[];
  canAdvance: boolean;
  onAdvance: () => void;
  onOpenAI?: () => void;
  onClose: () => void;
}

/** Quick analysis of a candidate on the pipeline, before moving them to the next stage. */
export const ApplicationSummaryModal: React.FC<Props> = ({
  application, candidate, job, evaluation, interviews, canAdvance, onAdvance, onOpenAI, onClose
}) => {
  const stages = [...job.stages].sort((a, b) => a.order - b.order);
  const stageIdx = stages.findIndex(s => s.id === application.currentStageId);
  const nextStage = stageIdx >= 0 ? stages[stageIdx + 1] : undefined;
  const initials = candidate?.name ? candidate.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() : 'CD';

  const avgScore = (i: InterviewSession) =>
    i.scorecard.length ? i.scorecard.reduce((sum, c) => sum + c.score, 0) / i.scorecard.length : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Resumo do candidato</span>
              <h3 className="text-base font-bold text-slate-900 truncate">{candidate?.name || 'Candidato'}</h3>
              <div className="text-xs text-slate-500">
                {candidate?.currentRole || 'Profissional'}{candidate ? ` • ${candidate.yearsOfExperience}a de experiência` : ''}
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-xs overflow-y-auto">
          {/* Where the candidate is */}
          <Section title={`Vaga: ${job.title}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              {stages.map((s, i) => (
                <React.Fragment key={s.id}>
                  <span className={`px-2 py-1 rounded-full font-semibold ${
                    i === stageIdx ? 'bg-indigo-600 text-white' : i < stageIdx ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {i + 1}. {s.name}
                  </span>
                  {i < stages.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                </React.Fragment>
              ))}
            </div>
            <div className="text-slate-500">
              Situação: <b className="text-slate-700">{APPLICATION_STATUS[application.status]}</b> · Inscrito em {formatDateSP(application.appliedAt)}
            </div>
          </Section>

          {/* Contact & profile */}
          {candidate && (
            <Section title="Perfil">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
                {candidate.email && <div className="flex items-center gap-1.5 min-w-0"><Mail className="w-3 h-3 text-slate-400 shrink-0" /><span className="truncate">{candidate.email}</span></div>}
                {candidate.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400 shrink-0" />{candidate.phone}</div>}
                {candidate.location && <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-slate-400 shrink-0" />{candidate.location}</div>}
                {candidate.education && <div className="flex items-center gap-1.5 min-w-0"><GraduationCap className="w-3 h-3 text-slate-400 shrink-0" /><span className="truncate">{candidate.education}</span></div>}
                {candidate.linkedinUrl && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Linkedin className="w-3 h-3 text-slate-400 shrink-0" />
                    <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline truncate">LinkedIn</a>
                  </div>
                )}
              </div>
              {candidate.resumeSummary && <p className="text-slate-700 leading-relaxed">{candidate.resumeSummary}</p>}
              {candidate.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {candidate.skills.map(skill => <span key={skill} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">{skill}</span>)}
                </div>
              )}
              {(candidate.languages.length > 0 || candidate.tags.length > 0) && (
                <div className="text-slate-500">
                  {candidate.languages.length > 0 && <>Idiomas: {candidate.languages.join(', ')}</>}
                  {candidate.languages.length > 0 && candidate.tags.length > 0 && ' · '}
                  {candidate.tags.length > 0 && <>Tags: {candidate.tags.join(', ')}</>}
                </div>
              )}
            </Section>
          )}

          {/* AI evaluation */}
          <Section title="Avaliação assistida por IA">
            {evaluation ? (
              <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Score label="Fit geral" value={evaluation.overallFitScore} />
                  <Score label="Técnico" value={evaluation.technicalFitScore} />
                  <Score label="Cultural" value={evaluation.culturalFitScore} />
                </div>
                {evaluation.detailedExplanation && <p className="text-slate-700 leading-relaxed">{evaluation.detailedExplanation}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {evaluation.keyStrengths.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1 font-bold text-emerald-700 mb-1"><ThumbsUp className="w-3 h-3" /> Pontos fortes</div>
                      <ul className="space-y-0.5 text-slate-700 list-disc pl-4">{evaluation.keyStrengths.map((t, i) => <li key={i}>{t}</li>)}</ul>
                    </div>
                  )}
                  {evaluation.potentialGaps.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1 font-bold text-amber-700 mb-1"><ThumbsDown className="w-3 h-3" /> Pontos de atenção</div>
                      <ul className="space-y-0.5 text-slate-700 list-disc pl-4">{evaluation.potentialGaps.map((t, i) => <li key={i}>{t}</li>)}</ul>
                    </div>
                  )}
                </div>
                <div className="text-slate-500">
                  {evaluation.humanReviewerDecision
                    ? <>Revisão humana: <b className="text-slate-700">{DECISION[evaluation.humanReviewerDecision]}</b>{evaluation.humanNotes ? ` — ${evaluation.humanNotes}` : ''}</>
                    : 'Ainda sem decisão do revisor humano. A IA apoia a decisão, não a substitui.'}
                </div>
              </div>
            ) : (
              <p className="px-3 py-2 rounded-lg bg-slate-50 text-slate-400 italic">Avaliação por IA ainda não realizada para esta vaga.</p>
            )}
          </Section>

          {/* Interviews */}
          {interviews.length > 0 && (
            <Section title="Entrevistas">
              <div className="space-y-2">
                {interviews.map(i => {
                  const avg = avgScore(i);
                  const rec = i.interviewerRecommendation ? RECOMMENDATION[i.interviewerRecommendation] : null;
                  return (
                    <div key={i.id} className="p-3 rounded-xl border border-slate-200 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800 flex items-center gap-1.5"><CalendarDays className="w-3 h-3 text-slate-400" /> {i.stageName}</span>
                        <span className="text-slate-500">
                          {formatDateSP(i.scheduledFor)} · {i.status === 'completed' ? 'Realizada' : i.status === 'scheduled' ? 'Agendada' : i.status === 'cancelled' ? 'Cancelada' : 'Não compareceu'}
                        </span>
                      </div>
                      {(avg !== null || rec) && (
                        <div className="flex flex-wrap items-center gap-2">
                          {avg !== null && <span className="font-mono font-bold text-slate-800">Nota média {avg.toFixed(1)}/5</span>}
                          {rec && <span className={`px-2 py-0.5 rounded-full font-bold ${rec.cls}`}>{rec.label}</span>}
                        </div>
                      )}
                      {i.overallFeedback && <p className="text-slate-600 flex items-start gap-1.5"><MessageSquare className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />{i.overallFeedback}</p>}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* History */}
          {application.notes.length > 0 && (
            <Section title="Histórico do processo">
              <ul className="space-y-0.5 text-slate-600">
                {[...application.notes].reverse().map((n, i) => <li key={i}>• {n}</li>)}
              </ul>
            </Section>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          {onOpenAI ? (
            <button onClick={onOpenAI} className="px-3 py-2 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold text-xs flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> {evaluation ? 'Ver análise IA completa' : 'Avaliar com IA'}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs">Fechar</button>
            {canAdvance && nextStage && (
              <button onClick={onAdvance} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-1.5">
                Avançar para "{nextStage.name}" <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
