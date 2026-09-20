import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { TenantApi } from '../../services/api.js';
import {
  CHECKLIST_CATEGORIES, CHECKLIST_RESPONSIBLES, IntegrationTemplate, OnboardingChecklistItem, OnboardingJourney
} from '../../types.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';

interface Props {
  journey: OnboardingJourney;
  onUpdated: (journey: OnboardingJourney) => void;
  onClose: () => void;
}

const emptyExtra = {
  title: '',
  category: 'Cultura & Boas-Vindas' as OnboardingChecklistItem['category'],
  assignedToRole: 'Gestor',
  dueDateDay: 7
};

/** Chooses which model tasks go to ONE hire's integration checklist, or adds a one-off task. */
export const ChecklistManageModal: React.FC<Props> = ({ journey, onUpdated, onClose }) => {
  const [available, setAvailable] = useState<IntegrationTemplate[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [extra, setExtra] = useState(emptyExtra);
  const [busy, setBusy] = useState(false);
  const backdrop = useBackdropClose(onClose);

  useEffect(() => {
    TenantApi.getAvailableChecklistTemplates(journey.id)
      .then(list => { setAvailable(list); setSelected(list.map(t => t.id)); })
      .catch((err: any) => { alert(err.message || 'Erro ao carregar o modelo'); setAvailable([]); });
  }, [journey.id]);

  const run = async (fn: () => Promise<OnboardingJourney>) => {
    try {
      setBusy(true);
      onUpdated(await fn());
      return true;
    } catch (err: any) {
      alert(err.message || 'Erro na operação');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const applySelected = async () => {
    if (selected.length === 0) return alert('Selecione ao menos uma tarefa.');
    if (await run(() => TenantApi.applyChecklistTemplates(journey.id, selected))) onClose();
  };

  const addExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run(() => TenantApi.addChecklistItem(journey.id, extra))) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Itens do checklist de integração</h3>
            <p className="text-xs text-slate-500">{journey.candidateName} · {journey.jobTitle}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-xs">
          <div className="space-y-2">
            <div className="font-bold text-slate-700 uppercase text-[11px]">Do modelo da organização</div>
            {available === null ? (
              <p className="text-slate-400">Carregando…</p>
            ) : available.length === 0 ? (
              <p className="text-slate-500">Todas as tarefas do modelo já estão neste checklist.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <button onClick={() => setSelected(available.map(t => t.id))} className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 font-medium">Marcar todas</button>
                  <button onClick={() => setSelected([])} className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 font-medium">Limpar</button>
                </div>
                <div className="space-y-1">
                  {available.map(t => (
                    <label key={t.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                      <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
                      <span className="font-medium text-slate-800">{t.name}</span>
                      <span className="ml-auto text-slate-400 shrink-0">{t.responsible} · D+{t.dueDay}</span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button onClick={applySelected} disabled={busy || selected.length === 0} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-60">
                    Incluir {selected.length} {selected.length === 1 ? 'tarefa' : 'tarefas'}
                  </button>
                </div>
              </>
            )}
          </div>

          <form onSubmit={addExtra} className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="font-bold text-slate-700 uppercase text-[11px]">Tarefa avulsa (só para esta contratação)</div>
            <input required value={extra.title} onChange={(e) => setExtra({ ...extra, title: e.target.value })} placeholder="Ex.: Treinamento da ferramenta X" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select value={extra.category} onChange={(e) => setExtra({ ...extra, category: e.target.value as OnboardingChecklistItem['category'] })} className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                {CHECKLIST_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <select value={extra.assignedToRole} onChange={(e) => setExtra({ ...extra, assignedToRole: e.target.value })} className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                {CHECKLIST_RESPONSIBLES.map(r => <option key={r}>{r}</option>)}
              </select>
              <input type="number" min={0} max={365} value={extra.dueDateDay} onChange={(e) => setExtra({ ...extra, dueDateDay: Number(e.target.value) })} title="Dias após o início" className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white" />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold disabled:opacity-60">Adicionar tarefa</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
