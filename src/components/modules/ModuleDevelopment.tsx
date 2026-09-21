import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, Plus, Target, MessageSquare, Pencil, Trash2, History, ChevronDown, ChevronUp, CalendarClock,
  AlertTriangle, Ban, RotateCcw, UserPlus, CheckCircle2
} from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { TenantApi } from '../../services/api.js';
import {
  CollaboratorDevelopment, DevelopmentLookups, DevelopmentPerson, OneOnOneMeeting, PDIGoal
} from '../../types.js';
import { formatDateSP, formatDateTimeSP, spDateKey } from '../../utils/dateUtils.js';
import {
  GOAL_STATUS, canDeleteGoal, isGoalOverdue, isOpenGoal, overallProgress, quarterFrom, sortGoals
} from '../../utils/pdiUtils.js';
import { ConfirmDialog } from '../ConfirmDialog.js';
import { EditFormModal, FieldDef } from './EditFormModal.js';
import { PdiGoalProgressModal } from './PdiGoalProgressModal.js';
import { PdiPersonPickerModal } from './PdiPersonPickerModal.js';

type Modal =
  | { kind: 'picker' }
  | { kind: 'record-new'; person: DevelopmentPerson | null }
  | { kind: 'record-edit' }
  | { kind: 'goal-new' }
  | { kind: 'goal-edit'; goal: PDIGoal }
  | { kind: 'goal-progress'; goal: PDIGoal; reopen?: boolean }
  | { kind: 'meeting-new' }
  | { kind: 'meeting-edit'; meeting: OneOnOneMeeting };

interface Pending {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'default';
  run: () => Promise<void>;
}

const NO_LOOKUPS: DevelopmentLookups = { departments: [], members: [] };

