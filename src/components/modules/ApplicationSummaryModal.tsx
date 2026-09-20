import React, { useState } from 'react';
import {
  X, Mail, Phone, MapPin, Linkedin, GraduationCap, Sparkles, ChevronRight, CalendarDays, MessageSquare, ThumbsUp, ThumbsDown,
  Printer, Share2, Copy, Check, Briefcase, UserRound, BarChart3, Globe, Clock, Trash2, ArrowRight, RotateCcw, FileText,
  CheckCircle2, PauseCircle, Archive
} from 'lucide-react';
import {
  AIAssistedEvaluation, Candidate, InterviewSession, JobOpening, SelectionApplication
} from '../../types.js';
import { formatDateSP } from '../../utils/dateUtils.js';
import { Card, Pill } from './SummaryParts.js';
import { ApplicationSummaryData, buildPrintHtml, buildSummaryText, printHtml } from '../../utils/applicationShare.js';

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

const STATUS_PILL: Record<SelectionApplication['status'], { label: string; cls: string }> = {
  in_review: { label: 'Em análise', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  advancing: { label: 'Avançando', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  hold: { label: 'Em espera', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  rejected: { label: 'Arquivada', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  hired: { label: 'Contratado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
};

const scoreColor = (score: number) => (score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500');

const Score: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono font-bold text-slate-900">{value}%</span>
    </div>
    <div className="w-full h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
      <div className={`h-full rounded-full ${scoreColor(value)}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  </div>
);

/** "[19/09/2026] Texto" -> { date, text }; notes without the prefix keep the whole text. */
const parseNote = (note: string): { date?: string; text: string } => {
  const m = /^\[(\d{2}\/\d{2}\/\d{4})\]\s*(.*)$/.exec(note);
  return m ? { date: m[1], text: m[2] } : { text: note };
};

interface Props {
  application: SelectionApplication;
  candidate?: Candidate;
  job: JobOpening;
  evaluation?: AIAssistedEvaluation;
  interviews: InterviewSession[];
  /** Whether the user may move / archive the application (Processo Seletivo: alterar). */
  canEdit: boolean;
  onAdvance: () => void;
  onArchive: (reason: string) => Promise<void> | void;
  onReactivate: () => Promise<void> | void;
  onOpenAI?: () => void;
  onOpenProfile?: () => void;
  /** Name of the organization and of the person printing, shown on the printed page. */
  organizationName?: string;
  printedBy?: string;
  onClose: () => void;
}

/** Quick analysis of a candidate on the pipeline, before moving them to the next stage. */
export const ApplicationSummaryModal: React.FC<Props> = ({
  application, candidate, job, evaluation, interviews, canEdit, onAdvance, onArchive, onReactivate, onOpenAI, onOpenProfile,
  organizationName, printedBy, onClose
}) => {
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const stages = [...job.stages].sort((a, b) => a.order - b.order);
  const stageIdx = stages.findIndex(s => s.id === application.currentStageId);
  const nextStage = stageIdx >= 0 ? stages[stageIdx + 1] : undefined;
  const initials = candidate?.name ? candidate.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() : 'CD';

  const hired = application.status === 'hired';
  const archived = application.status === 'rejected';
  const onHold = application.status === 'hold';
  const finished = hired || archived;
  const advanceAvailable = canEdit && !finished && !!nextStage;
  const pill = STATUS_PILL[application.status];
  const notes = [...application.notes].reverse().map(parseNote);
  const lastNote = notes[0]?.text;

  const avgScore = (i: InterviewSession) =>
    i.scorecard.length ? i.scorecard.reduce((sum, c) => sum + c.score, 0) / i.scorecard.length : null;

  const data: ApplicationSummaryData = { organization: organizationName, candidate, job, application, evaluation, interviews };
  const shareTitle = `Resumo — ${candidate?.name ?? 'Candidato'} — ${job.title}`;

  const handlePrint = () => {
    try {
      printHtml(buildPrintHtml(data, printedBy));
    } catch (err: any) {
      alert(err.message || 'Não foi possível imprimir.');
    }
  };

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildSummaryText(data));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Não foi possível copiar automaticamente. Use a opção de e-mail ou WhatsApp.');
    }
  };

  const confirmArchive = async () => {
    if (reason.trim().length < 10) return alert('Descreva o motivo do arquivamento com pelo menos 10 caracteres.');
    try {
      setBusy(true);
      await onArchive(reason.trim());
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async () => {
    try {
      setBusy(true);
      await onReactivate();
    } finally {
      setBusy(false);
    }
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const iconBtn = 'p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[94vh] flex flex-col border border-slate-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 sm:px-7 pt-5 sm:pt-6 pb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-lg flex items-center justify-center shrink-0 shadow-sm">
              {initials}
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Resumo do candidato</span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight truncate">{candidate?.name || 'Candidato'}</h3>
              <div className="text-sm text-slate-500 truncate">
                {candidate?.currentRole || 'Profissional'}{candidate ? ` • ${candidate.yearsOfExperience} anos de experiência` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0 relative">
            <button onClick={handlePrint} title="Imprimir resumo" aria-label="Imprimir resumo" className={iconBtn}><Printer className="w-4 h-4" /></button>
            <button onClick={() => setShareOpen(o => !o)} aria-expanded={shareOpen} title="Compartilhar resumo" aria-label="Compartilhar resumo" className={iconBtn}><Share2 className="w-4 h-4" /></button>
            <button onClick={onClose} aria-label="Fechar" className={iconBtn}><X className="w-5 h-5" /></button>
            {shareOpen && (
              <div className="absolute top-full right-0 mt-1 w-64 rounded-xl border border-slate-200 bg-white shadow-lg p-1.5 z-20 text-xs">
                <button onClick={copySummary} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />} {copied ? 'Resumo copiado!' : 'Copiar resumo'}
                </button>
                <a href={`mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(buildSummaryText(data))}`} className="block px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700">
                  Enviar por e-mail
                </a>
                <a href={`https://wa.me/?text=${encodeURIComponent(buildSummaryText(data))}`} target="_blank" rel="noopener noreferrer" className="block px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700">
                  Enviar pelo WhatsApp
                </a>
                {canNativeShare && (
                  <button onClick={() => { void navigator.share({ title: shareTitle, text: buildSummaryText(data) }).catch(() => {}); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-700">
                    Compartilhar pelo dispositivo…
                  </button>
                )}
                <p className="px-3 pt-1.5 pb-1 text-[10px] text-slate-400 leading-snug border-t border-slate-100 mt-1">
                  O resumo compartilhado não inclui telefone, e-mail nem LinkedIn do candidato.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 sm:px-7 pb-5 space-y-5 overflow-y-auto text-xs">
          {/* Vaga · situação · inscrição */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-slate-100">
            <span className="flex items-center gap-2 font-bold text-slate-900 text-sm"><Briefcase className="w-4 h-4 text-indigo-600" /> {job.title}</span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border font-semibold ${pill.cls}`}>
              {hired && <CheckCircle2 className="w-3.5 h-3.5" />}
              {archived && <Archive className="w-3.5 h-3.5" />}
              {onHold && <PauseCircle className="w-3.5 h-3.5" />}
              {pill.label}
            </span>
            <span className="text-slate-500 sm:border-l sm:border-slate-200 sm:pl-4">Inscrição em {formatDateSP(application.appliedAt)}</span>
          </div>

          {/* Etapas do processo */}
          <div className="overflow-x-auto">
            <ol className="flex items-center gap-2 min-w-max sm:min-w-0">
              {stages.map((s, i) => {
                const state = hired || i < stageIdx ? 'done' : i === stageIdx ? 'current' : 'todo';
                const sub = state === 'done' ? 'concluída' : state === 'current' ? (archived ? 'arquivada' : onHold ? 'em espera' : 'em andamento') : 'pendente';
                const circle =
                  state === 'done' ? 'bg-emerald-500 text-white'
                  : state === 'current' ? (archived ? 'bg-rose-500 text-white' : onHold ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white')
                  : 'bg-indigo-50 text-indigo-600';
                return (
                  <React.Fragment key={s.id}>
                    <li className="flex items-center gap-2.5 shrink-0" aria-current={state === 'current' ? 'step' : undefined}>
                      <span className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${circle}`}>
                        {state === 'done' ? <Check className="w-4 h-4" /> : i + 1}
                      </span>
                      <span className="leading-tight">
                        <span className="block font-bold text-slate-900 text-[12px] max-w-[130px] truncate" title={s.name}>{s.name}</span>
                        <span className={`block text-[11px] ${state === 'current' ? (archived ? 'text-rose-600' : onHold ? 'text-amber-600' : 'text-indigo-600') : 'text-slate-400'}`}>{sub}</span>
                      </span>
                    </li>
                    {i < stages.length - 1 && <span className={`flex-1 h-px min-w-4 ${state === 'done' ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                  </React.Fragment>
                );
              })}
            </ol>
          </div>

          {/* Faixa de situação */}
          {hired && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <b>Processo concluído</b>
              <span className="text-emerald-800/80">A contratação para esta vaga foi concluída.</span>
            </div>
          )}
          {archived && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
              <Archive className="w-5 h-5 text-rose-600 shrink-0" />
              <b>Candidatura arquivada</b>
              {lastNote && <span className="text-rose-800/80">{lastNote}</span>}
            </div>
          )}
          {onHold && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
              <PauseCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <b>Em espera</b>
              <span className="text-amber-800/80">A candidatura está pausada neste momento.</span>
            </div>
          )}

          {/* Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 space-y-4">
              <Card icon={<UserRound className="w-4 h-4" />} title="Resumo profissional">
                {candidate?.resumeSummary
                  ? <p className="text-slate-600 leading-relaxed">{candidate.resumeSummary}</p>
                  : <p className="text-slate-400 italic">Sem resumo informado.</p>}
              </Card>

              <Card icon={<BarChart3 className="w-4 h-4" />} title="Competências">
                {candidate && candidate.skills.length > 0
                  ? <div className="flex flex-wrap gap-2">{candidate.skills.map(k => <Pill key={k}>{k}</Pill>)}</div>
                  : <p className="text-slate-400 italic">Nenhuma competência informada.</p>}
              </Card>

              <Card icon={<Globe className="w-4 h-4" />} title="Idiomas">
                {candidate && candidate.languages.length > 0
                  ? <div className="flex flex-wrap gap-2">{candidate.languages.map(k => <Pill key={k}>{k}</Pill>)}</div>
                  : <p className="text-slate-400 italic">Nenhum idioma informado.</p>}
              </Card>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <Card icon={<Mail className="w-4 h-4" />} title="Contato">
                {candidate ? (
                  <ul className="space-y-2.5 text-slate-600">
                    {candidate.email && <li className="flex items-center gap-2.5 min-w-0"><Mail className="w-4 h-4 text-slate-400 shrink-0" /><a href={`mailto:${candidate.email}`} className="truncate hover:text-indigo-600">{candidate.email}</a></li>}
                    {candidate.phone && <li className="flex items-center gap-2.5"><Phone className="w-4 h-4 text-slate-400 shrink-0" />{candidate.phone}</li>}
                    {candidate.location && <li className="flex items-center gap-2.5"><MapPin className="w-4 h-4 text-slate-400 shrink-0" />{candidate.location}</li>}
                    {candidate.education && <li className="flex items-center gap-2.5"><GraduationCap className="w-4 h-4 text-slate-400 shrink-0" />{candidate.education}</li>}
                    {candidate.linkedinUrl && (
                      <li className="flex items-center gap-2.5">
                        <Linkedin className="w-4 h-4 text-indigo-600 shrink-0" />
                        <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-semibold hover:underline">LinkedIn</a>
                      </li>
                    )}
                  </ul>
                ) : <p className="text-slate-400 italic">Candidato não encontrado.</p>}
              </Card>

              <Card icon={<Sparkles className="w-4 h-4" />} title="Avaliação assistida por IA">
                {evaluation ? (
                  <div className="space-y-3">
                    <div className="space-y-2.5">
                      <Score label="Fit geral" value={evaluation.overallFitScore} />
                      <Score label="Técnico" value={evaluation.technicalFitScore} />
                      <Score label="Cultural" value={evaluation.culturalFitScore} />
                    </div>
                    {evaluation.keyStrengths.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1 font-bold text-emerald-700 mb-1"><ThumbsUp className="w-3 h-3" /> Pontos fortes</div>
                        <ul className="space-y-0.5 text-slate-600 list-disc pl-4">{evaluation.keyStrengths.map((t, i) => <li key={i}>{t}</li>)}</ul>
                      </div>
                    )}
                    {evaluation.potentialGaps.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1 font-bold text-amber-700 mb-1"><ThumbsDown className="w-3 h-3" /> Pontos de atenção</div>
                        <ul className="space-y-0.5 text-slate-600 list-disc pl-4">{evaluation.potentialGaps.map((t, i) => <li key={i}>{t}</li>)}</ul>
                      </div>
                    )}
                    <p className="text-slate-500">
                      {evaluation.humanReviewerDecision
                        ? <>Revisão humana: <b className="text-slate-700">{DECISION[evaluation.humanReviewerDecision]}</b>{evaluation.humanNotes ? ` — ${evaluation.humanNotes}` : ''}</>
                        : 'Sem decisão do revisor humano. A IA apoia a decisão, não a substitui.'}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white border border-slate-200 text-slate-500">
                    <FileText className="w-6 h-6 text-slate-300 shrink-0" />
                    <span>Avaliação por IA não realizada para esta vaga.</span>
                  </div>
                )}
                {onOpenAI && (
                  <button onClick={onOpenAI} className="w-full py-2.5 rounded-xl border-2 border-indigo-600 text-indigo-700 hover:bg-indigo-50 font-bold text-sm transition-colors">
                    {evaluation ? 'Ver análise completa' : 'Iniciar avaliação'}
                  </button>
                )}
              </Card>
            </div>
          </div>

          {/* Entrevistas */}
          {interviews.length > 0 && (
            <Card icon={<CalendarDays className="w-4 h-4" />} title="Entrevistas">
              <div className="space-y-2">
                {interviews.map(i => {
                  const avg = avgScore(i);
                  const rec = i.interviewerRecommendation ? RECOMMENDATION[i.interviewerRecommendation] : null;
                  return (
                    <div key={i.id} className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">{i.stageName}</span>
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
            </Card>
          )}

          {/* Histórico do processo */}
          <Card icon={<Clock className="w-4 h-4" />} title="Histórico do processo">
            {notes.length === 0 ? <p className="text-slate-400 italic">Sem movimentações registradas.</p> : (
              <ol className="ml-1.5">
                {notes.map((n, i) => (
                  <li key={i} className={`relative pl-6 ml-[5px] border-l-2 ${i < notes.length - 1 ? 'pb-4 border-slate-200' : 'border-transparent'}`}>
                    <span className={`absolute -left-[7px] top-0.5 w-3 h-3 rounded-full border-2 border-white ${i === 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    {n.date && <div className="text-slate-400">{n.date}</div>}
                    <div className={i === 0 ? 'font-bold text-slate-900' : 'text-slate-600'}>{n.text}</div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        {/* Arquivar: confirmação com motivo */}
        {archiving && (
          <div className="px-5 sm:px-7 py-4 border-t border-rose-200 bg-rose-50/70 space-y-2.5 text-xs">
            <div className="font-bold text-rose-900">Arquivar esta candidatura?</div>
            <p className="text-rose-800/80">A candidatura sai do andamento e o motivo fica registrado no histórico. Você pode reativá-la depois.</p>
            <textarea
              autoFocus
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo do arquivamento (mínimo 10 caracteres). Ex.: perfil não atende ao requisito de liderança."
              className="w-full px-3 py-2 rounded-xl border border-rose-200 bg-white text-sm focus:outline-hidden focus:border-rose-400"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setArchiving(false); setReason(''); }} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-white font-medium">Cancelar</button>
              <button onClick={confirmArchive} disabled={busy} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-60">Confirmar arquivamento</button>
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="px-5 sm:px-7 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            {canEdit && !hired && !archived && !archiving && (
              <button onClick={() => setArchiving(true)} className="flex items-center gap-2 text-sm font-semibold text-rose-600 hover:text-rose-700 py-2">
                <Trash2 className="w-4 h-4" /> Arquivar candidatura
              </button>
            )}
            {canEdit && archived && (
              <button onClick={reactivate} disabled={busy} className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 py-2 disabled:opacity-60">
                <RotateCcw className="w-4 h-4" /> Reativar candidatura
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-sm">Fechar</button>
            {onOpenProfile && (
              <button
                onClick={onOpenProfile}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 ${
                  advanceAvailable ? 'border border-indigo-200 text-indigo-700 hover:bg-indigo-50' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                Ver perfil completo <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {advanceAvailable && nextStage && (
              <button onClick={onAdvance} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center gap-2">
                Avançar para "{nextStage.name}" <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
