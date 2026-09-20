import React, { useState, useEffect } from 'react';
import { Rocket, CheckCircle2, Circle, Clock, User, Award, Shield } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { OnboardingJourney } from '../../types.js';
import { formatDateSP } from '../../utils/dateUtils.js';

export const ModuleOnboarding: React.FC = () => {
  const { activeTenant } = useTenant();
  const [onboardings, setOnboardings] = useState<OnboardingJourney[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await TenantApi.getOnboardings();
      setOnboardings(data);
    } catch (err) {
      console.error('Failed to load onboardings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTenant?.id]);

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
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Módulo 12</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Jornada de Onboarding & Integração</h1>
          <p className="text-xs text-slate-500">
            Acompanhamento dos primeiros 90 dias dos novos talentos com checklists por fase e padrinhos.
          </p>
        </div>
      </div>

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

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Checklists */}
              <div className="space-y-2 pt-2 text-xs">
                <span className="font-bold text-slate-700 uppercase text-[11px] block">
                  Checklist de Integração ({completedCount}/{journey.checklists.length})
                </span>
                <div className="space-y-2">
                  {journey.checklists.map((item) => {
                    const isDone = item.status === 'completed';
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
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                          {item.category} (D+{item.dueDateDay})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
