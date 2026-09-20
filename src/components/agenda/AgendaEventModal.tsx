import React, { useState } from 'react';
import { X, Video, CheckSquare, Trash2 } from 'lucide-react';
import { AgendaEvent, AgendaDirectoryMember } from '../../types.js';
import { TenantApi } from '../../services/api.js';
import { fromDateTimeLocalSP, toDateTimeLocalSP } from '../../utils/dateUtils.js';
import { DateTimeInputBR } from '../DateInputBR.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';

const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500';

interface Props {
  mode: 'create' | 'edit';
  event?: AgendaEvent;
  /** Create mode only: pre-fills the date when opened from a calendar day (YYYY-MM-DD). */
  initialDate?: string;
  members: AgendaDirectoryMember[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  /** Edit mode only: permanently removes this event (with confirmation). */
  onDelete?: () => Promise<void>;
}

/** Create/edit form for one Agenda Corporativa item — a meeting (with pauta + summary) or a task. */
export const AgendaEventModal: React.FC<Props> = ({ mode, event, initialDate, members, onClose, onSaved, onDelete }) => {
  const [type, setType] = useState<AgendaEvent['type']>(event?.type ?? 'meeting');
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [startsAt, setStartsAt] = useState(event ? toDateTimeLocalSP(event.startsAt) : initialDate ? `${initialDate}T09:00` : '');
  const [endsAt, setEndsAt] = useState(toDateTimeLocalSP(event?.endsAt));
  const [location, setLocation] = useState(event?.location ?? '');
  const [agenda, setAgenda] = useState((event?.agenda ?? []).join('\n'));
  const [summary, setSummary] = useState(event?.summary ?? '');
  const [status, setStatus] = useState<AgendaEvent['status']>(event?.status ?? 'scheduled');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(event?.assigneeIds ?? []);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const backdrop = useBackdropClose(onClose);

  const toggleAssignee = (id: string) =>
    setAssigneeIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const handleDelete = async () => {
    if (!onDelete || !confirm(`Excluir "${event?.title}"? Essa ação não pode ser desfeita.`)) return;
    try {
      setDeleting(true);
      setError('');
      await onDelete();
    } catch (err: any) {
      setError(err.message || 'Não foi possível excluir.');
      setDeleting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startsAt) return;
    const payload: Record<string, unknown> = {
      type,
      title: title.trim(),
      description: description.trim(),
      startsAt: fromDateTimeLocalSP(startsAt),
      endsAt: endsAt ? fromDateTimeLocalSP(endsAt) : null,
      location: location.trim() || null,
      agenda: agenda.split('\n').map(s => s.trim()).filter(Boolean),
      assigneeIds
    };
    if (mode === 'edit') {
      payload.status = status;
      payload.summary = summary.trim() || null;
    }
    try {
      setBusy(true);
      setError('');
      if (mode === 'create') await TenantApi.createAgendaEvent(payload);
      else await TenantApi.updateAgendaEvent(event!.id, payload);
      await onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col border border-slate-200 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
              {mode === 'create' ? 'Novo compromisso' : 'Editar compromisso'}
            </span>
            <h3 className="text-base font-bold text-slate-900">
              {mode === 'create' ? 'Agendar na Agenda Corporativa' : event?.title}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col min-h-0">
          <div className="p-5 space-y-4 text-xs overflow-y-auto">
            <div className="flex gap-2">
              {(['meeting', 'task'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                    type === t ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t === 'meeting' ? <Video className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                  {t === 'meeting' ? 'Reunião' : 'Tarefa'}
                </button>
              ))}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Título<span className="text-rose-500"> *</span>
              </label>
              <input
                required
                lang="pt-BR"
                spellCheck
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
                placeholder={type === 'meeting' ? 'Ex.: Alinhamento semanal do time' : 'Ex.: Preparar relatório mensal'}
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Descrição</label>
              <textarea
                rows={2}
                lang="pt-BR"
                spellCheck
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputCls}
                placeholder="Contexto ou objetivo (opcional)"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {type === 'meeting' ? 'Início' : 'Data/hora'}<span className="text-rose-500"> *</span>
                </label>
                <DateTimeInputBR required value={startsAt} onChange={setStartsAt} />
              </div>
              {type === 'meeting' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Término</label>
                  <DateTimeInputBR value={endsAt} onChange={setEndsAt} />
                </div>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {type === 'meeting' ? 'Local ou link da reunião' : 'Local'}
              </label>
              <input
                lang="pt-BR"
                spellCheck
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={inputCls}
                placeholder={type === 'meeting' ? 'Sala 3, ou https://meet...' : 'Opcional'}
              />
            </div>

            {type === 'meeting' && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pauta</label>
                <textarea
                  rows={3}
                  lang="pt-BR"
                  spellCheck
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  className={inputCls}
                  placeholder="Um tópico por linha"
                />
                <p className="text-[11px] text-slate-400 mt-1">Um tópico por linha.</p>
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {type === 'meeting' ? 'Participantes' : 'Responsáveis'}
              </label>
              <div className="border border-slate-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-slate-100">
                {members.length === 0 && <div className="p-3 text-slate-400">Nenhum colaborador ativo encontrado.</div>}
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-2.5 p-2.5 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(m.id)}
                      onChange={() => toggleAssignee(m.id)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-medium text-slate-800">{m.name}</span>
                    <span className="text-slate-400">— {m.jobTitle}</span>
                  </label>
                ))}
              </div>
            </div>

            {mode === 'edit' && (
              <>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value as AgendaEvent['status'])} className={inputCls}>
                    <option value="scheduled">Agendado</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="done">Concluído</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Resumo</label>
                  <textarea
                    rows={3}
                    lang="pt-BR"
                    spellCheck
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className={inputCls}
                    placeholder="O que foi alinhado, decisões tomadas, próximos passos..."
                  />
                </div>
              </>
            )}
          </div>

          {error && <div className="mx-5 mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}

          <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
            {mode === 'edit' && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || busy}
                className="mr-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 font-semibold text-xs disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" /> {deleting ? 'Excluindo…' : 'Excluir'}
              </button>
            )}
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs">
              Cancelar
            </button>
            <button type="submit" disabled={busy || deleting} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs disabled:opacity-60">
              {busy ? 'Salvando…' : mode === 'create' ? 'Agendar' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
