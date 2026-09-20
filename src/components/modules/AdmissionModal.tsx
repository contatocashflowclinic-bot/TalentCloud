import React, { useRef, useState } from 'react';
import { X, Upload, Download, Check, XCircle, RotateCcw, Plus, History, AlertTriangle, FileText, ClipboardList, Trash2, ListChecks } from 'lucide-react';
import { TenantApi } from '../../services/api.js';
import {
  ADMISSION_CATEGORIES, ADMISSION_RESPONSIBLES, AdmissionItem, AdmissionStatus, AdmissionTemplate, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, OnboardingJourney
} from '../../types.js';
import { formatDateSP } from '../../utils/dateUtils.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';

const STATUS: Record<AdmissionStatus, { label: string; cls: string }> = {
  pending: { label: 'Pendente', cls: 'bg-slate-100 text-slate-700' },
  submitted: { label: 'Em análise', cls: 'bg-blue-100 text-blue-800' },
  approved: { label: 'Aprovado', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Reprovado', cls: 'bg-rose-100 text-rose-800' }
};

const todayISO = () => new Date().toISOString().split('T')[0];
const formatSize = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export const admissionSummary = (items: AdmissionItem[]) => {
  const required = items.filter(i => i.required);
  const approved = required.filter(i => i.status === 'approved').length;
  const overdue = items.filter(i => i.status !== 'approved' && i.dueDate < todayISO()).length;
  return { requiredTotal: required.length, requiredApproved: approved, overdue, ready: required.length > 0 && approved === required.length };
};

interface Props {
  journey: OnboardingJourney;
  canEdit: boolean;
  onUpdated: (journey: OnboardingJourney) => void;
  onClose: () => void;
}

const emptyExtra = { title: '', category: 'Etapas internas' as AdmissionItem['category'], responsible: 'RH' as AdmissionItem['responsible'], required: true, requiresDocument: false };

export const AdmissionModal: React.FC<Props> = ({ journey, canEdit, onUpdated, onClose }) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; note: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [extra, setExtra] = useState(emptyExtra);
  // Escolha dos itens do modelo que entram nesta contratação (varia conforme o cargo)
  const [picker, setPicker] = useState<{ templates: AdmissionTemplate[]; selected: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | null>(null);
  const backdrop = useBackdropClose(onClose);

  const items = journey.admission ?? [];
  const summary = admissionSummary(items);
  const today = todayISO();

  const run = async (id: string, fn: () => Promise<OnboardingJourney | void>) => {
    try {
      setBusyId(id);
      const updated = await fn();
      if (updated) onUpdated(updated);
    } catch (err: any) {
      alert(err.message || 'Erro na operação');
    } finally {
      setBusyId(null);
    }
  };

  const pickFile = (itemId: string) => {
    uploadTarget.current = itemId;
    fileInput.current?.click();
  };

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const itemId = uploadTarget.current;
    e.target.value = '';
    if (!file || !itemId) return;
    if (file.size > MAX_UPLOAD_BYTES) return alert(`Arquivo maior que o limite de ${MAX_UPLOAD_MB} MB.`);
    void run(itemId, () => TenantApi.uploadAdmissionFile(journey.id, itemId, file));
  };

  const submitReject = async () => {
    if (!rejecting) return;
    const { id, note } = rejecting;
    if (!note.trim()) return alert('Informe o motivo da reprovação.');
    await run(id, () => TenantApi.reviewAdmissionItem(journey.id, id, 'reject', note));
    setRejecting(null);
  };

  const openPicker = async () => {
    try {
      setBusyId('picker');
      const templates = await TenantApi.getAvailableAdmissionTemplates(journey.id);
      setPicker({ templates, selected: templates.filter(t => t.required).map(t => t.id) });
    } catch (err: any) {
      alert(err.message || 'Erro ao carregar o modelo');
    } finally {
      setBusyId(null);
    }
  };

  const togglePick = (id: string) =>
    setPicker(p => p && ({ ...p, selected: p.selected.includes(id) ? p.selected.filter(x => x !== id) : [...p.selected, id] }));

  const confirmPicker = async () => {
    if (!picker || picker.selected.length === 0) return alert('Selecione ao menos um item.');
    await run('apply', () => TenantApi.applyAdmissionTemplate(journey.id, picker.selected));
    setPicker(null);
  };

  const removeItem = (item: AdmissionItem) => {
    if (!confirm(`Remover "${item.title}" desta contratação?`)) return;
    void run(item.id, () => TenantApi.removeAdmissionItem(journey.id, item.id));
  };

  const submitExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    await run('extra', () => TenantApi.addAdmissionItem(journey.id, extra));
    setExtra(emptyExtra);
    setAdding(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto border border-slate-200 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={onFileChosen} />

        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Pasta de Admissão</span>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">{journey.candidateName}</h3>
            <div className="text-xs text-slate-500">{journey.jobTitle} · Início {formatDateSP(journey.hireDate)}</div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-xs">
          {items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full font-bold ${summary.ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {summary.ready ? 'Pronto para iniciar' : `Obrigatórios aprovados: ${summary.requiredApproved}/${summary.requiredTotal}`}
              </span>
              {summary.overdue > 0 && (
                <span className="px-2.5 py-1 rounded-full font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {summary.overdue} em atraso
                </span>
              )}
            </div>
          )}

          {picker && (
            <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-3">
              <div>
                <div className="font-bold text-slate-900 text-sm">Quais itens do modelo levar para esta contratação?</div>
                <p className="text-slate-500">Marque só o que se aplica ao cargo de {journey.candidateName}. Os obrigatórios já vêm marcados.</p>
              </div>
              {picker.templates.length === 0 ? (
                <p className="text-slate-500 py-2">Todos os itens do modelo aplicáveis já estão nesta contratação.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setPicker({ ...picker, selected: picker.templates.map(t => t.id) })} className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-medium">Marcar todos</button>
                    <button onClick={() => setPicker({ ...picker, selected: picker.templates.filter(t => t.required).map(t => t.id) })} className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-medium">Só obrigatórios</button>
                    <button onClick={() => setPicker({ ...picker, selected: [] })} className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-medium">Limpar</button>
                  </div>
                  {ADMISSION_CATEGORIES.filter(cat => picker.templates.some(t => t.category === cat)).map(cat => (
                    <div key={cat}>
                      <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">{cat}</div>
                      <div className="space-y-1">
                        {picker.templates.filter(t => t.category === cat).map(t => (
                          <label key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200 cursor-pointer hover:bg-slate-50">
                            <input type="checkbox" checked={picker.selected.includes(t.id)} onChange={() => togglePick(t.id)} />
                            <span className="font-medium text-slate-800">{t.name}</span>
                            <span className="text-[10px] font-bold uppercase text-slate-400">{t.required ? 'obrigatório' : 'opcional'}</span>
                            <span className="ml-auto text-slate-400">{t.requiresDocument ? 'arquivo' : 'etapa'} · {t.responsible}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setPicker(null)} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium">Cancelar</button>
                {picker.templates.length > 0 && (
                  <button onClick={confirmPicker} disabled={busyId === 'apply' || picker.selected.length === 0} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-60">
                    Incluir {picker.selected.length} {picker.selected.length === 1 ? 'item' : 'itens'}
                  </button>
                )}
              </div>
            </div>
          )}

          {items.length === 0 && !picker && (
            <div className="py-8 text-center space-y-3">
              <ClipboardList className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-slate-500">Esta contratação ainda não tem itens de admissão.</p>
              {canEdit && (
                <button
                  onClick={openPicker}
                  disabled={busyId === 'picker'}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-60"
                >
                  Escolher itens do modelo de admissão
                </button>
              )}
            </div>
          )}

          {ADMISSION_CATEGORIES.filter(cat => items.some(i => i.category === cat)).map(cat => (
            <div key={cat}>
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">{cat}</div>
              <div className="space-y-2">
                {items.filter(i => i.category === cat).map(item => {
                  const late = item.status !== 'approved' && item.dueDate < today;
                  const busy = busyId === item.id;
                  return (
                    <div key={item.id} className={`p-3 rounded-xl border ${item.status === 'approved' ? 'bg-emerald-50/50 border-emerald-200' : item.status === 'rejected' ? 'bg-rose-50/50 border-rose-200' : 'bg-white border-slate-200'}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800">
                            {item.title}{' '}
                            <span className="text-[10px] font-bold uppercase text-slate-400">{item.required ? 'obrigatório' : 'opcional'}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Responsável: {item.responsible} ·{' '}
                            <span className={late ? 'text-rose-600 font-bold' : ''}>Prazo {formatDateSP(item.dueDate)}{late ? ' (atrasado)' : ''}</span>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS[item.status].cls}`}>
                          {item.requiresDocument ? STATUS[item.status].label : item.status === 'approved' ? 'Concluído' : 'Pendente'}
                        </span>
                      </div>

                      {item.file && (
                        <div className="mt-2 flex items-center gap-2 text-slate-600">
                          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{item.file.name}</span>
                          <span className="text-slate-400 shrink-0">{formatSize(item.file.size)} · {item.file.uploadedBy}</span>
                          <button
                            onClick={() => run(item.id, () => TenantApi.downloadAdmissionFile(journey.id, item.id, item.file!.name))}
                            className="ml-auto shrink-0 px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1 font-medium"
                          >
                            <Download className="w-3 h-3" /> Baixar
                          </button>
                        </div>
                      )}

                      {item.status === 'rejected' && item.reviewNote && (
                        <div className="mt-2 p-2 rounded-lg bg-rose-100/70 text-rose-800">Motivo: {item.reviewNote}</div>
                      )}

                      {rejecting?.id === item.id && (
                        <div className="mt-2 flex gap-2">
                          <input
                            autoFocus
                            value={rejecting.note}
                            onChange={(e) => setRejecting({ id: item.id, note: e.target.value })}
                            placeholder="Motivo da reprovação (ex.: imagem ilegível)"
                            className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                          />
                          <button onClick={submitReject} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold">Confirmar</button>
                          <button onClick={() => setRejecting(null)} className="px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100">Cancelar</button>
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {canEdit && item.requiresDocument && (
                          <button
                            disabled={busy}
                            onClick={() => pickFile(item.id)}
                            className="px-2.5 py-1 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold flex items-center gap-1 disabled:opacity-60"
                          >
                            <Upload className="w-3 h-3" /> {item.file ? 'Substituir arquivo' : 'Enviar documento'}
                          </button>
                        )}
                        {canEdit && item.status === 'submitted' && (
                          <>
                            <button disabled={busy} onClick={() => run(item.id, () => TenantApi.reviewAdmissionItem(journey.id, item.id, 'approve'))} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold flex items-center gap-1 disabled:opacity-60">
                              <Check className="w-3 h-3" /> Aprovar
                            </button>
                            <button disabled={busy} onClick={() => setRejecting({ id: item.id, note: '' })} className="px-2.5 py-1 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold flex items-center gap-1 disabled:opacity-60">
                              <XCircle className="w-3 h-3" /> Reprovar
                            </button>
                          </>
                        )}
                        {canEdit && !item.requiresDocument && item.status !== 'approved' && (
                          <button disabled={busy} onClick={() => run(item.id, () => TenantApi.reviewAdmissionItem(journey.id, item.id, 'approve'))} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold flex items-center gap-1 disabled:opacity-60">
                            <Check className="w-3 h-3" /> Marcar como concluído
                          </button>
                        )}
                        {canEdit && (item.status === 'approved' || item.status === 'rejected') && (
                          <button disabled={busy} onClick={() => run(item.id, () => TenantApi.reviewAdmissionItem(journey.id, item.id, 'reopen'))} className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium flex items-center gap-1 disabled:opacity-60">
                            <RotateCcw className="w-3 h-3" /> Reabrir
                          </button>
                        )}
                        {canEdit && item.status === 'pending' && !item.file && (
                          <button disabled={busy} onClick={() => removeItem(item)} className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 font-medium flex items-center gap-1 disabled:opacity-60">
                            <Trash2 className="w-3 h-3" /> Remover
                          </button>
                        )}
                        {item.history.length > 0 && (
                          <button onClick={() => setHistoryOpen(historyOpen === item.id ? null : item.id)} className="ml-auto text-slate-400 hover:text-slate-600 flex items-center gap-1">
                            <History className="w-3 h-3" /> Histórico
                          </button>
                        )}
                      </div>

                      {historyOpen === item.id && (
                        <ul className="mt-2 pt-2 border-t border-slate-100 space-y-0.5 text-[11px] text-slate-500">
                          {[...item.history].reverse().map((h, idx) => (
                            <li key={idx}>{new Date(h.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — {h.by}: {h.action}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {canEdit && items.length > 0 && (
            adding ? (
              <form onSubmit={submitExtra} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <input required value={extra.title} onChange={(e) => setExtra({ ...extra, title: e.target.value })} placeholder="Nome do item (ex.: Declaração de imposto de renda)" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select value={extra.category} onChange={(e) => setExtra({ ...extra, category: e.target.value as AdmissionItem['category'] })} className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                    {ADMISSION_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <select value={extra.responsible} onChange={(e) => setExtra({ ...extra, responsible: e.target.value as AdmissionItem['responsible'] })} className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                    {ADMISSION_RESPONSIBLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="flex flex-wrap gap-4 text-slate-700">
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={extra.required} onChange={(e) => setExtra({ ...extra, required: e.target.checked })} /> Obrigatório</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={extra.requiresDocument} onChange={(e) => setExtra({ ...extra, requiresDocument: e.target.checked })} /> Exige documento (arquivo)</label>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAdding(false)} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium">Cancelar</button>
                  <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">Adicionar</button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setAdding(true)} className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-slate-700 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Adicionar item a esta contratação
                </button>
                <button onClick={openPicker} disabled={busyId === 'picker'} className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-medium text-slate-600 flex items-center gap-1.5 disabled:opacity-60">
                  <ListChecks className="w-3.5 h-3.5" /> Incluir itens do modelo
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
