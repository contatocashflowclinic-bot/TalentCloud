import React, { useState, useEffect } from 'react';
import { Layers, Plus, Clock, MapPin, Share2, Globe, ExternalLink, ArrowRight, GitBranch, Pencil, AlertTriangle } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { JobOpening, JobPosition, Department, OrganizationalDNA } from '../../types.js';
import { JobSocialShareModal } from '../careers/JobSocialShareModal.js';
import { useAuth } from '../../context/AuthContext.js';
import { OpeningSummaryModal } from './EntitySummaryModals.js';
import { OpeningEditModal } from './EntityEditModals.js';

export const ModuleOpenings: React.FC<{
  onNavigateToProcess?: (jobId: string) => void;
  onNavigateToCareersPortal?: (jobId?: string) => void;
}> = ({ onNavigateToProcess, onNavigateToCareersPortal }) => {
  const { activeTenant } = useTenant();
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [dna, setDna] = useState<OrganizationalDNA | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { user } = useAuth();
  const canCreate = !!user?.permissions.includes('openings:create');
  const canEdit = !!user?.permissions.includes('openings:edit');

  // Social Share Modal state
  const [shareJob, setShareJob] = useState<JobOpening | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [positionId, setPositionId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [workModel, setWorkModel] = useState<'Remoto' | 'Híbrido' | 'Presencial'>('Híbrido');
  const [location, setLocation] = useState('São Paulo / Remoto');
  const [slaDays, setSlaDays] = useState(30);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [ops, pos, deps, orgDna] = await Promise.all([
        TenantApi.getOpenings(),
        TenantApi.getPositions(),
        TenantApi.getDepartments(),
        TenantApi.getDNA()
      ]);
      setOpenings(ops);
      setPositions(pos);
      setDepartments(deps);
      setDna(orgDna);
      if (pos.length > 0) setPositionId(pos[0].id);
      if (deps.length > 0) setDepartmentId(deps[0].id);
    } catch (err) {
      console.error('Failed to load openings:', err);
      setLoadError('Não foi possível carregar as vagas e seus dados de apoio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTenant?.id]);

  const handleCreateOpening = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    try {
      await TenantApi.createOpening({
        title,
        positionId,
        departmentId,
        workModel,
        location,
        slaDays: Number(slaDays),
        openingsCount: 1
      });
      setTitle('');
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao abrir vaga');
    }
  };

  const handleOpenShareModal = (job: JobOpening) => {
    setShareJob(job);
    setIsShareModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Gestão de Vagas & Requisições</h1>
          <p className="text-xs text-slate-500">
            Abertura, SLAs de contratação, divulgação social de cargos e portal público de carreiras.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {onNavigateToCareersPortal && (
            <button
              onClick={() => onNavigateToCareersPortal()}
              className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2"
              title="Abrir a página pública de carreiras da organização para candidatos externos"
            >
              <Globe className="w-4 h-4 text-indigo-400" />
              Página Pública de Vagas
            </button>
          )}

          {canCreate && <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Abrir Nova Vaga
          </button>}
        </div>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{loadError}</span>
          <button onClick={loadData} className="font-semibold underline">Tentar novamente</button>
        </div>
      )}

      {/* Expanded Grid of Job Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5 sm:gap-6">
        {openings.map((job) => {
          const dept = departments.find(d => d.id === job.departmentId);
          const pos = positions.find(p => p.id === job.positionId);
          const statusLabel = job.status === 'open'
            ? 'Aberta / Ativa'
            : job.status === 'filled'
              ? 'Preenchida'
              : job.status === 'cancelled'
                ? 'Cancelada'
                : job.status === 'draft'
                  ? 'Rascunho'
                  : 'Em andamento';

          return (
            <div
              key={job.id}
              onClick={() => setSummaryId(job.id)}
              className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs hover:shadow-lg hover:border-indigo-300 transition-all duration-200 flex flex-col justify-between space-y-5 group relative cursor-pointer"
            >
              <div className="space-y-3.5">
                {/* Status, SLA and Dept Header */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                      job.status === 'open' || job.status === 'filled'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}>
                      {job.status === 'open' && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      )}
                      {statusLabel}
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-slate-500 bg-slate-50 border border-slate-200/80 px-2 py-0.5 rounded-lg">
                    <Clock className="w-3 h-3 text-slate-400" />
                    SLA {job.slaDays}d
                  </span>
                </div>

                <div className="text-xs font-medium text-slate-500">
                  Posições preenchidas: <span className="font-mono font-bold text-slate-700">{job.filledCount}/{job.openingsCount}</span>
                </div>

                {/* Job Title & Department */}
                <div>
                  <h3 className="font-bold text-slate-900 text-base sm:text-lg group-hover:text-indigo-600 transition-colors tracking-tight line-clamp-1">
                    {job.title}
                  </h3>
                  <div className="text-xs text-indigo-600 font-medium mt-0.5 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{dept?.name || 'Área Geral'}</span>
                  </div>
                </div>

                {/* Work model and location */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-50 text-slate-600 border border-slate-200/80 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {job.workModel} • {job.location}
                  </span>
                </div>

                {/* Process stages progress preview */}
                <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="flex items-center gap-1.5 font-medium">
                      <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
                      Funil de Seleção:
                    </span>
                    <span className="font-semibold text-indigo-700 font-mono">
                      {job.stages.length} etapas
                    </span>
                  </div>

                  {/* Visual Stage Dots Bar */}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    {job.stages.map((stg, sIdx) => (
                      <div
                        key={stg.id || sIdx}
                        className="h-2 flex-1 rounded-full bg-indigo-200/80 hover:bg-indigo-500 transition-colors"
                        title={`Etapa ${sIdx + 1}: ${stg.name}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div onClick={(e) => e.stopPropagation()} className="space-y-2.5 pt-3 border-t border-slate-100 text-xs cursor-default">
                {/* Social Share & Public Link Row */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleOpenShareModal(job)}
                    className="py-2 px-3 rounded-xl bg-indigo-50/90 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200/80 transition-all flex items-center justify-center gap-1.5 hover:shadow-2xs active:scale-98"
                    title="Gerar card com arte pronta para Instagram, WhatsApp ou LinkedIn"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Divulgar
                  </button>

                  {onNavigateToCareersPortal && (
                    <button
                      onClick={() => onNavigateToCareersPortal(job.id)}
                      className="py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 transition-all flex items-center justify-center gap-1.5 hover:shadow-2xs active:scale-98"
                      title="Ver como os candidatos externos visualizam esta vaga"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                      Página Pública
                    </button>
                  )}
                </div>

                {onNavigateToProcess && (
                  <button
                    onClick={() => onNavigateToProcess(job.id)}
                    className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-2 group-hover:bg-indigo-600 active:scale-99"
                  >
                    <span>Ver Pipeline de Candidatos</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditId(job.id); }}
                    className="ml-auto text-[11px] font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" /> Editar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {summaryId && openings.some(j => j.id === summaryId) && (() => {
        const job = openings.find(j => j.id === summaryId)!;
        return (
          <OpeningSummaryModal
            job={job}
            department={departments.find(d => d.id === job.departmentId)}
            position={positions.find(p => p.id === job.positionId)}
            onOpenPipeline={onNavigateToProcess ? () => onNavigateToProcess(job.id) : undefined}
            onOpenPortal={onNavigateToCareersPortal ? () => onNavigateToCareersPortal(job.id) : undefined}
            onShare={() => { setSummaryId(null); handleOpenShareModal(job); }}
            onEdit={canEdit ? () => { setEditId(job.id); setSummaryId(null); } : undefined}
            onClose={() => setSummaryId(null)}
          />
        );
      })()}

      {editId && openings.some(j => j.id === editId) && (
        <OpeningEditModal
          job={openings.find(j => j.id === editId)!}
          departments={departments}
          positions={positions}
          onSaved={loadData}
          onClose={() => setEditId(null)}
        />
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-slate-200 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">Abrir Nova Vaga</h3>
            <p className="text-xs text-slate-500 mb-4">Cadastra a vaga na sua organização.</p>

            <form onSubmit={handleCreateOpening} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Título da Vaga</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Engenheiro de Dados Sênior"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cargo Base</label>
                  <select
                    value={positionId}
                    onChange={(e) => setPositionId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {positions.map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>

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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Modelo de Trabalho</label>
                  <select
                    value={workModel}
                    onChange={(e: any) => setWorkModel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="Remoto">Remoto</option>
                    <option value="Híbrido">Híbrido</option>
                    <option value="Presencial">Presencial</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">SLA de Contratação (dias)</label>
                  <input
                    type="number"
                    value={slaDays}
                    onChange={(e) => setSlaDays(Number(e.target.value))}
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
                  Publicar Vaga
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Social Share Modal */}
      <JobSocialShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        job={shareJob}
        position={shareJob ? positions.find(p => p.id === shareJob.positionId) : null}
        department={shareJob ? departments.find(d => d.id === shareJob.departmentId) : null}
        tenant={activeTenant}
        dna={dna}
      />
    </div>
  );
};
