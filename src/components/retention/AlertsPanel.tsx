import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, Plus, Pencil, Trash2, History, ChevronDown, ChevronUp, CheckCircle2, ClipboardCheck, RefreshCw, ExternalLink, UserRound
} from 'lucide-react';
import { ALERT_STATUSES, type AlertStatus, type DevelopmentLookups, type RetentionPerson, type TurnoverRiskAlert } from '../../types.js';
import { ALERT_STATUS_LABEL, RISK_LEVELS, isActiveAlert } from '../../retention.js';
import { TenantApi } from '../../services/api.js';
import { formatDateTimeSP } from '../../utils/dateUtils.js';
import { ALERT_STATUS_STYLE, RISK_STYLE, isUntouchedAlert, sortAlerts } from '../../utils/retentionUtils.js';
import { ConfirmDialog } from '../ConfirmDialog.js';
import { EditFormModal, type FieldDef } from '../modules/EditFormModal.js';
import { RetentionPersonPickerModal } from './RetentionPersonPickerModal.js';

type Modal =
  | { kind: 'picker' }
  | { kind: 'new'; person: RetentionPerson | null }
  | { kind: 'edit'; alert: TurnoverRiskAlert }
  | { kind: 'action'; alert: TurnoverRiskAlert }
  | { kind: 'status'; alert: TurnoverRiskAlert };

interface Props {
  alerts: TurnoverRiskAlert[];
  lookups: DevelopmentLookups;
  /** collaboratorId -> id do PDI dessa pessoa */
  developmentLinks: Record<string, string>;
  canEdit: boolean;
  /** The user can open the Development module (needed for the "Abrir PDI" shortcut). */
  canOpenPdi: boolean;
  onOpenPdi: (recordId: string) => void;
  /** Reloads the module data after any change. */
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}

type StatusFilter = 'active' | 'all' | AlertStatus;

const selectCls = 'px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-hidden focus:border-indigo-500';

