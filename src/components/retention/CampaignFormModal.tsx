import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Link2Off } from 'lucide-react';
import type { ClimateCampaignSummary, PositionOption, SurveyBlock, SurveyTemplate } from '../../types.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';
import { TenantApi } from '../../services/api.js';
import { DateInputBR } from '../DateInputBR.js';
import { currentQuarter } from '../../utils/retentionUtils.js';
import { BlocksEditor, blocksFromTemplate } from './BlocksEditor.js';

interface Props {
  /** Absent = new survey. */
  campaign?: ClimateCampaignSummary;
  departments: { id: string; name: string }[];
  /** Every template (the system library and the organization's own): the ones a new survey can start from. */
  templates: SurveyTemplate[];
  /** Registered Cargos (module Cargos), with the people linked to each: the only way to aim a block at cargos. */
  positions: PositionOption[];
  /** Active people with no registered Cargo (they do not see blocks aimed at cargos). */
  unlinkedMembers: number;
  /** Template a new survey starts from (coming from the Templates tab). */
  initialTemplate?: SurveyTemplate;
  /** Today (AAAA-MM-DD, São Paulo): suggests the period of a new survey. */
  today: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
}

const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500';

/**
 * Form of a survey (campaign). A draft is fully editable; once published only the closing date and the action plan can
 * change, and once closed only the action plan.
 */
