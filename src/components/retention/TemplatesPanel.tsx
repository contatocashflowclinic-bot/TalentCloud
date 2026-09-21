import React, { useState } from 'react';
import { Plus, Eye, Rocket, Copy, Pencil, Trash2, Library, Building2 } from 'lucide-react';
import type { SurveyTemplate } from '../../types.js';
import { TenantApi } from '../../services/api.js';
import { SYSTEM_TEMPLATES, templateQuestionCount } from '../../surveyTemplates.js';
import { ConfirmDialog } from '../ConfirmDialog.js';
import { TemplateFormModal } from './TemplateFormModal.js';
import { TemplatePreviewModal } from './TemplatePreviewModal.js';

interface Props {
  /** Templates of the organization (the system library comes from the code). */
  templates: SurveyTemplate[];
  canEdit: boolean;
  /** Starts a new survey from this template (goes to the Pesquisas tab). */
  onUse: (template: SurveyTemplate) => void;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}

type Modal =
  | { kind: 'preview'; template: SurveyTemplate }
  | { kind: 'form'; template?: SurveyTemplate; copyOf?: SurveyTemplate };

const targetText = (t: SurveyTemplate): string => {
  const roles = t.blocks.filter(b => b.audience === 'roles');
  if (t.blocks.length === 0) return 'Só as perguntas-padrão';
  if (roles.length === 0) return 'Para todos';
  return roles.length === t.blocks.length ? 'Por cargo' : 'Todos + por cargo';
};

const Card: React.FC<{ template: SurveyTemplate } & { children: React.ReactNode }> = ({ template, children }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3 text-xs flex flex-col">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h4 className="font-bold text-slate-900 text-sm">{template.name}</h4>
        {template.focus && <span className="inline-block mt-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold text-[10px]">{template.focus}</span>}
      </div>
    </div>
    <p className="text-slate-600 leading-relaxed flex-1">{template.description}</p>
    <div className="text-[11px] text-slate-500">
      {template.blocks.length} {template.blocks.length === 1 ? 'bloco' : 'blocos'} · {templateQuestionCount(template.blocks)} {templateQuestionCount(template.blocks) === 1 ? 'pergunta' : 'perguntas'} · {targetText(template)}
    </div>
    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">{children}</div>
  </div>
);

/** Aba Templates: a biblioteca do sistema (somente leitura) e os templates da organização (copiados ou criados do zero). */
export const TemplatesPanel: React.FC<Props> = ({ templates, canEdit, onUse, onChanged, onError }) => {
  const [modal, setModal] = useState<Modal | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SurveyTemplate | null>(null);
  const [busy, setBusy] = useState(false);

  const saved = async () => {
    setModal(null);
    await onChanged();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      setBusy(true);
      await TenantApi.deleteSurveyTemplate(pendingDelete.id);
      setPendingDelete(null);
      await onChanged();
    } catch (err: any) {
      setPendingDelete(null);
      onError(err.message || 'Não foi possível excluir o template.');
    } finally {
      setBusy(false);
    }
  };

  const btn = 'px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1';
  const ghost = `${btn} border border-slate-300 text-slate-700 hover:bg-slate-100`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-slate-500 max-w-2xl">
          Templates são conjuntos de <strong>perguntas estratégicas</strong>, agrupadas em blocos. Um bloco pode valer para todos ou só para alguns cargos
          (por exemplo, perguntas de liderança só para gerentes). Toda pesquisa mantém as perguntas-padrão de eNPS e categorias.
        </p>
        {canEdit && (
          <button
            onClick={() => setModal({ kind: 'form' })}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Novo template
          </button>
        )}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2"><Library className="w-4 h-4 text-indigo-600" /> Biblioteca do sistema</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {SYSTEM_TEMPLATES.map(t => (
            <Card key={t.id} template={t}>
              <button onClick={() => setModal({ kind: 'preview', template: t })} className={ghost}><Eye className="w-3 h-3" /> Ver perguntas</button>
              {canEdit && <button onClick={() => onUse(t)} className={`${btn} bg-indigo-600 hover:bg-indigo-700 text-white`}><Rocket className="w-3 h-3" /> Usar em nova pesquisa</button>}
              {canEdit && <button onClick={() => setModal({ kind: 'form', copyOf: t })} className={ghost}><Copy className="w-3 h-3" /> Copiar e editar</button>}
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2"><Building2 className="w-4 h-4 text-indigo-600" /> Da sua organização</h3>
        {templates.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
            Nenhum template próprio ainda.{canEdit ? ' Copie um da biblioteca ou crie um novo para ajustar as perguntas ao jeito da sua empresa.' : ''}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates.map(t => (
              <Card key={t.id} template={t}>
                <button onClick={() => setModal({ kind: 'preview', template: t })} className={ghost}><Eye className="w-3 h-3" /> Ver perguntas</button>
                {canEdit && <button onClick={() => onUse(t)} className={`${btn} bg-indigo-600 hover:bg-indigo-700 text-white`}><Rocket className="w-3 h-3" /> Usar em nova pesquisa</button>}
                {canEdit && <button onClick={() => setModal({ kind: 'form', template: t })} className={ghost}><Pencil className="w-3 h-3" /> Editar</button>}
                {canEdit && (
                  <button onClick={() => setPendingDelete(t)} aria-label={`Excluir template ${t.name}`} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {modal?.kind === 'preview' && <TemplatePreviewModal template={modal.template} onClose={() => setModal(null)} />}
      {modal?.kind === 'form' && <TemplateFormModal template={modal.template} copyOf={modal.copyOf} onSaved={saved} onClose={() => setModal(null)} />}

      {pendingDelete && (
        <ConfirmDialog
          title="Excluir template?"
          message={<>O template <strong>{pendingDelete.name}</strong> será excluído. As pesquisas que já usaram este template não mudam.</>}
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
