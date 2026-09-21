import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Send, Lock, Trash2, BarChart3, Users, CalendarClock, ClipboardList, Layers, Copy } from 'lucide-react';
import type { ClimateCampaignSummary, PositionOption, SurveyTemplate } from '../../types.js';
import { templateQuestionCount } from '../../surveyTemplates.js';
import { TenantApi } from '../../services/api.js';
import { formatDateSP, spDateKey } from '../../utils/dateUtils.js';
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_STYLE } from '../../utils/retentionUtils.js';
import { ConfirmDialog } from '../ConfirmDialog.js';
import { CampaignFormModal } from './CampaignFormModal.js';
import { CampaignResultsModal } from './CampaignResultsModal.js';

interface Props {
  campaigns: ClimateCampaignSummary[];
  departments: { id: string; name: string }[];
  /** Every template a new survey can start from (system library + the organization's own). */
  templates: SurveyTemplate[];
  positions: PositionOption[];
  unlinkedMembers: number;
  /** Set when coming from the Templates tab: opens the new-survey form already using that template. */
  startWithTemplate?: SurveyTemplate;
  onStartConsumed?: () => void;
  canEdit: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}

type Modal =
  | { kind: 'form'; campaign?: ClimateCampaignSummary; template?: SurveyTemplate; duplicateOf?: ClimateCampaignSummary }
  | { kind: 'results'; campaignId: string };

interface Pending {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  tone: 'danger' | 'default';
  run: () => Promise<unknown>;
}

const audienceText = (c: ClimateCampaignSummary, departments: Props['departments']) =>
  c.audience === 'all'
    ? 'Toda a organização'
    : `${c.departmentIds.length} ${c.departmentIds.length === 1 ? 'departamento' : 'departamentos'}: ${
        c.departmentIds.map(id => departments.find(d => d.id === id)?.name ?? '—').join(', ')
      }`;