export const AlertsPanel: React.FC<Props> = ({ alerts, lookups, developmentLinks, canEdit, canOpenPdi, onOpenPdi, onChanged, onError }) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [riskFilter, setRiskFilter] = useState<'all' | (typeof RISK_LEVELS)[number]>('all');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [people, setPeople] = useState<RetentionPerson[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TurnoverRiskAlert | null>(null);
  const [busy, setBusy] = useState(false);
  const [openHistory, setOpenHistory] = useState<Set<string>>(new Set());

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortAlerts(alerts).filter(a =>
      (statusFilter === 'all' || (statusFilter === 'active' ? isActiveAlert(a.status) : a.status === statusFilter)) &&
      (riskFilter === 'all' || a.riskLevel === riskFilter) &&
      (!q || `${a.collaboratorName} ${a.department}`.toLowerCase().includes(q))
    );
  }, [alerts, statusFilter, riskFilter, query]);

  const ownerName = (id?: string) => lookups.members.find(m => m.id === id)?.name;

  const toggleHistory = (id: string) =>
    setOpenHistory(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openPicker = async () => {
    setPeople(null);
    setModal({ kind: 'picker' });
    try {
      setPeople(await TenantApi.getRetentionPeople());
    } catch (err: any) {
      setModal(null);
      onError(err.message || 'Não foi possível carregar a lista de pessoas.');
    }
  };

  const done = async () => {
    setModal(null);
    await onChanged();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      setBusy(true);
      await TenantApi.deleteTurnoverAlert(pendingDelete.id);
      setPendingDelete(null);
      await onChanged();
    } catch (err: any) {
      setPendingDelete(null);
      onError(err.message || 'Não foi possível excluir o alerta.');
    } finally {
      setBusy(false);
    }
  };

  // ---- Forms -------------------------------------------------------------------------------
  const alertFields: FieldDef[] = [
    { key: 'collaboratorName', label: 'Nome do colaborador', type: 'text', required: true },
    { key: 'departmentId', label: 'Departamento', type: 'select', nullable: true, half: true, options: lookups.departments.map(d => ({ value: d.id, label: d.name })) },
    { key: 'riskLevel', label: 'Nível de risco', type: 'select', noEmpty: true, half: true, options: RISK_LEVELS.map(r => ({ value: r, label: r })) },
    { key: 'ownerId', label: 'Responsável pelo acompanhamento', type: 'select', nullable: true, options: lookups.members.map(m => ({ value: m.id, label: m.jobTitle ? `${m.name} — ${m.jobTitle}` : m.name })) },
    { key: 'earlyWarningSignals', label: 'Sinais observados', type: 'lines', placeholder: 'Menos participativo em reuniões\nQueda de produtividade', help: 'Um sinal por linha.' },
    { key: 'suggestedActions', label: 'Ações preventivas sugeridas', type: 'lines', placeholder: '1:1 de alinhamento com o gestor\nRevisão de escopo', help: 'Uma ação por linha.' }
  ];

  const actionFields: FieldDef[] = [
    { key: 'action', label: 'O que foi feito?', type: 'textarea', required: true, placeholder: 'Ex.: Conversa de carreira com o gestor; combinado revisar o PDI em 15 dias.' }
  ];

  const statusOptions = (alert: TurnoverRiskAlert) =>
    (isActiveAlert(alert.status) ? ALERT_STATUSES.filter(s => s !== alert.status) : (['open'] as AlertStatus[]))
      .map(s => ({ value: s, label: !isActiveAlert(alert.status) ? 'Reabrir o alerta' : ALERT_STATUS_LABEL[s] }));

  const renderModal = () => {
    if (!modal) return null;
    const close = () => setModal(null);

    switch (modal.kind) {
      case 'picker':
        return <RetentionPersonPickerModal people={people} onClose={close} onPick={(person) => setModal({ kind: 'new', person })} />;

      case 'new': {
        const { person } = modal;
        const initial: Record<string, unknown> = { riskLevel: 'Médio', ...(person ? { collaboratorName: person.name, departmentId: person.departmentId } : {}) };
        return (
          <EditFormModal
            eyebrow="Novo alerta"
            title={person ? person.name : 'Cadastrar colaborador'}
            subtitle="Registro sigiloso: fica restrito a quem tem acesso à Retenção."
            fields={alertFields}
            initial={initial}
            saveLabel="Salvar alerta"
            alwaysSave
            onClose={close}
            onSave={async (changes) => {
              await TenantApi.createTurnoverAlert({ collaboratorId: person?.id, ...initial, ...changes });
              await done();
            }}
          />
        );
      }

      case 'edit':
        return (
          <EditFormModal
            title={modal.alert.collaboratorName}
            subtitle="Para registrar o que foi feito, use “Registrar ação”."
            fields={alertFields}
            initial={{ ...modal.alert }}
            onClose={close}
            onSave={async (changes) => {
              await TenantApi.updateTurnoverAlert(modal.alert.id, changes);
              await done();
            }}
          />
        );

      case 'action':
        return (
          <EditFormModal
            eyebrow="Ação realizada"
            title={modal.alert.collaboratorName}
            subtitle={modal.alert.status === 'open' ? 'Ao registrar a primeira ação, o alerta passa para “Em acompanhamento”.' : 'A ação fica no histórico do alerta.'}
            fields={actionFields}
            initial={{}}
            saveLabel="Registrar ação"
            alwaysSave
            onClose={close}
            onSave={async (changes) => {
              await TenantApi.addAlertAction(modal.alert.id, String(changes.action ?? ''));
              await done();
            }}
          />
        );

      case 'status': {
        const options = statusOptions(modal.alert);
        return (
          <EditFormModal
            eyebrow="Situação do alerta"
            title={modal.alert.collaboratorName}
            subtitle={`Situação atual: ${ALERT_STATUS_LABEL[modal.alert.status]}.`}
            fields={[
              { key: 'status', label: isActiveAlert(modal.alert.status) ? 'Nova situação' : 'Ação', type: 'select', noEmpty: true, options },
              { key: 'note', label: 'Observação', type: 'textarea', help: 'Obrigatória para “Descartado” (por quê) e “Colaborador saiu” (motivo).' }
            ]}
            initial={{ status: options[0]?.value }}
            saveLabel="Salvar situação"
            alwaysSave
            onClose={close}
            onSave={async (changes) => {
              await TenantApi.changeAlertStatus(modal.alert.id, String(changes.status ?? options[0]?.value), changes.note ? String(changes.note) : undefined);
              await done();
            }}
          />
        );
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} aria-label="Filtrar por situação" className={selectCls}>
            <option value="active">Ativos (abertos e em acompanhamento)</option>
            <option value="all">Todos</option>
            {ALERT_STATUSES.map(s => <option key={s} value={s}>{ALERT_STATUS_LABEL[s]}</option>)}
          </select>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value as typeof riskFilter)} aria-label="Filtrar por risco" className={selectCls}>
            <option value="all">Todos os riscos</option>
            {RISK_LEVELS.map(r => <option key={r} value={r}>Risco {r}</option>)}
          </select>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou departamento"
            aria-label="Buscar alerta"
            className={`${selectCls} w-full sm:w-64`}
          />
        </div>
        {canEdit && (
          <button
            onClick={() => void openPicker()}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Registrar Sinal de Risco
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Termômetro de Risco & Sinais de Desengajamento
          </h3>
          <span className="text-xs text-slate-400 shrink-0">Sigiloso para Gestores e RH</span>
        </div>

        {shown.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            {alerts.length === 0 ? 'Nenhum sinal de risco registrado ainda.' : 'Nenhum alerta com esses filtros.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {shown.map(alert => {
              const active = isActiveAlert(alert.status);
              const pdiId = developmentLinks[alert.collaboratorId];
              const owner = ownerName(alert.ownerId);
              const historyOpen = openHistory.has(alert.id);
              return (
                <div key={alert.id} className={`p-4 rounded-xl border space-y-3 text-xs ${active ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200 opacity-90'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-sm truncate">{alert.collaboratorName}</h4>
                      <div className="text-[11px] text-slate-500">{alert.department}</div>
                      {owner && <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5"><UserRound className="w-3 h-3" /> Responsável: {owner}</div>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${RISK_STYLE[alert.riskLevel]}`}>Risco {alert.riskLevel}</span>
                      <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${ALERT_STATUS_STYLE[alert.status]}`}>{ALERT_STATUS_LABEL[alert.status]}</span>
                    </div>
                  </div>

                  {alert.earlyWarningSignals.length > 0 && (
                    <div>
                      <span className="text-[11px] font-semibold text-slate-600 block mb-1">Sinais de Alerta:</span>
                      <ul className="space-y-0.5 text-slate-600 list-disc list-inside text-[11px]">
                        {alert.earlyWarningSignals.map((s, idx) => <li key={idx}>{s}</li>)}
                      </ul>
                    </div>
                  )}

                  {alert.suggestedActions.length > 0 && (
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-[11px] font-semibold text-indigo-700 block mb-1">Ações Recomendadas:</span>
                      <ul className="space-y-0.5 text-indigo-900 text-[11px]">
                        {alert.suggestedActions.map((a, idx) => (
                          <li key={idx} className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-indigo-600 shrink-0" /> {a}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {alert.lastActionTaken && (
                    <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-700">Última ação: </span>{alert.lastActionTaken}
                    </div>
                  )}

                  {!active && (
                    <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-700">{ALERT_STATUS_LABEL[alert.status]}</span>
                      {alert.resolvedAt ? ` em ${formatDateTimeSP(alert.resolvedAt)}` : ''}
                      {alert.resolutionNote ? ` — ${alert.resolutionNote}` : ''}
                    </div>
                  )}

                  {alert.history.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleHistory(alert.id)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-indigo-700"
                        aria-expanded={historyOpen}
                      >
                        <History className="w-3 h-3" /> Histórico ({alert.history.length})
                        {historyOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {historyOpen && (
                        <ol className="mt-2 space-y-1.5 border-l-2 border-slate-200 pl-3">
                          {[...alert.history].reverse().map((h, idx) => (
                            <li key={idx} className="text-[11px] text-slate-600">
                              <span className="text-slate-400">{formatDateTimeSP(h.at)} · {h.by}</span>
                              <br />{h.text}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}

                  {(canEdit || (canOpenPdi && pdiId)) && (
                    <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2">
                      {canEdit && active && (
                        <button onClick={() => setModal({ kind: 'action', alert })} className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1">
                          <ClipboardCheck className="w-3 h-3" /> Registrar ação
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={() => setModal({ kind: 'status', alert })} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" /> {active ? 'Alterar situação' : 'Reabrir'}
                        </button>
                      )}
                      {canEdit && active && (
                        <button onClick={() => setModal({ kind: 'edit', alert })} className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold flex items-center gap-1">
                          <Pencil className="w-3 h-3" /> Editar
                        </button>
                      )}
                      {canOpenPdi && pdiId && (
                        <button onClick={() => onOpenPdi(pdiId)} className="px-2.5 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> Abrir PDI
                        </button>
                      )}
                      {canEdit && isUntouchedAlert(alert) && (
                        <button onClick={() => setPendingDelete(alert)} aria-label="Excluir alerta" className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {renderModal()}

      {pendingDelete && (
        <ConfirmDialog
          title="Excluir alerta?"
          message={<>O alerta de <strong>{pendingDelete.collaboratorName}</strong> será excluído. Só é possível porque ninguém trabalhou nele ainda.</>}
          confirmLabel="Excluir"
          tone="danger"
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
};