export const ModuleDevelopment: React.FC = () => {
  const { activeTenant } = useTenant();
  const { user } = useAuth();
  const canEdit = !!user?.permissions.includes('development:edit');

  const [records, setRecords] = useState<CollaboratorDevelopment[]>([]);
  const [lookups, setLookups] = useState<DevelopmentLookups>(NO_LOOKUPS);
  const [loading, setLoading] = useState(true);
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [people, setPeople] = useState<DevelopmentPerson[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [pendingBusy, setPendingBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [openHistory, setOpenHistory] = useState<Set<string>>(new Set());

  const today = spDateKey(new Date());

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await TenantApi.getDevelopment();
      setRecords(data.records);
      setLookups(data.lookups ?? NO_LOOKUPS);
      setSelectedRecordId(current => (data.records.some(r => r.id === current) ? current : data.records[0]?.id ?? ''));
    } catch (err: any) {
      console.error('Failed to load development records:', err);
      setFeedback(err.message || 'Não foi possível carregar os PDIs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [activeTenant?.id]);

  const activeRecord = records.find(r => r.id === selectedRecordId) ?? records[0];
  const goals = useMemo(() => sortGoals(activeRecord?.goals ?? []), [activeRecord]);
  const meetings = useMemo(
    () => [...(activeRecord?.oneOnOnes ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [activeRecord]
  );
  const progress = overallProgress(activeRecord?.goals ?? []);
  const achievedCount = (activeRecord?.goals ?? []).filter(g => g.status === 'achieved').length;

  const departmentName = (id?: string) => lookups.departments.find(d => d.id === id)?.name;
  const managerName = (id?: string) => lookups.members.find(m => m.id === id)?.name;

  const replaceRecord = (updated: CollaboratorDevelopment) =>
    setRecords(list => list.map(r => (r.id === updated.id ? updated : r)));

  /** Runs a change that returns the updated PDI; the caller keeps the form open on error (the form shows the message). */
  const save = async (change: () => Promise<CollaboratorDevelopment>) => {
    replaceRecord(await change());
    setModal(null);
  };

  const ask = (title: string, message: React.ReactNode, confirmLabel: string, run: () => Promise<void>, tone: Pending['tone'] = 'danger') =>
    setPending({ title, message, confirmLabel, tone, run });

  const confirmPending = async () => {
    if (!pending) return;
    try {
      setPendingBusy(true);
      await pending.run();
      setPending(null);
    } catch (err: any) {
      setPending(null);
      setFeedback(err.message || 'Não foi possível concluir a ação.');
    } finally {
      setPendingBusy(false);
    }
  };

  const openPicker = async () => {
    setPeople(null);
    setModal({ kind: 'picker' });
    try {
      setPeople(await TenantApi.getDevelopmentPeople());
    } catch (err: any) {
      setModal(null);
      setFeedback(err.message || 'Não foi possível carregar a lista de pessoas.');
    }
  };

  const toggleHistory = (goalId: string) =>
    setOpenHistory(current => {
      const next = new Set(current);
      if (next.has(goalId)) next.delete(goalId);
      else next.add(goalId);
      return next;
    });

  // ---- Form definitions -------------------------------------------------------------------
  const recordFields: FieldDef[] = [
    { key: 'collaboratorName', label: 'Nome do colaborador', type: 'text', required: true },
    { key: 'jobTitle', label: 'Cargo', type: 'text', required: true, half: true },
    {
      key: 'departmentId', label: 'Departamento', type: 'select', nullable: true, half: true,
      options: lookups.departments.map(d => ({ value: d.id, label: d.name }))
    },
    {
      key: 'managerId', label: 'Gestor', type: 'select', nullable: true, half: true,
      options: lookups.members.map(m => ({ value: m.id, label: m.jobTitle ? `${m.name} — ${m.jobTitle}` : m.name }))
    },
    { key: 'hireDate', label: 'Data de admissão', type: 'date', required: true, half: true },
    { key: 'nextReviewDate', label: 'Próximo 1:1', type: 'date', half: true, help: 'Opcional. Fica em destaque no PDI e avisa quando atrasar.' }
  ];

  const goalFields: FieldDef[] = [
    { key: 'title', label: 'Meta', type: 'text', required: true, placeholder: 'Ex.: Certificação Cloud Professional' },
    { key: 'competency', label: 'Competência', type: 'text', half: true, placeholder: 'Ex.: Arquitetura, Liderança', help: 'Em branco, fica como "Geral".' },
    { key: 'deadline', label: 'Prazo', type: 'date', required: true, half: true },
    { key: 'description', label: 'Como será medido (opcional)', type: 'textarea', placeholder: 'Ex.: Aprovação no exame e apresentação do aprendizado ao time.' }
  ];

  const meetingFields = (withNext: boolean): FieldDef[] => [
    { key: 'date', label: 'Data do 1:1', type: 'date', required: true, half: true, help: 'Data em que a conversa aconteceu.' },
    ...(withNext ? [{ key: 'nextMeetingDate', label: 'Próximo 1:1', type: 'date' as const, half: true, help: 'Opcional. Quando será a próxima conversa.' }] : []),
    { key: 'keyTakeaways', label: 'Principais pontos conversados', type: 'textarea', required: true },
    { key: 'actionItems', label: 'Ações combinadas', type: 'lines', help: 'Uma ação por linha. Opcional.' }
  ];

  const renderModal = () => {
    if (!modal) return null;
    const close = () => setModal(null);

    switch (modal.kind) {
      case 'picker':
        return <PdiPersonPickerModal people={people} onClose={close} onPick={(person) => setModal({ kind: 'record-new', person })} />;

      case 'record-new': {
        const { person } = modal;
        const initial: Record<string, unknown> = person
          ? { collaboratorName: person.name, jobTitle: person.jobTitle, departmentId: person.departmentId, hireDate: person.hireDate ?? '' }
          : {};
        return (
          <EditFormModal
            eyebrow="Novo PDI"
            title={person ? person.name : 'Cadastrar colaborador'}
            subtitle="Confira os dados. Depois é só incluir metas e registrar os 1:1s."
            fields={recordFields}
            initial={initial}
            saveLabel="Criar PDI"
            alwaysSave
            onClose={close}
            onSave={async (changes) => {
              const created = await TenantApi.createDevelopmentRecord({ collaboratorId: person?.id, ...initial, ...changes });
              setRecords(list => [...list, created]);
              setSelectedRecordId(created.id);
              setModal(null);
            }}
          />
        );
      }

      case 'record-edit':
        return activeRecord ? (
          <EditFormModal
            title={activeRecord.collaboratorName}
            subtitle="Dados do colaborador neste PDI."
            fields={recordFields}
            initial={{ ...activeRecord }}
            onClose={close}
            onSave={(changes) => save(() => TenantApi.updateDevelopmentRecord(activeRecord.id, changes))}
          />
        ) : null;

      case 'goal-new': {
        const initial = { deadline: quarterFrom(today) };
        return activeRecord ? (
          <EditFormModal
            eyebrow="Nova meta"
            title={activeRecord.collaboratorName}
            subtitle="A meta começa como “Não iniciada”, com 0% de progresso."
            fields={goalFields}
            initial={initial}
            saveLabel="Salvar meta"
            alwaysSave
            onClose={close}
            onSave={(changes) => save(() => TenantApi.createGoal(activeRecord.id, { ...initial, ...changes }))}
          />
        ) : null;
      }

      case 'goal-edit':
        return activeRecord ? (
          <EditFormModal
            title={modal.goal.title}
            subtitle="Para mudar o andamento, use “Atualizar progresso”."
            fields={goalFields}
            initial={{ ...modal.goal }}
            onClose={close}
            onSave={(changes) => save(() => TenantApi.updateGoal(activeRecord.id, modal.goal.id, changes))}
          />
        ) : null;

      case 'goal-progress':
        return activeRecord ? (
          <PdiGoalProgressModal
            goal={modal.goal}
            reopen={modal.reopen}
            onClose={close}
            onSave={(payload) => save(() => TenantApi.updateGoal(activeRecord.id, modal.goal.id, payload))}
          />
        ) : null;

      case 'meeting-new': {
        const initial = { date: today };
        return activeRecord ? (
          <EditFormModal
            eyebrow="Registrar 1:1"
            title={activeRecord.collaboratorName}
            subtitle="Registre o que foi conversado e o que ficou combinado."
            fields={meetingFields(true)}
            initial={initial}
            saveLabel="Registrar 1:1"
            alwaysSave
            onClose={close}
            onSave={(changes) => save(() => TenantApi.createOneOnOne(activeRecord.id, { ...initial, ...changes }))}
          />
        ) : null;
      }

      case 'meeting-edit':
        return activeRecord ? (
          <EditFormModal
            title={`1:1 de ${formatDateSP(modal.meeting.date)}`}
            subtitle={activeRecord.collaboratorName}
            fields={meetingFields(false)}
            initial={{ ...modal.meeting }}
            onClose={close}
            onSave={(changes) => save(() => TenantApi.updateOneOnOne(activeRecord.id, modal.meeting.id, changes))}
          />
        ) : null;
    }
  };

  // ---- Actions with confirmation ------------------------------------------------------------
  const askDeleteRecord = (record: CollaboratorDevelopment) =>
    ask('Excluir este PDI?', <>O PDI de <strong>{record.collaboratorName}</strong> ainda está vazio e será excluído.</>, 'Excluir PDI', async () => {
      await TenantApi.deleteDevelopmentRecord(record.id);
      const rest = records.filter(r => r.id !== record.id);
      setRecords(rest);
      setSelectedRecordId(rest[0]?.id ?? '');
    });

  const askDeleteGoal = (record: CollaboratorDevelopment, goal: PDIGoal) =>
    ask('Excluir esta meta?', <>A meta <strong>{goal.title}</strong> ainda não teve andamento e será excluída.</>, 'Excluir meta', async () => {
      replaceRecord(await TenantApi.deleteGoal(record.id, goal.id));
    });

  const askCancelGoal = (record: CollaboratorDevelopment, goal: PDIGoal) =>
    ask(
      'Cancelar esta meta?',
      <>A meta <strong>{goal.title}</strong> fica marcada como cancelada e continua no histórico. Você pode reabri-la depois.</>,
      'Cancelar meta',
      async () => { replaceRecord(await TenantApi.updateGoal(record.id, goal.id, { status: 'cancelled', note: 'Meta cancelada.' })); }
    );

  const askDeleteMeeting = (record: CollaboratorDevelopment, meeting: OneOnOneMeeting) =>
    ask('Excluir este 1:1?', <>O registro do 1:1 de <strong>{formatDateSP(meeting.date)}</strong> será excluído do histórico.</>, 'Excluir 1:1', async () => {
      replaceRecord(await TenantApi.deleteOneOnOne(record.id, meeting.id));
    });

  const nextLate = !!activeRecord?.nextReviewDate && activeRecord.nextReviewDate < today;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Desenvolvimento Contínuo & PDI</h1>
          <p className="text-xs text-slate-500">
            Planos de Desenvolvimento Individual (PDI), metas trimestrais e histórico de 1:1s com lideranças.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {records.length > 0 && (
            <select
              value={activeRecord?.id ?? ''}
              onChange={(e) => setSelectedRecordId(e.target.value)}
              aria-label="Colaborador"
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800 shadow-xs"
            >
              {records.map(r => (
                <option key={r.id} value={r.id}>{r.collaboratorName}</option>
              ))}
            </select>
          )}
          {canEdit && (
            <button
              onClick={() => void openPicker()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" /> Novo PDI
            </button>
          )}
        </div>
      </div>

      {loading && records.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">Carregando…</div>
      ) : activeRecord ? (
        <>
          {/* Collaborator summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="truncate">{activeRecord.collaboratorName}</span>
                </h2>
                <p className="text-xs text-slate-500">
                  {activeRecord.jobTitle}{departmentName(activeRecord.departmentId) ? ` · ${departmentName(activeRecord.departmentId)}` : ''}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setModal({ kind: 'record-edit' })}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Editar dados
                  </button>
                  {activeRecord.goals.length === 0 && activeRecord.oneOnOnes.length === 0 && (
                    <button
                      onClick={() => askDeleteRecord(activeRecord)}
                      className="px-3 py-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Excluir PDI
                    </button>
                  )}
                </div>
              )}
            </div>

            <dl className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gestor</dt>
                <dd className="font-semibold text-slate-800">{managerName(activeRecord.managerId) ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Admissão</dt>
                <dd className="font-semibold text-slate-800">{formatDateSP(activeRecord.hireDate)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Último 1:1</dt>
                <dd className="font-semibold text-slate-800">{activeRecord.lastReviewDate ? formatDateSP(activeRecord.lastReviewDate) : 'Nenhum ainda'}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Próximo 1:1</dt>
                <dd className={`font-semibold flex items-center gap-1 ${nextLate ? 'text-rose-600' : 'text-slate-800'}`}>
                  {activeRecord.nextReviewDate ? (
                    <>
                      {nextLate ? <AlertTriangle className="w-3 h-3" /> : <CalendarClock className="w-3 h-3 text-slate-400" />}
                      {formatDateSP(activeRecord.nextReviewDate)}{nextLate ? ' · atrasado' : ''}
                    </>
                  ) : 'Não agendado'}
                </dd>
              </div>
              <div className="col-span-2 lg:col-span-1">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Progresso do PDI</dt>
                <dd className="font-semibold text-slate-800">
                  {progress === null ? 'Sem metas' : (
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-indigo-600">{progress}%</span>
                      <span className="text-slate-500 font-normal">· {achievedCount} de {activeRecord.goals.filter(g => g.status !== 'cancelled').length} atingida(s)</span>
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Col 1 & 2: Goals */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <Target className="w-4 h-4 text-indigo-600" />
                      Metas do PDI
                    </h3>
                    <p className="text-xs text-slate-500">Objetivos alinhados com o cargo e trilha de carreira.</p>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => setModal({ kind: 'goal-new' })}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar Meta
                    </button>
                  )}
                </div>

                {goals.length === 0 && (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    Nenhuma meta neste PDI ainda.{canEdit ? ' Use “Adicionar Meta” para começar.' : ''}
                  </p>
                )}

                <div className="space-y-3">
                  {goals.map((goal) => {
                    const status = GOAL_STATUS[goal.status];
                    const overdue = isGoalOverdue(goal, today);
                    const history = goal.history ?? [];
                    const historyOpen = openHistory.has(goal.id);
                    const dimmed = goal.status === 'cancelled';

                    return (
                      <div key={goal.id} className={`p-4 rounded-xl border space-y-2.5 text-xs ${dimmed ? 'bg-slate-50/60 border-slate-200 opacity-80' : goal.status === 'achieved' ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className={`font-bold text-slate-900 text-sm break-words ${dimmed ? 'line-through text-slate-500' : ''}`}>{goal.title}</span>
                            <div className="mt-1">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${status.badge}`}>{status.label}</span>
                            </div>
                          </div>
                          <span className="font-mono text-xs font-bold text-indigo-600 shrink-0">{goal.progressPercentage}%</span>
                        </div>

                        {goal.description && <p className="text-slate-600 leading-relaxed whitespace-pre-line">{goal.description}</p>}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 text-[11px]">
                          <span>Competência: <strong className="text-slate-700">{goal.competency}</strong></span>
                          <span>•</span>
                          <span title="Prazo calibrado em São Paulo" className={overdue ? 'text-rose-600 font-semibold flex items-center gap-1' : ''}>
                            {overdue && <AlertTriangle className="w-3 h-3" />}
                            Prazo: {formatDateSP(goal.deadline)}{overdue ? ' · vencido' : ''}
                          </span>
                          {goal.status === 'achieved' && goal.completedAt && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Atingida em {formatDateSP(goal.completedAt)}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-valuenow={goal.progressPercentage} aria-valuemin={0} aria-valuemax={100}>
                          <div className={`h-full rounded-full transition-all duration-300 ${status.bar}`} style={{ width: `${goal.progressPercentage}%` }} />
                        </div>

                        {(canEdit || history.length > 0) && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {canEdit && isOpenGoal(goal) && (
                              <button onClick={() => setModal({ kind: 'goal-progress', goal })} className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" /> Atualizar progresso
                              </button>
                            )}
                            {canEdit && !isOpenGoal(goal) && (
                              <button onClick={() => setModal({ kind: 'goal-progress', goal, reopen: true })} className="px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold flex items-center gap-1">
                                <RotateCcw className="w-3 h-3" /> Reabrir
                              </button>
                            )}
                            {canEdit && (
                              <button onClick={() => setModal({ kind: 'goal-edit', goal })} className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-white text-slate-600 font-medium flex items-center gap-1">
                                <Pencil className="w-3 h-3" /> Editar
                              </button>
                            )}
                            {canEdit && canDeleteGoal(goal) && (
                              <button onClick={() => askDeleteGoal(activeRecord, goal)} className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-500 hover:text-rose-700 font-medium flex items-center gap-1">
                                <Trash2 className="w-3 h-3" /> Excluir
                              </button>
                            )}
                            {canEdit && !canDeleteGoal(goal) && isOpenGoal(goal) && (
                              <button onClick={() => askCancelGoal(activeRecord, goal)} className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-white text-slate-500 font-medium flex items-center gap-1">
                                <Ban className="w-3 h-3" /> Cancelar meta
                              </button>
                            )}
                            {history.length > 0 && (
                              <button onClick={() => toggleHistory(goal.id)} aria-expanded={historyOpen} className="ml-auto px-2.5 py-1 rounded-lg text-slate-500 hover:bg-white font-medium flex items-center gap-1">
                                <History className="w-3 h-3" /> Histórico ({history.length})
                                {historyOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        )}

                        {historyOpen && (
                          <ol className="space-y-1.5 pt-2 border-t border-slate-200">
                            {[...history].reverse().map((entry, i) => (
                              <li key={`${entry.at}-${i}`} className="text-[11px] text-slate-600">
                                <span className="font-mono text-slate-400">{formatDateTimeSP(entry.at)}</span>
                                {' · '}<strong className="text-slate-700">{entry.by}</strong>
                                {' · '}{entry.progressPercentage}% — {GOAL_STATUS[entry.status].label}
                                {entry.note && <span className="block italic text-slate-500">“{entry.note}”</span>}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Col 3: 1:1 History */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 whitespace-nowrap">
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                    Histórico de 1:1s
                  </h3>
                  {canEdit && (
                    <button
                      onClick={() => setModal({ kind: 'meeting-new' })}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> Registrar 1:1
                    </button>
                  )}
                </div>

                {meetings.length === 0 && (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    Nenhum 1:1 registrado.{canEdit ? ' Use “Registrar 1:1” depois da próxima conversa.' : ''}
                  </p>
                )}

                <div className="space-y-3 pt-1">
                  {meetings.map((meeting) => (
                    <div key={meeting.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                        <span className="font-mono">{formatDateSP(meeting.date)}</span>
                        <span className="flex items-center gap-1">
                          <span className="text-slate-600 font-semibold">Alinhamento 1:1</span>
                          {canEdit && (
                            <>
                              <button onClick={() => setModal({ kind: 'meeting-edit', meeting })} aria-label="Editar 1:1" title="Editar 1:1" className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white">
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button onClick={() => askDeleteMeeting(activeRecord, meeting)} aria-label="Excluir 1:1" title="Excluir 1:1" className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </span>
                      </div>
                      <p className="text-slate-700 italic whitespace-pre-line">"{meeting.keyTakeaways}"</p>
                      {meeting.actionItems.length > 0 && (
                        <div className="text-[11px] text-indigo-700 font-medium pt-1.5 border-t border-slate-100">
                          <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Ações</span>
                          <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                            {meeting.actionItems.map((item, i) => <li key={i}>{item}</li>)}
                          </ul>
                        </div>
                      )}
                      {meeting.registeredBy && <div className="text-[10px] text-slate-400">Registrado por {meeting.registeredBy}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="p-8 text-center space-y-3">
          <p className="text-slate-400">Nenhum registro de desenvolvimento cadastrado.</p>
          {canEdit && (
            <button
              onClick={() => void openPicker()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors inline-flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" /> Criar o primeiro PDI
            </button>
          )}
        </div>
      )}

      {renderModal()}

      {pending && (
        <ConfirmDialog
          title={pending.title}
          message={pending.message}
          confirmLabel={pending.confirmLabel}
          cancelLabel="Voltar"
          tone={pending.tone}
          busy={pendingBusy}
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        />
      )}

      {feedback && (
        <ConfirmDialog
          title="Não foi possível concluir"
          message={feedback}
          confirmLabel="Entendi"
          cancelLabel={null}
          onConfirm={() => setFeedback('')}
          onCancel={() => setFeedback('')}
        />
      )}
    </div>
  );
};
