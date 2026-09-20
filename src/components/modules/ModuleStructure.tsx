import React, { useState, useEffect } from 'react';
import { Network, Plus, Users, DollarSign, Building, CheckCircle2 } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { Department } from '../../types.js';
import { DepartmentSummaryModal } from './EntitySummaryModals.js';

export const ModuleStructure: React.FC = () => {
  const { activeTenant } = useTenant();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [summaryId, setSummaryId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [headcountTarget, setHeadcountTarget] = useState(10);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await TenantApi.getDepartments();
      setDepartments(data);
    } catch (err) {
      console.error('Failed to load departments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTenant?.id]);

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    try {
      await TenantApi.createDepartment({
        name,
        code: code || name.slice(0, 4).toUpperCase(),
        costCenter: costCenter || 'CC-1000',
        headcountTarget: Number(headcountTarget) || 10
      });
      setName('');
      setCode('');
      setCostCenter('');
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar departamento');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Módulo 4</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Estrutura Organizacional</h1>
          <p className="text-xs text-slate-500">
            Diretorias, áreas de negócio, centros de custo e metas de capacidade de pessoal (Headcount).
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Novo Departamento
        </button>
      </div>

      {/* Departments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {departments.map((dept) => {
          const progress = Math.min(100, Math.round((dept.currentHeadcount / dept.headcountTarget) * 100));
          return (
            <div
              key={dept.id}
              onClick={() => setSummaryId(dept.id)}
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                    {dept.code}
                  </span>
                  <h3 className="font-bold text-slate-900 text-base">{dept.name}</h3>
                </div>
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
                  <Network className="w-4 h-4" />
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Centro de Custo:</span>
                  <span className="font-mono text-slate-800 font-semibold">{dept.costCenter}</span>
                </div>

                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-slate-600 font-medium">
                    <span>Headcount Atual / Meta:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {dept.currentHeadcount} / {dept.headcountTarget}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        progress >= 100 ? 'bg-emerald-500' : progress >= 70 ? 'bg-indigo-600' : 'bg-amber-500'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400 text-right font-mono">{progress}% ocupado</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {summaryId && departments.some(d => d.id === summaryId) && (
        <DepartmentSummaryModal
          department={departments.find(d => d.id === summaryId)!}
          departments={departments}
          onClose={() => setSummaryId(null)}
        />
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-slate-200 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">Criar Novo Departamento</h3>
            <p className="text-xs text-slate-500 mb-4">Adiciona o departamento à estrutura da sua organização.</p>

            <form onSubmit={handleCreateDepartment} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome da Área</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Engenharia de Software"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="ENG"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Centro de Custo</label>
                  <input
                    type="text"
                    value={costCenter}
                    onChange={(e) => setCostCenter(e.target.value)}
                    placeholder="CC-2040"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Meta de Headcount</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={headcountTarget}
                  onChange={(e) => setHeadcountTarget(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  Criar Departamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
