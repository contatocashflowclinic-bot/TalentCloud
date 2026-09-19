import React, { useState, useEffect } from 'react';
import { HeartHandshake, AlertTriangle, Smile, Plus, ShieldCheck, CheckCircle2, TrendingDown } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { ClimateSurveyResponse, TurnoverRiskAlert } from '../../types.js';

export const ModuleRetention: React.FC = () => {
  const { activeTenant } = useTenant();
  const [surveys, setSurveys] = useState<ClimateSurveyResponse[]>([]);
  const [alerts, setAlerts] = useState<TurnoverRiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);

  // Form state
  const [collabName, setCollabName] = useState('');
  const [department, setDepartment] = useState('');
  const [riskLevel, setRiskLevel] = useState<'Baixo' | 'Médio' | 'Alto'>('Médio');
  const [warningSignals, setWarningSignals] = useState('');
  const [suggestedActions, setSuggestedActions] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await TenantApi.getRetentionData();
      setSurveys(data.climateSurveys);
      setAlerts(data.turnoverAlerts);
    } catch (err) {
      console.error('Failed to load retention data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTenant?.id]);

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collabName) return;
    try {
      await TenantApi.createTurnoverAlert({
        collaboratorName: collabName,
        department,
        riskLevel,
        earlyWarningSignals: warningSignals.split(',').map(s => s.trim()).filter(Boolean),
        suggestedActions: suggestedActions.split(',').map(s => s.trim()).filter(Boolean)
      });
      setCollabName('');
      setWarningSignals('');
      setSuggestedActions('');
      setIsAlertModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(`Erro ao registrar alerta: ${err.message}`);
    }
  };

  const avgEnps = surveys.length > 0 
    ? Math.round(surveys.reduce((acc, s) => acc + s.enpsScore, 0) / surveys.length) 
    : 85;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Módulo 14</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-mono text-slate-500">Partição: {activeTenant?.dbConfig?.dbName}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Retenção de Talentos & Clima</h1>
          <p className="text-xs text-slate-500">
            Monitoramento contínuo de eNPS, pesquisas de pulso e termômetro de risco precoce de turnover.
          </p>
        </div>

        <button
          onClick={() => setIsAlertModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Registrar Sinal de Risco
        </button>
      </div>

      {/* Top Cards: eNPS & Turnover Risk */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-900 to-slate-900 text-white shadow-md space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
            eNPS Médio da Organização
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold font-mono text-white">+{avgEnps}</span>
            <span className="text-xs text-emerald-300 font-semibold bg-emerald-500/20 px-2 py-0.5 rounded">
              Zona de Excelência
            </span>
          </div>
          <p className="text-[11px] text-slate-300">
            Baseado nas pesquisas de clima e satisfação no banco deste tenant.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Alertas de Risco Ativos
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold font-mono text-amber-600">
              {alerts.length}
            </span>
            <span className="text-xs text-slate-500">colaboradores sob observação</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Identificação antecipada para ações de retenção da liderança.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Taxa de Retenção (90 dias)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold font-mono text-emerald-600">96.8%</span>
            <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold">Alta</span>
          </div>
          <p className="text-[11px] text-slate-500">
            Aderência e permanência após o ciclo de onboarding.
          </p>
        </div>
      </div>

      {/* Turnover Risk Alerts Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Termômetro de Risco & Sinais de Desengajamento
          </h3>
          <span className="text-xs text-slate-400">Sigiloso para Gestores e RH</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {alerts.map((alert) => (
            <div key={alert.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{alert.collaboratorName}</h4>
                  <div className="text-[11px] text-slate-500">{alert.department}</div>
                </div>
                <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                  alert.riskLevel === 'Alto' ? 'bg-rose-100 text-rose-800' :
                  alert.riskLevel === 'Médio' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  Risco {alert.riskLevel}
                </span>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-600 block mb-1">Sinais de Alerta:</span>
                <ul className="space-y-0.5 text-slate-600 list-disc list-inside text-[11px]">
                  {alert.earlyWarningSignals.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-slate-200">
                <span className="text-[11px] font-semibold text-indigo-700 block mb-1">Ações Recomendadas:</span>
                <ul className="space-y-0.5 text-indigo-900 text-[11px]">
                  {alert.suggestedActions.map((a, idx) => (
                    <li key={idx} className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-indigo-600 shrink-0" /> {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {isAlertModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-slate-200 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">Registrar Sinal de Risco de Turnover</h3>
            <p className="text-xs text-slate-500 mb-4">Salvo com acesso restrito à sua organização.</p>

            <form onSubmit={handleCreateAlert} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome do Colaborador</label>
                <input
                  type="text"
                  required
                  value={collabName}
                  onChange={(e) => setCollabName(e.target.value)}
                  placeholder="Ex: Rafael Souza"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Departamento</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Engenharia"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nível de Risco</label>
                  <select
                    value={riskLevel}
                    onChange={(e: any) => setRiskLevel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="Baixo">Baixo</option>
                    <option value="Médio">Médio</option>
                    <option value="Alto">Alto</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sinais Observados (separados por vírgula)</label>
                <input
                  type="text"
                  value={warningSignals}
                  onChange={(e) => setWarningSignals(e.target.value)}
                  placeholder="Menos participativo em reuniões, queda de produtividade"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ações Preventivas Sugeridas</label>
                <input
                  type="text"
                  value={suggestedActions}
                  onChange={(e) => setSuggestedActions(e.target.value)}
                  placeholder="1:1 de alinhamento com gestor, revisão de escopo"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAlertModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  Salvar Alerta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
