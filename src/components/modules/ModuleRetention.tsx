import React, { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard, AlertTriangle, BarChart3, ClipboardCheck, Library, X } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { TenantApi } from '../../services/api.js';
import type { RetentionData, SurveyTemplate } from '../../types.js';
import { SYSTEM_TEMPLATES } from '../../surveyTemplates.js';
import { RetentionOverview } from '../retention/RetentionOverview.js';
import { AlertsPanel } from '../retention/AlertsPanel.js';
import { CampaignsPanel } from '../retention/CampaignsPanel.js';
import { TemplatesPanel } from '../retention/TemplatesPanel.js';
import { SurveyAnswerPanel } from '../retention/SurveyAnswerPanel.js';

type Tab = 'overview' | 'alerts' | 'surveys' | 'templates' | 'answer';

interface Props {
  /** Opens the PDI of a collaborator in the Development module. */
  onOpenDevelopment?: (recordId: string) => void;
}

/**
 * Retenção de Talentos & Clima. Quem gerencia (retention:view/edit) vê a visão geral, os alertas de turnover e as
 * pesquisas de clima; qualquer colaborador com "Pesquisa de Clima" (climate:view) vê só a aba Responder.
 */
export const ModuleRetention: React.FC<Props> = ({ onOpenDevelopment }) => {
  const { activeTenant } = useTenant();
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const canView = permissions.includes('retention:view');
  const canEdit = permissions.includes('retention:edit');
  const canAnswer = permissions.includes('climate:view');
  const canOpenPdi = !!onOpenDevelopment && permissions.includes('development:view');

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    ...(canView ? [
      { id: 'overview' as const, label: 'Visão geral', icon: LayoutDashboard },
      { id: 'alerts' as const, label: 'Alertas de risco', icon: AlertTriangle },
      { id: 'surveys' as const, label: 'Pesquisas', icon: BarChart3 },
      { id: 'templates' as const, label: 'Templates', icon: Library }
    ] : []),
    ...(canAnswer ? [{ id: 'answer' as const, label: 'Responder pesquisa', icon: ClipboardCheck }] : [])
  ];

  const [tab, setTab] = useState<Tab>(canView ? 'overview' : 'answer');
  const activeTab = tabs.some(t => t.id === tab) ? tab : tabs[0]?.id;

  const [data, setData] = useState<RetentionData | null>(null);
  const [loading, setLoading] = useState(canView);
  const [feedback, setFeedback] = useState('');
  /** Template chosen in the Templates tab: the Pesquisas tab opens a new survey already using it. */
  const [startTemplate, setStartTemplate] = useState<SurveyTemplate | undefined>(undefined);

  /** `silent` refreshes after a change without blanking the screen. */
  const loadData = useCallback(async (silent = false) => {
    if (!canView) return;
    try {
      if (!silent) setLoading(true);
      setData(await TenantApi.getRetentionData());
    } catch (err: any) {
      console.error('Failed to load retention data:', err);
      setFeedback(err.message || 'Não foi possível carregar os dados de Retenção.');
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void loadData();
  }, [activeTenant?.id, loadData]);

  const reload = () => loadData(true);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Retenção de Talentos & Clima</h1>
        <p className="text-xs text-slate-500">
          Pesquisas de clima e eNPS aplicados dentro do sistema e termômetro de risco precoce de turnover.
        </p>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap flex items-center gap-2 border-b-2 -mb-px transition-colors ${
                activeTab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {feedback && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start justify-between gap-3" role="alert">
          <span>{feedback}</span>
          <button onClick={() => setFeedback('')} aria-label="Fechar aviso" className="text-rose-400 hover:text-rose-700"><X className="w-4 h-4" /></button>
        </div>
      )}

      {activeTab === 'answer' ? (
        <SurveyAnswerPanel tenantId={activeTenant?.id} />
      ) : loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400 text-xs animate-pulse">Carregando…</div>
      ) : !data ? null : activeTab === 'overview' ? (
        <RetentionOverview metrics={data.metrics} />
      ) : activeTab === 'alerts' ? (
        <AlertsPanel
          alerts={data.turnoverAlerts}
          scope={data.alertScope}
          lookups={data.lookups}
          developmentLinks={data.developmentLinks}
          canEdit={canEdit}
          canOpenPdi={canOpenPdi}
          onOpenPdi={(id) => onOpenDevelopment?.(id)}
          onChanged={reload}
          onError={setFeedback}
        />
      ) : activeTab === 'templates' ? (
        <TemplatesPanel
          templates={data.surveyTemplates}
          canEdit={canEdit}
          onUse={(template) => { setStartTemplate(template); setTab('surveys'); }}
          onChanged={reload}
          onError={setFeedback}
        />
      ) : (
        <CampaignsPanel
          campaigns={data.campaigns}
          departments={data.lookups.departments}
          templates={[...SYSTEM_TEMPLATES, ...data.surveyTemplates]}
          positions={data.positions}
          unlinkedMembers={data.unlinkedMembers}
          startWithTemplate={startTemplate}
          onStartConsumed={() => setStartTemplate(undefined)}
          canEdit={canEdit}
          onChanged={reload}
          onError={setFeedback}
        />
      )}
    </div>
  );
};
