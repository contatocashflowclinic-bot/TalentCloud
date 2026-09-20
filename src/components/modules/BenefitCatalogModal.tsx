import React, { useState } from 'react';
import { X, Plus, Pencil, Power, Sparkles } from 'lucide-react';
import { TenantApi } from '../../services/api.js';
import { BENEFIT_CATEGORIES, BenefitCatalogItem, JobPosition } from '../../types.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';

const LEVELS: JobPosition['level'][] = ['Júnior', 'Pleno', 'Sênior', 'Especialista', 'Coordenação', 'Gerência', 'Diretoria'];

const SUGGESTIONS: Pick<BenefitCatalogItem, 'name' | 'category' | 'defaultLevels'>[] = [
  { name: 'Plano de Saúde', category: 'Saúde', defaultLevels: [...LEVELS] },
  { name: 'Plano Odontológico', category: 'Saúde', defaultLevels: [] },
  { name: 'Seguro de Vida', category: 'Saúde', defaultLevels: [...LEVELS] },
  { name: 'Vale Refeição/Alimentação', category: 'Alimentação', defaultLevels: [...LEVELS] },
  { name: 'Auxílio Home Office', category: 'Trabalho', defaultLevels: [] },
  { name: 'Gympass', category: 'Bem-estar', defaultLevels: [] },
  { name: 'Participação nos Lucros (PLR)', category: 'Financeiro', defaultLevels: ['Coordenação', 'Gerência', 'Diretoria'] }
];

interface Props {
  benefits: BenefitCatalogItem[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}

const emptyForm = { name: '', category: 'Outros' as BenefitCatalogItem['category'], description: '', defaultLevels: [] as JobPosition['level'][] };

export const BenefitCatalogModal: React.FC<Props> = ({ benefits, onClose, onChanged }) => {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const backdrop = useBackdropClose(onClose);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      setBusy(true);
      await fn();
      await onChanged();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar benefício');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (b: BenefitCatalogItem) => {
    setEditingId(b.id);
    setForm({ name: b.name, category: b.category, description: b.description, defaultLevels: b.defaultLevels });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(() => (editingId === 'new' ? TenantApi.createBenefit(form) : TenantApi.updateBenefit(editingId!, form)));
    setEditingId(null);
  };

  const toggleLevel = (level: JobPosition['level']) =>
    setForm(f => ({
      ...f,
      defaultLevels: f.defaultLevels.includes(level) ? f.defaultLevels.filter(l => l !== level) : [...f.defaultLevels, level]
    }));

  const addSuggestions = () => run(async () => {
    for (const s of SUGGESTIONS) await TenantApi.createBenefit({ ...s, description: '' });
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Catálogo de Benefícios</h3>
            <p className="text-xs text-slate-500">
              Benefícios da organização usados nas propostas. Os marcados com um nível de cargo já vêm selecionados nas propostas desse nível.
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
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex.: Vale Refeição R$ 1.200/mês"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoria</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as BenefitCatalogItem['category'] })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {BENEFIT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição (opcional)</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Já vem marcado nas propostas dos níveis</label>
                <div className="flex flex-wrap gap-1.5">
                  {LEVELS.map(level => (
                    <button
                      type="button"
                      key={level}
                      onClick={() => toggleLevel(level)}
                      className={`px-2.5 py-1 rounded-full border font-medium transition-colors ${
                        form.defaultLevels.includes(level)
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditingId(null)} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium">
                  Cancelar
                </button>
                <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-60">
                  Salvar
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setForm(emptyForm); setEditingId('new'); }}
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Novo benefício
              </button>
              {benefits.length === 0 && (
                <button
                  onClick={addSuggestions}
                  disabled={busy}
                  className="px-3 py-2 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Adicionar benefícios sugeridos
                </button>
              )}
            </div>
          )}

          {benefits.length === 0 ? (
            <div className="py-8 text-center text-slate-400">Nenhum benefício cadastrado ainda.</div>
          ) : (
            BENEFIT_CATEGORIES.filter(cat => benefits.some(b => b.category === cat)).map(cat => (
              <div key={cat}>
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">{cat}</div>
                <div className="space-y-1.5">
                  {benefits.filter(b => b.category === cat).map(b => (
                    <div
                      key={b.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                        b.active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800">
                          {b.name} {!b.active && <span className="text-[10px] font-bold text-slate-400 uppercase">(inativo)</span>}
                        </div>
                        {b.description && <div className="text-slate-500 truncate">{b.description}</div>}
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {b.defaultLevels.length === 0
                            ? 'Não vem marcado por padrão'
                            : b.defaultLevels.length === LEVELS.length
                              ? 'Padrão em todos os níveis'
                              : `Padrão: ${b.defaultLevels.join(', ')}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startEdit(b)} aria-label="Editar" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => run(() => TenantApi.updateBenefit(b.id, { active: !b.active }))}
                          aria-label={b.active ? 'Desativar' : 'Ativar'}
                          title={b.active ? 'Desativar' : 'Ativar'}
                          className={`p-1.5 rounded-lg hover:bg-slate-100 ${b.active ? 'text-emerald-600' : 'text-slate-400'}`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
