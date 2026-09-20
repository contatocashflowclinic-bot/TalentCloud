import React, { useState } from 'react';
import { X, Plus, Pencil, Power } from 'lucide-react';
import { TenantApi } from '../../services/api.js';
import { CHECKLIST_CATEGORIES, CHECKLIST_RESPONSIBLES, IntegrationTemplate } from '../../types.js';

interface Props {
  templates: IntegrationTemplate[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

const emptyForm = {
  name: '',
  category: 'Cultura & Boas-Vindas' as IntegrationTemplate['category'],
  responsible: 'Gestor' as IntegrationTemplate['responsible'],
  dueDay: 7
};

export const IntegrationCatalogModal: React.FC<Props> = ({ templates, canEdit, onClose, onChanged }) => {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      setBusy(true);
      await fn();
      await onChanged();
      return true;
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (t: IntegrationTemplate) => {
    setEditingId(t.id);
    setForm({ name: t.name, category: t.category, responsible: t.responsible, dueDay: t.dueDay });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => (editingId === 'new' ? TenantApi.createIntegrationTemplate(form) : TenantApi.updateIntegrationTemplate(editingId!, form)));
    if (ok) setEditingId(null);
  };

  const sorted = [...templates].sort((a, b) => a.dueDay - b.dueDay);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Modelo de Integração</h3>
            <p className="text-xs text-slate-500">
              Tarefas dos primeiros dias e meses do colaborador (após o início). Documentos e acessos anteriores ao início ficam na Pasta de Admissão.
              Alterações valem para as próximas contratações; nas já abertas use "Gerenciar itens".
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {editingId ? (
            <form onSubmit={handleSave} className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome da tarefa</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoria</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as IntegrationTemplate['category'] })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                    {CHECKLIST_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Responsável</label>
                  <select value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value as IntegrationTemplate['responsible'] })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                    {CHECKLIST_RESPONSIBLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Prazo (dias após o início)</label>
                  <input type="number" min={0} max={365} value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingId(null)} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium">Cancelar</button>
                <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-60">Salvar</button>
              </div>
            </form>
          ) : canEdit ? (
            <button onClick={() => { setForm(emptyForm); setEditingId('new'); }} className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Nova tarefa
            </button>
          ) : null}

          <div className="space-y-1.5">
            {sorted.map(t => (
              <div key={t.id} className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${t.active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">
                    {t.name} {!t.active && <span className="text-[10px] font-bold text-slate-400 uppercase">(inativo)</span>}
                  </div>
                  <div className="text-[11px] text-slate-500">{t.category} · {t.responsible} · D+{t.dueDay}</div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(t)} aria-label="Editar" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => run(() => TenantApi.updateIntegrationTemplate(t.id, { active: !t.active }))} aria-label={t.active ? 'Desativar' : 'Ativar'} title={t.active ? 'Desativar' : 'Ativar'} className={`p-1.5 rounded-lg hover:bg-slate-100 ${t.active ? 'text-emerald-600' : 'text-slate-400'}`}>
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
