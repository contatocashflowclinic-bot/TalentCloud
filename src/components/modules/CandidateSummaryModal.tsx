import React, { useEffect, useState } from 'react';
import {
  X, Pencil, Mail, Phone, MapPin, Linkedin, GraduationCap, Sparkles, FileText, Settings, Globe, Briefcase, Clock, History,
  UserRound, Star, Trophy, TrendingUp, Users, UserCheck, CalendarDays, Check, Archive, RotateCcw, ArrowRight, Code2
} from 'lucide-react';
import { TenantApi } from '../../services/api.js';
import {
  AIAssistedEvaluation, Candidate, CandidateChange, JobOpening, SelectionApplication
} from '../../types.js';
import { formatDateSP } from '../../utils/dateUtils.js';
import { Card, Pill } from './SummaryParts.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';

const FIELD_LABEL: Record<string, string> = {
  name: 'Nome', email: 'E-mail', phone: 'Telefone', location: 'Localização', linkedinUrl: 'LinkedIn', currentRole: 'Cargo atual',
  yearsOfExperience: 'Anos de experiência', education: 'Formação', resumeSummary: 'Resumo profissional', skills: 'Competências',
  languages: 'Idiomas', tags: 'Tags', archived: 'Perfil arquivado'
};
const showValue = (v: unknown): string =>
  v === undefined || v === null || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : Array.isArray(v) ? (v.length ? v.join(', ') : '—') : String(v);

const APPLICATION_STATUS: Record<SelectionApplication['status'], { label: string; cls: string }> = {
  in_review: { label: 'Em análise', cls: 'bg-indigo-50 text-indigo-700' },
  advancing: { label: 'Avançando', cls: 'bg-indigo-50 text-indigo-700' },
  hold: { label: 'Em espera', cls: 'bg-amber-50 text-amber-800' },
  rejected: { label: 'Arquivada', cls: 'bg-rose-50 text-rose-700' },
  hired: { label: 'Contratado', cls: 'bg-emerald-50 text-emerald-700' }
};

