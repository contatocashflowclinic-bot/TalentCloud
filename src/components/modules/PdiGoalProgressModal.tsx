import React, { useState } from 'react';
import { X } from 'lucide-react';
import { PDIGoal, PDIGoalStatus, PDI_GOAL_STATUSES } from '../../types.js';
import { GOAL_STATUS } from '../../utils/pdiUtils.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';

interface Props {
  goal: PDIGoal;
  /** Opens the form with the status already set to "in progress" (used to reopen a cancelled/achieved goal). */
  reopen?: boolean;
  onSave: (payload: { progressPercentage: number; status: PDIGoalStatus; note: string }) => Promise<void>;
  onClose: () => void;
}

const statusFor = (progress: number): PDIGoalStatus => (progress >= 100 ? 'achieved' : progress > 0 ? 'in_progress' : 'not_started');

/** Records the progress of one goal: percentage, status and an optional note that goes to the goal's history. */
export const PdiGoalProgressModal: React.FC<Props> = ({ goal, reopen, onSave, onClose }) => {
  const [progress, setProgress] = useState(reopen && goal.progressPercentage >= 100 ? 90 : goal.progressPercentage);
  const [status, setStatus] = useState<PDIGoalStatus>(reopen ? 'in_progress' : goal.status);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const backdrop = useBackdropClose(onClose);
  const cancelled = status === 'cancelled';

  // Moving the bar follows the status (0% = not started, 100% = achieved) — except while the goal is cancelled
  const changeProgress = (value: number) => {
    const next = Math.min(100, Math.max(0, Math.round(value) || 0));
    setProgress(next);
    if (!cancelled) setStatus(statusFor(next));
  };

  const changeStatus = (next: PDIGoalStatus) => {
    setStatus(next);
    if (next === 'achieved') setProgress(100);
    else if (next === 'not_started') setProgress(0);
    else if (next === 'in_progress' && progress >= 100) setProgress(90);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setBusy(true);
      setError('');
      await onSave({ progressPercentage: progress, status, note: note.trim() });
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar o progresso.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">{reopen ? 'Reabrir meta' : 'Atualizar progresso'}</span>
            <h3 className="text-base font-bold text-slate-900 break-words">{goal.title}</h3>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col min-h-0">
          <div className="p-5 space-y-4 text-xs overflow-y-auto">
            <div>
              <div className="flex items-end justify-between mb-1">
                <label htmlFor="pdi-progress" className="font-semibold text-slate-700">Progresso</label>
                <span className="text-2xl font-bold font-mono text-indigo-600">{progress}%</span>
              </div>
              <input
                id="pdi-progress"
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                disabled={cancelled}
                onChange={(e) => changeProgress(Number(e.target.value))}
                className="w-full accent-indigo-600 disabled:opacity-50"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                <span>0%</span>
                <label className="flex items-center gap-1.5">
                  Valor exato
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={progress}
                    disabled={cancelled}
                    onChange={(e) => changeProgress(Number(e.target.value))}
                    className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-700 bg-white disabled:opacity-50"
                  />
                </label>
                <span>100%</span>
              </div>
              {cancelled && <p className="text-[11px] text-slate-500 mt-1">Meta cancelada: mude o status abaixo para voltar a atualizar o progresso.</p>}
            </div>

            <div>
              <label htmlFor="pdi-status" className="block font-semibold text-slate-700 mb-1">Situação</label>
              <select
                id="pdi-status"
                value={status}
                onChange={(e) => changeStatus(e.target.value as PDIGoalStatus)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500"
              >
                {PDI_GOAL_STATUSES.map(s => <option key={s} value={s}>{GOAL_STATUS[s].label}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="pdi-note" className="block font-semibold text-slate-700 mb-1">Observação (opcional)</label>
              <textarea
                id="pdi-note"
                rows={3}
                maxLength={500}
                lang="pt-BR"
                spellCheck
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: Concluí o módulo 2 do curso; falta a prova final."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">Fica registrada no histórico da meta, com data e autor.</p>
            </div>
          </div>

          {error && <div className="mx-5 mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}

          <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs">Cancelar</button>
            <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs disabled:opacity-60">
              {busy ? 'Salvando…' : 'Salvar progresso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
