import React, { useState, useEffect } from 'react';
import { Briefcase, Plus, Tag, DollarSign, Award, CheckCircle2 } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { JobPosition, Department } from '../../types.js';

export const ModulePositions: React.FC = () => {
  const { activeTenant } = useTenant();
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [level, setLevel] = useState<JobPosition['level']>('Pleno');
  const [description, setDescription] = useState('');
  const [techReqs, setTechReqs] = useState('');
  const [behavReqs, setBehavReqs] = useState('');
  const [minSalary, setMinSalary] = useState(9000);
  const [maxSalary, setMaxSalary] = useState(14000);
  const [careerTrack, setCareerTrack] = useState('Y_TECNICO');

  const loadData = async () => {
    try {
      setLoading(true);
      const [posData, depData] = await Promise.all([
        TenantApi.getPositions(),
        TenantApi.getDepartments()
      ]);
      setPositions(posData);
      setDepartments(depData);
      if (depData.length > 0) setDepartmentId(depData[0].id);
    } catch (err) {
      console.error('Failed to load positions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTenant?.id]);

  const handleCreatePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    try {
      await TenantApi.createPosition({
        title,
        departmentId,
        level,
        description,
        technicalRequirements: techReqs.split(',').map(s => s.trim()).filter(Boolean),
        behavioralCompetencies: behavReqs.split(',').map(s => s.trim()).filter(Boolean),
        minSalary: Number(minSalary),
        maxSalary: Number(maxSalary),
        careerTrack: careerTrack as any
      });
      setTitle('');
      setDescription('');
      setTechReqs('');
      setBehavReqs('');
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar cargo');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Módulo 5</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-mono text-slate-500">Partição: {activeTenant?.dbConfig?.dbName}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Catálogo de Cargos & Competências</h1>
          <p className="text-xs text-slate-500">
            Estrutura de cargos, senioridades, faixas salariais balizadas e competências técnicas e comportamentais.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Cadastrar Cargo
        </button>
      </div>

      {/* Positions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {positions.map((pos) => {
          const dept = departments.find(d => d.id === pos.departmentId);
          return (
            <div key={pos.id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800">
                    {pos.level}
                  </span>
                  <span className="text-[11px] font-medium text-slate-400">
                    {dept?.name || 'Geral'}
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-base">{pos.title}</h3>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {pos.description}
                </p>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                    Requisitos Técnicos
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {pos.technicalRequirements.map((req, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px]">
                        {req}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                  <span className="text-slate-500 text-[11px]">Faixa Salarial:</span>
                  <span className="font-mono font-bold text-slate-800">
                    R$ {(pos.minSalary / 1000).toFixed(0)}k - R$ {(pos.maxSalary / 1000).toFixed(0)}k
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">Cadastrar Novo Cargo</h3>
            <p className="text-xs text-slate-500 mb-4">Adiciona o cargo no catálogo isolado da organização.</p>

            <form onSubmit={handleCreatePosition} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Título do Cargo</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Engenheiro de Software Fullstack"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Departamento</label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Senioridade</label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value as JobPosition['level'])}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="Júnior">Júnior</option>
                    <option value="Pleno">Pleno</option>
                    <option value="Sênior">Sênior</option>
                    <option value="Especialista">Especialista / Lead</option>
                    <option value="Coordenação">Coordenação</option>
                    <option value="Gerência">Gerência</option>
                    <option value="Diretoria">Diretoria</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição das Responsabilidades</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Responsável por desenvolver microserviços e arquitetura escalável..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Requisitos Técnicos (separados por vírgula)</label>
                <input
                  type="text"
                  value={techReqs}
                  onChange={(e) => setTechReqs(e.target.value)}
                  placeholder="TypeScript, Node.js, React, PostgreSQL, Docker"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Salário Mínimo (R$)</label>
                  <input
                    type="number"
                    value={minSalary}
                    onChange={(e) => setMinSalary(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Salário Máximo (R$)</label>
                  <input
                    type="number"
                    value={maxSalary}
                    onChange={(e) => setMaxSalary(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
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
                  Salvar Cargo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
