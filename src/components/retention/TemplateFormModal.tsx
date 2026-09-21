import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { SurveyBlock, SurveyTemplate } from '../../types.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';
import { TenantApi } from '../../services/api.js';
import { BlocksEditor, localId } from './BlocksEditor.js';

interface Props {
  /** The template to edit; absent = a new one. */
  template?: SurveyTemplate;
  /** A copy of a system template (or of another one): pre-fills the form and records where it came from. */
  copyOf?: SurveyTemplate;
  onSaved: () => Promise<void>;
  onClose: () => void;
}

const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500';

/** Fresh ids for a copy, so the copy shares nothing with what it came from. */
const cloneBlocks = (blocks: SurveyBlock[]): SurveyBlock[] =>
  blocks.map(b => ({ ...b, id: localId('b'), questions: b.questions.map(q => ({ ...q, id: localId('q') })) }));

/** Create, copy or edit a template of the organization. Templates aim blocks at cargos through keywords. */
export const TemplateFormModal: React.FC<Props> = ({ template, copyOf, onSaved, onClose }) => {
  const source = template ?? copyOf;
  const [name, setName] = useState(template ? template.name : copyOf ? `${copyOf.name} (cópia)` : '');
  const [description, setDescription] = useState(source?.description ?? '');
  const [focus, setFocus] = useState(source?.focus ?? '');
  const [blocks, setBlocks] = useState<SurveyBlock[]>(() => (template ? template.blocks : copyOf ? cloneBlocks(copyOf.blocks) : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const backdrop = useBackdropClose(onClose);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setBusy(true);
      setError('');
      const payload = { name, description, focus, blocks };
      if (template) await TenantApi.updateSurveyTemplate(template.id, payload);
      else await TenantApi.createSurveyTemplate({ ...payload, ...(copyOf ? { basedOn: copyOf.system ? copyOf.id : copyOf.basedOn } : {}) });
      await onSaved();
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar o template.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[94vh] flex flex-col border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">{template ? 'Editar template' : copyOf ? 'Copiar template' : 'Novo template'}</span>
            <h3 className="text-base font-bold text-slate-900">{template ? template.name : copyOf ? `Baseado em ${copyOf.name}` : 'Perguntas estratégicas próprias'}</h3>
            <p className="text-xs text-slate-500">Um template é um conjunto de blocos de perguntas. Toda pesquisa mantém as perguntas-padrão (eNPS, categorias e comentário).</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={submit} className="flex flex-col min-h-0">
          <div className="p-5 space-y-4 text-xs overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1" htmlFor="tpl-name">Nome do template <span className="text-rose-500">*</span></label>
                <input id="tpl-name" type="text" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pesquisa para gerentes de loja" className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1" htmlFor="tpl-desc">Para que serve</label>
                <textarea id="tpl-desc" rows={2} maxLength={300} lang="pt-BR" spellCheck value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Entender a rotina e os desafios de quem gerencia uma loja." className={inputCls} />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1" htmlFor="tpl-focus">Área</label>
                <input id="tpl-focus" type="text" maxLength={60} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Ex.: Comercial" className={inputCls} />
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-2">Perguntas estratégicas</h4>
              <BlocksEditor blocks={blocks} onChange={setBlocks} mode="template" />
            </div>
          </div>

          {error && <div className="mx-5 mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}

          <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs">Cancelar</button>
            <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs disabled:opacity-60">
              {busy ? 'Salvando…' : template ? 'Salvar alterações' : 'Salvar template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
