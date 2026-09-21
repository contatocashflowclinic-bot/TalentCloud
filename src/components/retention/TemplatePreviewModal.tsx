import React from 'react';
import { X, Users } from 'lucide-react';
import type { SurveyBlock, SurveyTemplate } from '../../types.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';
import { describeHints, hasHints, templateQuestionCount } from '../../surveyTemplates.js';
import { TYPE_LABEL } from './BlocksEditor.js';

interface Props {
  template: Pick<SurveyTemplate, 'name' | 'description' | 'focus' | 'blocks'> & { system?: boolean };
  onClose: () => void;
}

const audienceText = (block: SurveyBlock) =>
  block.audience === 'all'
    ? 'Todos respondem'
    : hasHints(block.targetHints)
      ? `Só alguns cargos — sugestão pelo cadastro de Cargos (${describeHints(block.targetHints)})`
      : 'Só alguns cargos — você escolhe entre os cargos cadastrados';

/** Read-only view of the questions of a template (or of a survey), as they will be asked. */
export const TemplatePreviewModal: React.FC<Props> = ({ template, onClose }) => {
  const backdrop = useBackdropClose(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">{template.system ? 'Template do sistema' : 'Template da organização'}</span>
            <h3 className="text-base font-bold text-slate-900">{template.name}</h3>
            <p className="text-xs text-slate-500">{template.description}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 text-xs overflow-y-auto min-h-0">
          <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-900 leading-relaxed">
            Toda pesquisa começa com as perguntas-padrão: <strong>recomendação (eNPS)</strong>, <strong>cinco categorias</strong> (Liderança, Cultura, Crescimento, Remuneração, Ambiente) e um <strong>comentário</strong> opcional.
            {template.blocks.length > 0
              ? <> Este template acrescenta {templateQuestionCount(template.blocks)} {templateQuestionCount(template.blocks) === 1 ? 'pergunta estratégica' : 'perguntas estratégicas'}:</>
              : <> Este template não acrescenta perguntas estratégicas.</>}
          </div>

          {template.blocks.map(block => (
            <div key={block.id} className="rounded-xl border border-slate-200 p-4 space-y-2.5">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{block.title}</h4>
                {block.description && <p className="text-slate-500">{block.description}</p>}
                <p className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px]"><Users className="w-3 h-3" /> {audienceText(block)}</p>
              </div>
              <ol className="space-y-2">
                {block.questions.map((q, i) => (
                  <li key={q.id} className="text-slate-700">
                    <span className="font-semibold">{i + 1}. {q.text}</span>
                    <span className="block text-[11px] text-slate-400">
                      {TYPE_LABEL[q.type]}{q.required ? ' · obrigatória' : ' · opcional'}
                      {q.type === 'choice' && q.options ? ` · ${q.options.join(' / ')}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs">Fechar</button>
        </div>
      </div>
    </div>
  );
};
