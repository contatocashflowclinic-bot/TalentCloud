import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { ClimateCampaignSummary } from '../../types.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';
import { TenantApi } from '../../services/api.js';
import { DateInputBR } from '../DateInputBR.js';
import { currentQuarter } from '../../utils/retentionUtils.js';

interface Props {
  /** Absent = new survey. */
  campaign?: ClimateCampaignSummary;
  departments: { id: string; name: string }[];
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
export const CampaignFormModal: React.FC<Props> = ({ campaign, departments, today, onSaved, onClose }) => {
  const status = campaign?.status ?? 'draft';
  const [name, setName] = useState(campaign?.name ?? '');
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
        await TenantApi.createCampaign({ name, period, description, audience, departmentIds: [...departmentIds], closesOn });
      } else if (isDraft) {
        await TenantApi.updateCampaign(campaign.id, { name, period, description, audience, departmentIds: [...departmentIds], closesOn, actionPlan });
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
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
