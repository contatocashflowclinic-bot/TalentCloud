import React, { useEffect } from 'react';
import { Calendar, Check, Clock, FileText, Mail, Pencil, Phone, Rocket, Send, ShieldCheck, X } from 'lucide-react';
import { Candidate, JobOffer, JobOpening } from '../../types.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';
import { formatDateSP } from '../../utils/dateUtils.js';
import { OfferDocuments } from './OfferDocuments.js';

type Icon = React.ComponentType<{ className?: string }>;

/** Status banner: label + colors per proposal situation. */
const STATUS: Record<JobOffer['status'], { label: string; icon: Icon; box: string; divider: string; badge: string; text: string }> = {
  accepted: { label: 'Aceita pelo Candidato', icon: Check, box: 'bg-emerald-50 border-emerald-200', divider: 'border-emerald-200', badge: 'bg-emerald-600', text: 'text-emerald-900' },
  sent: { label: 'Enviada ao Candidato', icon: Send, box: 'bg-blue-50 border-blue-200', divider: 'border-blue-200', badge: 'bg-blue-600', text: 'text-blue-900' },
  approved: { label: 'Aprovada Internamente', icon: ShieldCheck, box: 'bg-violet-50 border-violet-200', divider: 'border-violet-200', badge: 'bg-violet-600', text: 'text-violet-900' },
  declined: { label: 'Recusada', icon: X, box: 'bg-rose-50 border-rose-200', divider: 'border-rose-200', badge: 'bg-rose-600', text: 'text-rose-900' },
  pending_approval: { label: 'Aprovação Pendente', icon: Clock, box: 'bg-amber-50 border-amber-200', divider: 'border-amber-200', badge: 'bg-amber-500', text: 'text-amber-900' },
  // The list cards already label a draft as pending approval; the summary says the same.
  draft: { label: 'Aprovação Pendente', icon: Clock, box: 'bg-amber-50 border-amber-200', divider: 'border-amber-200', badge: 'bg-amber-500', text: 'text-amber-900' }
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-slate-500 mb-2">{children}</h4>
);

const InfoCard: React.FC<{ icon: Icon; label: string; value: string }> = ({ icon: I, label, value }) => (
  <div className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
    <span className="w-11 h-11 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
      <I className="w-5 h-5" />
    </span>
    <div className="min-w-0">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900 leading-snug">{value}</div>
    </div>
  </div>
);

interface Props {
  offer: JobOffer;
  candidate?: Candidate;
  job?: JobOpening;
  /** Person may change the proposal (offers:edit): attach / remove documents. */
  canEdit: boolean;
  /** Terms may still be edited (proposal not yet with the candidate). */
  editable: boolean;
  onClose: () => void;
  onEdit: () => void;
  /** Receives the proposal returned by the server after a document is attached or removed. */
  onOfferChanged: (offer: JobOffer) => void;
}

/** "Resumo da Proposta": everything about one proposal in a single read-first screen. */
export const OfferSummaryModal: React.FC<Props> = ({ offer, candidate, job, canEdit, editable, onClose, onEdit, onOfferChanged }) => {
  const backdrop = useBackdropClose(onClose);
  const status = STATUS[offer.status] ?? STATUS.pending_approval;
  const StatusIcon = status.icon;
  const hasCandidateInfo = !!(candidate?.currentRole || candidate?.email || candidate?.phone);
  const timeline = [
    offer.sentAt && `Enviada em ${formatDateSP(offer.sentAt)}`,
    offer.respondedAt && `Respondida em ${formatDateSP(offer.respondedAt)}`
  ].filter(Boolean) as string[];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Resumo da proposta"
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-slate-200 shadow-2xl"
      >
        {/* Header */}
        <div className="px-5 sm:px-7 pt-5 sm:pt-6 pb-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-500">Resumo da Proposta</span>
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight mt-1">{candidate?.name || 'Candidato'}</h3>
            {job?.title && <div className="text-sm sm:text-base text-slate-600 mt-0.5">{job.title}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center shrink-0 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-7 py-5 space-y-5 text-sm">
          {/* Status + salary */}
          <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border px-4 py-3.5 ${status.box}`}>
            <div className="flex items-center gap-3 min-w-0">
              <span className={`w-10 h-10 rounded-full text-white flex items-center justify-center shrink-0 ${status.badge}`}>
                <StatusIcon className="w-5 h-5" />
              </span>
              <span className={`text-sm sm:text-base font-extrabold uppercase tracking-wide ${status.text}`}>{status.label}</span>
            </div>
            <div className={`sm:pl-4 sm:border-l ${status.divider} text-xl sm:text-2xl font-extrabold text-slate-900 whitespace-nowrap`}>
              R$ {offer.baseSalary.toLocaleString('pt-BR')}/mês
            </div>
          </div>

          {/* Contract + start date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoCard icon={FileText} label="Contrato" value={offer.contractType} />
            <InfoCard icon={Calendar} label="Início previsto" value={formatDateSP(offer.startDate)} />
          </div>

          {/* Candidate */}
          {hasCandidateInfo && (
            <section>
              <SectionTitle>Candidato</SectionTitle>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 space-y-1.5 text-slate-700">
                {candidate?.currentRole && <div className="text-base text-slate-800">{candidate.currentRole}</div>}
                {candidate?.email && (
                  <div className="flex items-center gap-2.5 min-w-0"><Mail className="w-4 h-4 text-slate-500 shrink-0" /> <span className="truncate">{candidate.email}</span></div>
                )}
                {candidate?.phone && (
                  <div className="flex items-center gap-2.5"><Phone className="w-4 h-4 text-slate-500 shrink-0" /> {candidate.phone}</div>
                )}
              </div>
            </section>
          )}

          {/* Benefits */}
          <section>
            <SectionTitle>Benefícios ({offer.benefits.length})</SectionTitle>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3.5">
              {offer.benefits.length === 0 ? (
                <div className="text-slate-400">Nenhum benefício informado.</div>
              ) : (
                <ul className="sm:columns-2 sm:gap-x-8">
                  {offer.benefits.map((b, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-slate-700 break-inside-avoid py-1.5">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                      <span className="pt-0.5">{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Signed contract, addenda... */}
          <OfferDocuments offer={offer} canEdit={canEdit} onChanged={onOfferChanged} />

          {timeline.length > 0 && (
            <div className="flex items-center gap-2.5 text-slate-500">
              <Clock className="w-4 h-4 shrink-0" />
              <span>{timeline.join('  •  ')}</span>
            </div>
          )}

          {offer.notes && (
            <div className="flex items-center gap-3.5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
              <span className="w-11 h-11 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wide text-amber-800">Observações</div>
                <div className="text-slate-800">{offer.notes}</div>
              </div>
            </div>
          )}

          {offer.status === 'accepted' && (
            <div className="flex items-center gap-3.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Rocket className="w-5 h-5" />
              </span>
              <span className="text-emerald-900">
                <b>Candidato contratado.</b> A jornada de onboarding foi aberta no Módulo 12.
              </span>
            </div>
          )}

          {editable && (
            <div className="flex justify-end">
              <button
                onClick={onEdit}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold flex items-center gap-2 transition-colors"
              >
                <Pencil className="w-4 h-4" /> Editar proposta
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