const DECISION: Record<NonNullable<AIAssistedEvaluation['humanReviewerDecision']>, { label: string; cls: string }> = {
  APPROVED: { label: 'Aprovado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'Reprovado', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  REQUEST_ADDITIONAL_INTERVIEW: { label: 'Nova entrevista', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  OVERRIDDEN: { label: 'Decisão substituída', cls: 'bg-amber-50 text-amber-800 border-amber-200' }
};

const tagIcon = (tag: string) => {
  const t = tag.toLowerCase();
  if (/top|talent|destaque/.test(t)) return <Trophy className="w-3.5 h-3.5" />;
  if (/lider|gest|manager|head/.test(t)) return <TrendingUp className="w-3.5 h-3.5" />;
  if (/multi|time|equipe|team/.test(t)) return <Users className="w-3.5 h-3.5" />;
  return <Star className="w-3.5 h-3.5" />;
};

const fitLabel = (score: number) =>
  score >= 80 ? { text: 'Alta aderência', cls: 'text-emerald-600' } : score >= 60 ? { text: 'Boa aderência', cls: 'text-amber-600' } : { text: 'Aderência baixa', cls: 'text-rose-600' };

/** Loads related data when the summary opens; a lookup the user may not view is simply left out. */
function useRelated<T>(load: () => Promise<T>, fallback: T): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    load().catch(() => fallback).then(value => { if (alive) setData(value); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return data;
}

interface Props {
  candidate: Candidate;
  evaluations: AIAssistedEvaluation[];
  openings: JobOpening[];
  canEdit: boolean;
  onEdit?: () => void;
  onOpenAI?: (jobId?: string) => void;
  onOpenApplication?: (jobId: string) => void;
  onArchive: (reason: string) => Promise<void>;
  onUnarchive: () => Promise<void>;
  onClose: () => void;
}

/** Talent pool summary: profile, highlights, active application, AI evaluation and change history. */
export const CandidateSummaryModal: React.FC<Props> = ({
  candidate, evaluations, openings, canEdit, onEdit, onOpenAI, onOpenApplication, onArchive, onUnarchive, onClose
}) => {
  const applications = useRelated(() => TenantApi.getApplications(), [] as SelectionApplication[]);
  const history = useRelated(() => TenantApi.getCandidateHistory(candidate.id), [] as CandidateChange[]);
  const [archiving, setArchiving] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const backdrop = useBackdropClose(onClose);

  const initials = candidate.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() || 'CD';
  const fromPortal = candidate.dataOrigin === 'candidate';

  // Active application = the newest one still in progress; otherwise the newest one at all
  const mine = (applications ?? []).filter(a => a.candidateId === candidate.id).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
  const shown = mine.find(a => ['in_review', 'advancing', 'hold'].includes(a.status)) ?? mine[0];
  const shownJob = shown ? openings.find(o => o.id === shown.jobOpeningId) : undefined;
  const others = mine.filter(a => a.id !== shown?.id);
  const stages = shownJob ? [...shownJob.stages].sort((a, b) => a.order - b.order) : [];
  const stageIdx = shown ? stages.findIndex(s => s.id === shown.currentStageId) : -1;

  const myEvals = evaluations.filter(e => e.candidateId === candidate.id);
  const evaluation = myEvals.find(e => e.jobOpeningId === shown?.jobOpeningId) ?? myEvals[0];
  const evalJob = evaluation ? openings.find(o => o.id === evaluation.jobOpeningId) : undefined;
  const decision = evaluation?.humanReviewerDecision ? DECISION[evaluation.humanReviewerDecision] : { label: 'Em análise', cls: 'bg-slate-50 text-slate-600 border-slate-200' };
  const fit = evaluation ? fitLabel(evaluation.overallFitScore) : null;

  const run = async (fn: () => Promise<void>) => {
    try {
      setBusy(true);
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const confirmArchive = () => {
    if (reason.trim().length < 10) return alert('Descreva o motivo do arquivamento com pelo menos 10 caracteres.');
    void run(() => onArchive(reason.trim()));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[94vh] flex flex-col border border-slate-200 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 sm:px-7 pt-5 sm:pt-6 pb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-xl flex items-center justify-center shrink-0 shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Resumo do candidato</span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight truncate">{candidate.name}</h3>
              <div className="text-sm text-slate-500">{candidate.currentRole} • {candidate.yearsOfExperience} anos de experiência</div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold ${fromPortal ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {fromPortal ? <UserCheck className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                  {fromPortal ? 'Informado pelo candidato (portal)' : 'Cadastrado pelo RH'}
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-500"><CalendarDays className="w-3.5 h-3.5" /> Cadastrado em {formatDateSP(candidate.registeredAt)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onEdit && (
              <button onClick={onEdit} className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-800 hover:bg-slate-50 font-semibold text-sm">
                <Pencil className="w-4 h-4" /> Editar perfil
              </button>
            )}
            <button onClick={onClose} aria-label="Fechar" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="px-5 sm:px-7 pb-5 space-y-4 overflow-y-auto text-xs">
          {onEdit && (
            <button onClick={onEdit} className="sm:hidden flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-800 font-semibold text-sm">
              <Pencil className="w-4 h-4" /> Editar perfil
            </button>
          )}

          {candidate.archived && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
              <Archive className="w-5 h-5 text-rose-600 shrink-0" />
              <b>Perfil arquivado</b>
              <span className="text-rose-800/80">Fora da lista principal do Banco de Talentos. Nenhum dado foi apagado.</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Coluna principal */}
            <div className="lg:col-span-3 space-y-4">
              <Card icon={<FileText className="w-4 h-4" />} title="Resumo profissional">
                {candidate.resumeSummary
                  ? <p className="text-slate-600 leading-relaxed">{candidate.resumeSummary}</p>
                  : <p className="text-slate-400 italic">Sem resumo informado.</p>}
              </Card>

              <Card icon={<Settings className="w-4 h-4" />} title="Competências">
                {candidate.skills.length > 0
                  ? <div className="flex flex-wrap gap-2">{candidate.skills.map(k => <Pill key={k}>{k}</Pill>)}</div>
                  : <p className="text-slate-400 italic">Nenhuma competência informada.</p>}
              </Card>

              <Card icon={<Globe className="w-4 h-4" />} title="Idiomas">
                {candidate.languages.length > 0
                  ? <div className="flex flex-wrap gap-2">{candidate.languages.map(k => <Pill key={k}>{k}</Pill>)}</div>
                  : <p className="text-slate-400 italic">Nenhum idioma informado.</p>}
              </Card>

              <Card
                icon={<Briefcase className="w-4 h-4" />}
                title={shown && ['in_review', 'advancing', 'hold'].includes(shown.status) ? 'Candidatura ativa' : 'Última candidatura'}
              >
                {applications === null ? <p className="text-slate-400 italic">Carregando…</p> : !shown ? (
                  <p className="text-slate-400 italic">Este talento ainda não está em nenhum processo seletivo.</p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-base">{shownJob?.title ?? 'Vaga'}</div>
                        {shownJob && <div className="text-slate-500">{shownJob.workModel} • {shownJob.location}</div>}
                      </div>
                      <div className="text-right space-y-1">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold ${APPLICATION_STATUS[shown.status].cls}`}>
                          <Clock className="w-3.5 h-3.5" /> {APPLICATION_STATUS[shown.status].label}
                        </span>
                        {stageIdx >= 0 && <div className="text-slate-500">{stages[stageIdx].name}</div>}
                      </div>
                    </div>

                    {stages.length > 0 && (
                      <div className="overflow-x-auto">
                        <ol className="flex items-start min-w-max sm:min-w-0">
                          {stages.map((s, i) => {
                            const state = shown.status === 'hired' || i < stageIdx ? 'done' : i === stageIdx ? 'current' : 'todo';
                            return (
                              <li key={s.id} className="flex-1 min-w-[88px] relative" aria-current={state === 'current' ? 'step' : undefined}>
                                {i < stages.length - 1 && <span className={`absolute top-[9px] left-[18px] right-0 h-0.5 ${state === 'done' ? 'bg-indigo-500' : 'bg-slate-200'}`} />}
                                <span className={`relative z-10 flex items-center justify-center w-[18px] h-[18px] rounded-full border-2 ${
                                  state === 'done' ? 'bg-indigo-600 border-indigo-600 text-white' : state === 'current' ? 'bg-white border-indigo-600 ring-4 ring-indigo-100' : 'bg-white border-slate-300'
                                }`}>
                                  {state === 'done' && <Check className="w-2.5 h-2.5" />}
                                  {state === 'current' && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                                </span>
                                <span className="block mt-1.5 font-semibold text-slate-800 text-[11px] truncate pr-2" title={s.name}>{s.name}</span>
                                <span className="block text-[10px] text-slate-400">{state === 'done' ? 'Concluída' : state === 'current' ? 'Em andamento' : 'Pendente'}</span>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    )}

                    {onOpenApplication && shownJob && (
                      <button onClick={() => onOpenApplication(shownJob.id)} className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1">
                        Ver detalhes da candidatura <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {others.length > 0 && (
                      <div className="pt-2 border-t border-slate-200 space-y-1">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Outras candidaturas ({others.length})</div>
                        {others.map(a => {
                          const job = openings.find(o => o.id === a.jobOpeningId);
                          return (
                            <div key={a.id} className="flex items-center justify-between gap-2 text-slate-600">
                              <span className="truncate">{job?.title ?? 'Vaga'}</span>
                              <span className={`px-2 py-0.5 rounded-full font-semibold shrink-0 ${APPLICATION_STATUS[a.status].cls}`}>{APPLICATION_STATUS[a.status].label}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </Card>

              <Card icon={<History className="w-4 h-4" />} title={`Histórico de alterações${history ? ` (${history.length})` : ''}`}>
                {history === null ? <p className="text-slate-400 italic">Carregando…</p> : history.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-1 text-slate-400">
                    <Clock className="w-5 h-5" /> Nenhuma alteração registrada desde o cadastro.
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {history.map(h => (
                      <li key={h.id} className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-0.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800">
                            {FIELD_LABEL[h.field] ?? h.field}
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${h.kind === 'correction' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                              {h.kind === 'correction' ? 'Correção' : 'Edição'}
                            </span>
                          </span>
                          <span className="text-slate-400">{new Date(h.changedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · {h.changedBy}</span>
                        </div>
                        <div className="text-slate-600 break-words"><span className="line-through text-slate-400">{showValue(h.oldValue)}</span> → <b className="text-slate-800">{showValue(h.newValue)}</b></div>
                        {h.reason && <div className="text-slate-500">Motivo: {h.reason}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {/* Coluna lateral */}
            <div className="lg:col-span-2 space-y-4">
              <Card icon={<UserRound className="w-4 h-4" />} title="Contato e perfil">
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
              </Card>

              {candidate.tags.length > 0 && (
                <Card icon={<Star className="w-4 h-4" />} title="Destaques">
                  <div className="flex flex-wrap gap-2">
                    {candidate.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">{tagIcon(tag)} {tag}</span>
                    ))}
                  </div>
                </Card>
              )}

              <Card
                icon={<Sparkles className="w-4 h-4" />}
                title="Avaliação assistida por IA"
                action={evaluation && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border font-semibold ${decision.cls}`}>
                    {evaluation.humanReviewerDecision === 'APPROVED' && <Check className="w-3 h-3" />} {decision.label}
                  </span>
                )}
              >
                {evaluation && fit ? (
                  <div className="space-y-3">
                    {evalJob && <div className="text-slate-500">{evalJob.title}</div>}
                    <div className="flex items-end gap-4">
                      <span className="text-4xl font-extrabold text-slate-900 leading-none font-mono">{evaluation.overallFitScore}%</span>
                      <span className={`pb-0.5 font-semibold border-l border-slate-300 pl-4 ${fit.cls}`}>{fit.text}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-slate-200">
                        <Code2 className="w-5 h-5 text-slate-500 shrink-0" />
                        <div><div className="text-slate-500">Técnico</div><div className="font-extrabold text-slate-900 text-base">{evaluation.technicalFitScore}%</div></div>
                      </div>
                      <div className="flex items-center gap-2.5 p-3 rounded-xl bg-white border border-slate-200">
                        <Users className="w-5 h-5 text-slate-500 shrink-0" />
                        <div><div className="text-slate-500">Cultural</div><div className="font-extrabold text-slate-900 text-base">{evaluation.culturalFitScore}%</div></div>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">Resultado de apoio à decisão; validação humana necessária.</p>
                    {myEvals.length > 1 && <p className="text-[11px] text-slate-400">Este talento tem {myEvals.length} avaliações (uma por vaga).</p>}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white border border-slate-200 text-slate-500">
                    <FileText className="w-6 h-6 text-slate-300 shrink-0" />
                    <span>Nenhuma avaliação por IA realizada.</span>
                  </div>
                )}
                {onOpenAI && (
                  <button onClick={() => onOpenAI(evaluation?.jobOpeningId ?? shown?.jobOpeningId)} className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-800 hover:bg-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
                    <FileText className="w-4 h-4" /> {evaluation ? 'Ver avaliação completa' : 'Avaliar com IA assistida'}
                  </button>
                )}
              </Card>
            </div>
          </div>
        </div>

        {/* Arquivar: confirmação com motivo */}
        {archiving && (
          <div className="px-5 sm:px-7 py-4 border-t border-rose-200 bg-rose-50/70 space-y-2.5 text-xs">
            <div className="font-bold text-rose-900">Arquivar este perfil?</div>
            <p className="text-rose-800/80">O perfil sai da lista principal do Banco de Talentos. Candidaturas, avaliações e histórico continuam guardados, e você pode reativá-lo depois.</p>
            <textarea
              autoFocus
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo do arquivamento (mínimo 10 caracteres). Ex.: candidato pediu para sair do banco de talentos."
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
            {canEdit && !candidate.archived && !archiving && (
              <button onClick={() => setArchiving(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-sm">
                <Archive className="w-4 h-4" /> Arquivar perfil
              </button>
            )}
            {canEdit && candidate.archived && (
              <button onClick={() => void run(onUnarchive)} disabled={busy} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold text-sm disabled:opacity-60">
                <RotateCcw className="w-4 h-4" /> Reativar perfil
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-sm">Fechar</button>
            {onOpenApplication && shownJob && (
              <button onClick={() => onOpenApplication(shownJob.id)} className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm">
                Abrir candidatura
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
