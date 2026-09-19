import React, { useState, useEffect } from 'react';
import { TrendingUp, Plus, Target, CheckCircle2, Calendar, MessageSquare, Clock } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { CollaboratorDevelopment } from '../../types.js';
import { formatDateSP } from '../../utils/dateUtils.js';

export const ModuleDevelopment: React.FC = () => {
  const { activeTenant } = useTenant();
  const [records, setRecords] = useState<CollaboratorDevelopment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecordId, setSelectedRecordId] = useState<string>('');

  // Add goal state
  const [goalTitle, setGoalTitle] = useState('');
  const [goalCompetency, setGoalCompetency] = useState('');
  const [isAddingGoal, setIsAddingGoal] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await TenantApi.getDevelopmentRecords();
      setRecords(data);
      if (data.length > 0 && !selectedRecordId) {
        setSelectedRecordId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load development records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTenant?.id]);

  const activeRecord = records.find(r => r.id === selectedRecordId) || records[0];

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle || !activeRecord) return;
    try {
      await TenantApi.createGoal(
        activeRecord.id,
        goalTitle,
        goalCompetency || 'Técnica',
        new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]
      );
      setGoalTitle('');
      setGoalCompetency('');
      setIsAddingGoal(false);
      await loadData();
    } catch (err: any) {
      alert(`Erro ao adicionar meta: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Módulo 13</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-mono text-slate-500">Partição: {activeTenant?.dbConfig?.dbName}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Desenvolvimento Contínuo & PDI</h1>
          <p className="text-xs text-slate-500">
            Planos de Desenvolvimento Individual (PDI), metas trimestrais e histórico de 1:1s com lideranças.
          </p>
        </div>

        {/* Switch Collaborator */}
        {records.length > 0 && (
          <select
            value={selectedRecordId}
            onChange={(e) => setSelectedRecordId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800 shadow-xs"
          >
            {records.map(r => (
              <option key={r.id} value={r.id}>{r.collaboratorName}</option>
            ))}
          </select>
        )}
      </div>

      {activeRecord ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Col 1 & 2: Goals & Competencies */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Target className="w-4 h-4 text-indigo-600" />
                    Metas do PDI ({activeRecord.collaboratorName})
                  </h3>
                  <p className="text-xs text-slate-500">Objetivos alinhados com o cargo e trilha de carreira.</p>
                </div>
                <button
                  onClick={() => setIsAddingGoal(!isAddingGoal)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Meta
                </button>
              </div>

              {isAddingGoal && (
                <form onSubmit={handleAddGoal} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                  <input
                    type="text"
                    required
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    placeholder="Título da meta (Ex: Certificação Cloud Professional)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <input
                      type="text"
                      value={goalCompetency}
                      onChange={(e) => setGoalCompetency(e.target.value)}
                      placeholder="Competência (Ex: Arquitetura, Liderança)"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white"
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold"
                    >
                      Salvar Meta
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-3">
                {activeRecord.goals.map((goal) => (
                  <div key={goal.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <div className="flex items-start justify-between">
                      <span className="font-bold text-slate-900 text-sm">{goal.title}</span>
                      <span className="font-mono text-xs font-bold text-indigo-600">
                        {goal.progressPercentage}%
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                      <span>Competência: <strong className="text-slate-700">{goal.competency}</strong></span>
                      <span>•</span>
                      <span title="Prazo calibrado em São Paulo">Prazo: {formatDateSP(goal.deadline)}</span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full"
                        style={{ width: `${goal.progressPercentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Col 3: 1:1 History */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                Histórico de 1:1s
              </h3>
              <div className="space-y-3 pt-1">
                {activeRecord.oneOnOnes.map((meeting) => (
                  <div key={meeting.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-mono">{formatDateSP(meeting.date)}</span>
                      <span className="text-slate-600 font-semibold">Alinhamento 1:1</span>
                    </div>
                    <p className="text-slate-700 italic">"{meeting.keyTakeaways}"</p>
                    <div className="text-[10px] text-indigo-700 font-medium pt-1 border-t border-slate-100">
                      Ações: {meeting.actionItems.join('; ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      ) : (
        <div className="p-8 text-center text-slate-400">Nenhum registro de desenvolvimento cadastrado.</div>
      )}
    </div>
  );
};