export const CampaignFormModal: React.FC<Props> = ({ campaign, departments, templates, positions, unlinkedMembers, initialTemplate, today, onSaved, onClose }) => {
  const status = campaign?.status ?? 'draft';
  const [name, setName] = useState(campaign?.name ?? (initialTemplate && initialTemplate.blocks.length > 0 ? `Pesquisa — ${initialTemplate.name}` : ''));
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? '');
  const [templateName, setTemplateName] = useState(campaign?.templateName ?? initialTemplate?.name ?? '');
  const [blocks, setBlocks] = useState<SurveyBlock[]>(() => campaign?.blocks ?? (initialTemplate ? blocksFromTemplate(initialTemplate.blocks, positions) : []));
  const [period, setPeriod] = useState(campaign?.period ?? currentQuarter(today));
  const [description, setDescription] = useState(campaign?.description ?? '');
  const [audience, setAudience] = useState<'all' | 'departments'>(campaign?.audience ?? 'all');
  const [departmentIds, setDepartmentIds] = useState<Set<string>>(new Set(campaign?.departmentIds ?? []));
  const [closesOn, setClosesOn] = useState(campaign?.closesOn ?? '');
  const [actionPlan, setActionPlan] = useState(campaign?.actionPlan ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const backdrop = useBackdropClose(onClose);

  const isDraft = status === 'draft';
  const canEditClosing = status !== 'closed';

  /** Choosing a template fills the strategic blocks (with the cargos that match) and, if empty, the name. */
  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find(t => t.id === id);
    setTemplateName(template?.name ?? '');
    setBlocks(template ? blocksFromTemplate(template.blocks, positions) : []);
    if (template && template.blocks.length > 0 && !name.trim()) setName(`Pesquisa — ${template.name}`);
  };

  const toggleDepartment = (id: string) =>
    setDepartmentIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setBusy(true);
      setError('');
      if (!campaign) {
        await TenantApi.createCampaign({ name, period, description, audience, departmentIds: [...departmentIds], closesOn, blocks, templateName });
      } else if (isDraft) {
        await TenantApi.updateCampaign(campaign.id, { name, period, description, audience, departmentIds: [...departmentIds], closesOn, actionPlan, blocks, templateName });
      } else {
        await TenantApi.updateCampaign(campaign.id, { ...(canEditClosing ? { closesOn } : {}), actionPlan });
      }
      await onSaved();
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar a pesquisa.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[94vh] flex flex-col border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">{campaign ? 'Editar pesquisa' : 'Nova pesquisa de clima'}</span>
            <h3 className="text-base font-bold text-slate-900">{campaign ? campaign.name : 'Pesquisa interna, anônima'}</h3>
            <p className="text-xs text-slate-500">
              {isDraft
                ? 'A pesquisa usa o modelo padrão: recomendação (eNPS), cinco categorias e um comentário opcional.'
                : status === 'open'
                  ? 'Depois de publicada, só a data de encerramento e o plano de ação podem mudar.'
                  : 'Pesquisa encerrada: registre aqui o plano de ação com base no resultado.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col min-h-0">
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5 text-xs overflow-y-auto">
            {isDraft && !campaign && (
              <div className="sm:col-span-2 p-3 rounded-xl bg-indigo-50 border border-indigo-100 space-y-1.5">
                <label className="block font-semibold text-indigo-900" htmlFor="cmp-template">Começar de um template (opcional)</label>
                <select id="cmp-template" value={templateId} onChange={(e) => chooseTemplate(e.target.value)} className={inputCls}>
                  <option value="">Sem template — só as perguntas-padrão</option>
                  <optgroup label="Biblioteca do sistema">
                    {templates.filter(t => t.system).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                  {templates.some(t => !t.system) && (
                    <optgroup label="Da sua organização">
                      {templates.filter(t => !t.system).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                  )}
                </select>
                <p className="text-[11px] text-indigo-800">As perguntas do template entram na pesquisa e podem ser ajustadas abaixo, antes de publicar.</p>
              </div>
            )}

            {isDraft && (
              <>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1" htmlFor="cmp-name">Nome da pesquisa <span className="text-rose-500">*</span></label>
                  <input id="cmp-name" type="text" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pesquisa de Clima 3º trimestre" className={inputCls} />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1" htmlFor="cmp-period">Período <span className="text-rose-500">*</span></label>
                  <input id="cmp-period" type="text" required maxLength={40} value={period} onChange={(e) => setPeriod(e.target.value)} className={inputCls} />
                  <p className="text-[11px] text-slate-400 mt-1">Ex.: 2026-Q3. Aparece na evolução do eNPS.</p>
                </div>
              </>
            )}

            {canEditClosing && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1" htmlFor="cmp-closes">Encerra em</label>
                <DateInputBR id="cmp-closes" value={closesOn} onChange={setClosesOn} className={`${inputCls} pl-9`} />
                <p className="text-[11px] text-slate-400 mt-1">Opcional. Sem data, a pesquisa fica aberta até você encerrá-la.</p>
              </div>
            )}

            {isDraft && (
              <>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1" htmlFor="cmp-desc">Mensagem para quem vai responder</label>
                  <textarea id="cmp-desc" rows={3} maxLength={500} lang="pt-BR" spellCheck value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Leva 2 minutos. Sua resposta é anônima e ajuda a melhorar o dia a dia do time." className={inputCls} />
                </div>

                <fieldset className="sm:col-span-2">
                  <legend className="block font-semibold text-slate-700 mb-1.5">Quem responde</legend>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="cmp-audience" checked={audience === 'all'} onChange={() => setAudience('all')} /> Toda a organização
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="cmp-audience" checked={audience === 'departments'} onChange={() => setAudience('departments')} /> Departamentos específicos
                    </label>
                  </div>
                  {audience === 'departments' && (
                    <div className="mt-2 p-3 rounded-xl border border-slate-200 bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
                      {departments.length === 0 && <p className="text-slate-500">Nenhum departamento cadastrado.</p>}
                      {departments.map(d => (
                        <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={departmentIds.has(d.id)} onChange={() => toggleDepartment(d.id)} /> {d.name}
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>

                <div className="sm:col-span-2 space-y-2">
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Perguntas estratégicas por cargo{templateName ? ` — ${templateName}` : ''}</h4>
                  {unlinkedMembers > 0 && blocks.some(b => b.audience === 'roles') && (
                    <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2 leading-relaxed">
                      <Link2Off className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{unlinkedMembers} {unlinkedMembers === 1 ? 'pessoa ativa ainda não tem' : 'pessoas ativas ainda não têm'} cargo cadastrado e não {unlinkedMembers === 1 ? 'verá' : 'verão'} os blocos por cargo. Vincule cada pessoa a um cargo em <strong>Usuários e Permissões</strong>.</span>
                    </p>
                  )}
                  <BlocksEditor blocks={blocks} onChange={setBlocks} mode="campaign" positions={positions} departments={departments} />
                </div>
              </>
            )}

            {(status === 'closed' || (campaign && !isDraft)) && (
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1" htmlFor="cmp-plan">Plano de ação</label>
                <textarea id="cmp-plan" rows={4} maxLength={2000} lang="pt-BR" spellCheck value={actionPlan} onChange={(e) => setActionPlan(e.target.value)} placeholder="O que será feito a partir deste resultado, por quem e até quando." className={inputCls} />
              </div>
            )}
          </div>

          {error && <div className="mx-5 mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}

          <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs">Cancelar</button>
            <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs disabled:opacity-60">
              {busy ? 'Salvando…' : campaign ? 'Salvar alterações' : 'Criar rascunho'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