/** Aba Pesquisas: cria, publica, acompanha e encerra as pesquisas de clima aplicadas dentro do sistema. */
export const CampaignsPanel: React.FC<Props> = ({ campaigns, departments, templates, positions, unlinkedMembers, startWithTemplate, onStartConsumed, canEdit, onChanged, onError }) => {
  const [modal, setModal] = useState<Modal | null>(null);

  useEffect(() => {
    if (startWithTemplate && canEdit) {
      setModal({ kind: 'form', template: startWithTemplate });
      onStartConsumed?.();
    }
  }, [startWithTemplate]);

  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const today = spDateKey(new Date());

  const sorted = [...campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const ask = (title: string, message: React.ReactNode, confirmLabel: string, run: () => Promise<unknown>, tone: Pending['tone'] = 'default') =>
    setPending({ title, message, confirmLabel, tone, run });

  const confirmPending = async () => {
    if (!pending) return;
    try {
      setBusy(true);
      await pending.run();
      setPending(null);
      await onChanged();
    } catch (err: any) {
      setPending(null);
      onError(err.message || 'Não foi possível concluir a ação.');
    } finally {
      setBusy(false);
    }
  };

  const saved = async () => {
    setModal(null);
    await onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-slate-500 max-w-2xl">
          Pesquisas de clima aplicadas aqui dentro. Cada pessoa do público responde uma vez, de forma <strong>anônima</strong>, e você acompanha a participação e o resultado.
        </p>
        {canEdit && (
          <button
            onClick={() => setModal({ kind: 'form' })}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Nova pesquisa
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
          Nenhuma pesquisa criada ainda.{canEdit ? ' Clique em “Nova pesquisa” para começar.' : ''}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {sorted.map(c => {
            const rate = c.eligible > 0 ? Math.round((c.responded / c.eligible) * 100) : 0;
            return (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3 text-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 text-sm truncate">{c.name}</h4>
                    <div className="text-[11px] text-slate-500">Período {c.period}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded font-semibold text-[10px] shrink-0 ${CAMPAIGN_STATUS_STYLE[c.status]}`}>{CAMPAIGN_STATUS_LABEL[c.status]}</span>
                </div>

                <div className="space-y-1 text-slate-600">
                  <div className="flex items-start gap-1.5"><Users className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" /> {audienceText(c, departments)}</div>
                  <div className="flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    {c.status === 'draft' ? 'Ainda não publicada' : c.closesOn ? `${c.status === 'open' ? 'Encerra' : 'Encerrou'} em ${formatDateSP(c.closesOn)}` : c.status === 'open' ? 'Aberta até ser encerrada' : 'Encerrada'}
                  </div>
                </div>

                {c.status !== 'draft' && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Participação</span>
                      <span className="font-mono text-slate-600">{c.responded} de {c.eligible} ({rate}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`Participação de ${rate}%`}>
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                )}

                {c.blocks.length > 0 && (
                  <div className="flex items-start gap-1.5 text-slate-600">
                    <Layers className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                    {templateQuestionCount(c.blocks)} {templateQuestionCount(c.blocks) === 1 ? 'pergunta estratégica' : 'perguntas estratégicas'} em {c.blocks.length} {c.blocks.length === 1 ? 'bloco' : 'blocos'}{c.templateName ? ` (${c.templateName})` : ''}
                  </div>
                )}

                {c.actionPlan && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-900 flex items-start gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span className="line-clamp-2">{c.actionPlan}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  {c.status !== 'draft' && (
                    <button onClick={() => setModal({ kind: 'results', campaignId: c.id })} className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1">
                      <BarChart3 className="w-3 h-3" /> Ver resultado
                    </button>
                  )}
                  {canEdit && c.status === 'draft' && (
                    <button
                      onClick={() => ask(
                        'Publicar pesquisa?',
                        <>Todas as pessoas do público poderão responder assim que você publicar ({c.eligible} {c.eligible === 1 ? 'pessoa' : 'pessoas'}). Depois disso, só a data de encerramento e o plano de ação podem mudar.</>,
                        'Publicar', () => TenantApi.publishCampaign(c.id)
                      )}
                      disabled={c.eligible === 0}
                      title={c.eligible === 0 ? 'Nenhuma pessoa ativa no público escolhido.' : undefined}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" /> Publicar
                    </button>
                  )}
                  {canEdit && c.status === 'open' && (
                    <button
                      onClick={() => ask(
                        'Encerrar pesquisa?',
                        <>Ninguém mais poderá responder <strong>{c.name}</strong>. Os resultados continuam disponíveis.</>,
                        'Encerrar', () => TenantApi.closeCampaign(c.id), 'danger'
                      )}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold flex items-center gap-1"
                    >
                      <Lock className="w-3 h-3" /> Encerrar
                    </button>
                  )}
                  {canEdit && (
                    <button onClick={() => setModal({ kind: 'form', campaign: c })} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold flex items-center gap-1">
                      <Pencil className="w-3 h-3" /> {c.status === 'closed' ? 'Plano de ação' : 'Editar'}
                    </button>
                  )}
                  {canEdit && (
                    <button onClick={() => setModal({ kind: 'form', duplicateOf: c })} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold flex items-center gap-1">
                      <Copy className="w-3 h-3" /> Duplicar
                    </button>
                  )}
                  {canEdit && c.status === 'draft' && (
                    <button
                      onClick={() => ask('Excluir rascunho?', <>O rascunho <strong>{c.name}</strong> será excluído.</>, 'Excluir', () => TenantApi.deleteCampaign(c.id), 'danger')}
                      aria-label="Excluir rascunho"
                      className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal?.kind === 'form' && (
        <CampaignFormModal campaign={modal.campaign} departments={departments} templates={templates} positions={positions} unlinkedMembers={unlinkedMembers} initialTemplate={modal.template} duplicateOf={modal.duplicateOf} today={today} onSaved={saved} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'results' && (
        <CampaignResultsModal campaignId={modal.campaignId} canEdit={canEdit} onClose={() => setModal(null)} />
      )}

      {pending && (
        <ConfirmDialog
          title={pending.title}
          message={pending.message}
          confirmLabel={pending.confirmLabel}
          tone={pending.tone}
          busy={busy}
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
};
