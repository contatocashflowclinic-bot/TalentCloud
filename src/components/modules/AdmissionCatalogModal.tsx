import React, { useState } from 'react';
import { X, Plus, Pencil, Power } from 'lucide-react';
import { TenantApi } from '../../services/api.js';
import { ADMISSION_CATEGORIES, ADMISSION_RESPONSIBLES, AdmissionTemplate } from '../../types.js';

interface Props {
  templates: AdmissionTemplate[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

const emptyForm = {
  name: '',
  category: 'Documentos pessoais' as AdmissionTemplate['category'],
  description: '',
  required: true,
  requiresDocument: true,
  responsible: 'Candidato' as AdmissionTemplate['responsible'],
  dueDaysBeforeStart: 7,
  contractTypes: ['CLT', 'PJ'] as AdmissionTemplate['contractTypes']
};

export const AdmissionCatalogModal: React.FC<Props> = ({ templates, canEdit, onClose, onChanged }) => {
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

  const startEdit = (t: AdmissionTemplate) => {
    setEditingId(t.id);
    setForm({
      name: t.name, category: t.category, description: t.description, required: t.required,
      requiresDocument: t.requiresDocument, responsible: t.responsible, dueDaysBeforeStart: t.dueDaysBeforeStart, contractTypes: t.contractTypes
    });
  };

  const toggleContract = (type: 'CLT' | 'PJ') =>
    setForm(f => ({ ...f, contractTypes: f.contractTypes.includes(type) ? f.contractTypes.filter(c => c !== type) : [...f.contractTypes, type] }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.contractTypes.length === 0) return alert('Selecione ao menos um tipo de contrato.');
    const ok = await run(() => (editingId === 'new' ? TenantApi.createAdmissionTemplate(form) : TenantApi.updateAdmissionTemplate(editingId!, form)));
    if (ok) setEditingId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Modelo de Admissão</h3>
            <p className="text-xs text-slate-500">
              Documentos e etapas exigidos na contratação. Cada nova contratação recebe uma cópia destes itens conforme o tipo de contrato (CLT ou PJ).
              Alterações valem para as próximas contratações; nas já abertas use "Atualizar com o modelo".
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {editingId ? (
            <form onSubmit={handleSave} className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nome</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoria</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as AdmissionTemplate['category'] })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                    {ADMISSION_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Responsável</label>
                  <select value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value as AdmissionTemplate['responsible'] })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                    {ADMISSION_RESPONSIBLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Prazo (dias antes do início)</label>
                  <input type="number" min={0} max={90} value={form.dueDaysBeforeStart} onChange={(e) => setForm({ ...form, dueDaysBeforeStart: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white" />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição (opcional)</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white" />
              </div>
              <div className="flex flex-wrap gap-4 text-slate-700">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} /> Obrigatório</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.requiresDocument} onChange={(e) => setForm({ ...form, requiresDocument: e.target.checked })} /> Exige documento (arquivo)</label>
                <span className="text-slate-400">|</span>
                {(['CLT', 'PJ'] as const).map(t => (
                  <label key={t} className="flex items-center gap-1.5"><input type="checkbox" checked={form.contractTypes.includes(t)} onChange={() => toggleContract(t)} /> {t}</label>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingId(null)} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium">Cancelar</button>
                <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-60">Salvar</button>
              </div>
            </form>
          ) : canEdit ? (
            <button onClick={() => { setForm(emptyForm); setEditingId('new'); }} className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Novo item
            </button>
          ) : null}

          {ADMISSION_CATEGORIES.filter(cat => templates.some(t => t.category === cat)).map(cat => (
            <div key={cat}>
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">{cat}</div>
              <div className="space-y-1.5">
                {templates.filter(t => t.category === cat).map(t => (
                  <div key={t.id} className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${t.active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800">
                        {t.name} {!t.active && <span className="text-[10px] font-bold text-slate-400 uppercase">(inativo)</span>}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {t.contractTypes.join(' / ')} · {t.required ? 'Obrigatório' : 'Opcional'} · {t.requiresDocument ? 'Exige arquivo' : 'Etapa interna'} · {t.responsible} · {t.dueDaysBeforeStart}d antes do início
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startEdit(t)} aria-label="Editar" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => run(() => TenantApi.updateAdmissionTemplate(t.id, { active: !t.active }))} aria-label={t.active ? 'Desativar' : 'Ativar'} title={t.active ? 'Desativar' : 'Ativar'} className={`p-1.5 rounded-lg hover:bg-slate-100 ${t.active ? 'text-emerald-600' : 'text-slate-400'}`}>
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
