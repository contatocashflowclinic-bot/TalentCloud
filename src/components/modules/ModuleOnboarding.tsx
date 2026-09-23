import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, FolderOpen, Settings2, AlertTriangle, ListPlus, Trash2 } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { OnboardingJourney, AdmissionTemplate, IntegrationTemplate } from '../../types.js';
import { useAuth } from '../../context/AuthContext.js';
import { AdmissionModal, admissionSummary } from './AdmissionModal.js';
import { AdmissionCatalogModal } from './AdmissionCatalogModal.js';
import { IntegrationCatalogModal } from './IntegrationCatalogModal.js';
import { ChecklistManageModal } from './ChecklistManageModal.js';
import { formatDateSP } from '../../utils/dateUtils.js';

export const ModuleOnboarding: React.FC = () => {
  const { activeTenant } = useTenant();
  const [onboardings, setOnboardings] = useState<OnboardingJourney[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const canEdit = !!user?.permissions.includes('onboarding:edit');
  const [templates, setTemplates] = useState<AdmissionTemplate[]>([]);
  const [admissionJourneyId, setAdmissionJourneyId] = useState<string | null>(null);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [integrationTemplates, setIntegrationTemplates] = useState<IntegrationTemplate[]>([]);
  const [isIntegrationCatalogOpen, setIsIntegrationCatalogOpen] = useState(false);
  const [checklistJourneyId, setChecklistJourneyId] = useState<string | null>(null);
  const [dataWarnings, setDataWarnings] = useState<string[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      setDataWarnings([]);
      const data = await TenantApi.getOnboardings();
      setOnboardings(data);
      await Promise.all([
        TenantApi.getAdmissionTemplates().then(setTemplates).catch(err => {
          console.error('Onboarding: failed to load admission templates:', err);
          setTemplates([]);
          setDataWarnings(list => [...new Set([...list, 'modelos de admissão'])]);
        }),
        TenantApi.getIntegrationTemplates().then(setIntegrationTemplates).catch(err => {
          console.error('Onboarding: failed to load integration templates:', err);
          setIntegrationTemplates([]);
          setDataWarnings(list => [...new Set([...list, 'modelos de integração'])]);
        })
      ]);
    } catch (err) {
      console.error('Failed to load onboardings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTenant?.id]);

  const reloadIntegrationTemplates = async () => { setIntegrationTemplates(await TenantApi.getIntegrationTemplates()); };

  const handleRemoveItem = async (journey: OnboardingJourney, itemId: string, title: string) => {
    if (!confirm(`Remover "${title}" deste checklist?`)) return;
    try {
      replaceJourney(await TenantApi.removeChecklistItem(journey.id, itemId));
    } catch (err: any) {
      alert(err.message || 'Erro ao remover o item');
    }
  };

  const dueDateOf = (hireDate: string, day: number) => {
    const d = new Date(`${hireDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + day);
    return d.toISOString().split('T')[0];
  };
  const today = new Date().toISOString().split('T')[0];

  const reloadTemplates = async () => { setTemplates(await TenantApi.getAdmissionTemplates()); };

  const replaceJourney = (updated: OnboardingJourney) =>
    setOnboardings(list => list.map(j => (j.id === updated.id ? updated : j)));

  const admissionJourney = onboardings.find(j => j.id === admissionJourneyId);
  const checklistJourney = onboardings.find(j => j.id === checklistJourneyId);

  const handleToggleItem = async (journeyId: string, itemId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    try {
      await TenantApi.updateChecklistItem(journeyId, itemId, nextStatus);
      await loadData();
    } catch (err: any) {
      alert(`Erro ao atualizar checklist: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Jornada de Onboarding & Integração</h1>
          <p className="text-xs text-slate-500">
            Acompanhamento dos primeiros 90 dias dos novos talentos com checklists por fase e padrinhos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setIsIntegrationCatalogOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center gap-2"
        >
          <Settings2 className="w-4 h-4" />
          Modelo de Integração
        </button>
        <button
          onClick={() => setIsCatalogOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors flex items-center gap-2"
        >
          <Settings2 className="w-4 h-4" />
          Modelo de Admissão
        </button>
        </div>
      </div>

      {dataWarnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Dados complementares indisponíveis: {dataWarnings.join(', ')}. As jornadas carregadas continuam visíveis.</span>
        </div>
      )}

      {/* Journeys List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {onboardings.map((journey) => {
          const completedCount = journey.checklists.filter(c => c.status === 'completed').length;
          const progress = Math.round((completedCount / (journey.checklists.length || 1)) * 100);

          return (
            <div key={journey.id} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800">
                    Status: {journey.status === 'in_progress' ? 'Em Andamento' : journey.status === 'completed' ? 'Concluído' : 'Preparando'}
                  </span>
                  <h3 className="font-bold text-slate-900 text-base mt-1">{journey.candidateName}</h3>
                  <div className="text-xs text-slate-500 font-medium">Início: {formatDateSP(journey.hireDate)}</div>
                </div>

                <div className="text-right">
                  <span className="text-lg font-bold font-mono text-indigo-600">{progress}%</span>
                  <div className="text-[10px] text-slate-400">Progresso geral</div>
                </div>
              </div>

              {/* Admission folder summary */}
              {(() => {
                const adm = admissionSummary(journey.admission ?? []);
                const has = (journey.admission ?? []).length > 0;
                return (
                  <button
                    onClick={() => setAdmissionJourneyId(journey.id)}
                    className="w-full p-3 rounded-xl border border-indigo-100 bg-indigo-50/50 hover:bg-indigo-50 flex items-center justify-between gap-3 text-xs text-left transition-colors"
                  >
                    <span className="flex items-center gap-2 font-semibold text-indigo-900">
                      <FolderOpen className="w-4 h-4" /> Pasta de Admissão
                    </span>
                    <span className="flex items-center gap-2">
                      {has ? (
                        <>
                          {adm.overdue > 0 && (
                            <span className="flex items-center gap-1 text-rose-600 font-bold"><AlertTriangle className="w-3 h-3" /> {adm.overdue} atrasado(s)</span>
                          )}
                          <span className={adm.ready ? 'text-emerald-700 font-bold' : 'text-slate-600 font-medium'}>
                            {adm.ready ? 'Pronto para iniciar' : `${adm.requiredApproved}/${adm.requiredTotal} obrigatórios aprovados`}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-500">Sem itens — abrir</span>
                      )}
                    </span>
                  </button>
                );
              })()}

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Checklists */}
              <div className="space-y-2 pt-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-700 uppercase text-[11px] block">
                    Checklist de Integração ({completedCount}/{journey.checklists.length})
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => setChecklistJourneyId(journey.id)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium flex items-center gap-1"
                    >
                      <ListPlus className="w-3 h-3" /> Gerenciar itens
                    </button>
                  )}
                </div>
                {journey.checklists.length === 0 && (
                  <p className="text-slate-400 py-2">Nenhuma tarefa neste checklist. Use "Gerenciar itens" para incluir.</p>
                )}
                <div className="space-y-2">
                  {journey.checklists.map((item) => {
                    const isDone = item.status === 'completed';
                    const due = dueDateOf(journey.hireDate, item.dueDateDay);
                    const late = !isDone && due < today;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleToggleItem(journey.id, item.id, item.status)}
                        className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-colors ${
                          isDone
                            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-300 shrink-0" />
                          )}
                          <span className={isDone ? 'line-through text-slate-500' : 'font-medium'}>
                            {item.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${late ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-white text-slate-600 border-slate-200'}`} title={item.category}>
                            {item.assignedToRole} · {formatDateSP(due)}{late ? ' · atrasado' : ''}
                          </span>
                          {canEdit && item.status === 'pending' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleRemoveItem(journey, item.id, item.title); }}
                              aria-label="Remover item"
                              title="Remover item"
                              className="p-1 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {admissionJourney && (
        <AdmissionModal
          journey={admissionJourney}
          canEdit={canEdit}
          onUpdated={replaceJourney}
          onClose={() => setAdmissionJourneyId(null)}
        />
      )}

      {checklistJourney && (
        <ChecklistManageModal journey={checklistJourney} onUpdated={replaceJourney} onClose={() => setChecklistJourneyId(null)} />
      )}

      {isIntegrationCatalogOpen && (
        <IntegrationCatalogModal templates={integrationTemplates} canEdit={canEdit} onClose={() => setIsIntegrationCatalogOpen(false)} onChanged={reloadIntegrationTemplates} />
      )}

      {isCatalogOpen && (
        <AdmissionCatalogModal templates={templates} canEdit={canEdit} onClose={() => setIsCatalogOpen(false)} onChanged={reloadTemplates} />
      )}
    </div>
  );
};
