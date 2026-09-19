import React, { useState, useEffect } from 'react';
import {
  Building2,
  Briefcase,
  Share2,
  MapPin,
  Clock,
  Sparkles,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  Layers,
  Heart,
  Award,
  Globe,
  CheckCircle2,
  Users,
  Compass,
  ArrowLeft,
  ExternalLink,
  MessageSquare,
  Linkedin
} from 'lucide-react';
import { PublicApi, PublicCareers } from '../../services/api.js';
import { JobOpening, JobPosition, Department, PublicTenant } from '../../types.js';
import { JobSocialShareModal } from './JobSocialShareModal.js';
import { JobApplicationModal } from './JobApplicationModal.js';

interface CareersPortalPageProps {
  /** Organization slug (public link) */
  tenantSlug: string;
  onBackToAdmin?: () => void;
  initialJobId?: string;
}

export const CareersPortalPage: React.FC<CareersPortalPageProps> = ({
  tenantSlug,
  onBackToAdmin,
  initialJobId
}) => {
  const [activeTenant, setActiveTenant] = useState<PublicTenant | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [dna, setDna] = useState<PublicCareers['dna']>(null);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedWorkModel, setSelectedWorkModel] = useState<string>('all');

  // Modal states
  const [shareModalJob, setShareModalJob] = useState<JobOpening | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [applicationModalJob, setApplicationModalJob] = useState<JobOpening | null>(null);
  const [isApplicationModalOpen, setIsApplicationModalOpen] = useState(false);
  const [selectedJobDetail, setSelectedJobDetail] = useState<JobOpening | null>(null);

  const loadPortalData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await PublicApi.getCareers(tenantSlug);
      const ops = data.openings;
      setActiveTenant(data.tenant);
      setOpenings(ops);
      setPositions(data.positions);
      setDepartments(data.departments);
      setDna(data.dna);

      // If an initialJobId was passed in URL, pre-open details or share
      if (initialJobId) {
        const found = ops.find(o => o.id === initialJobId);
        if (found) setSelectedJobDetail(found);
      }
    } catch (err: any) {
      console.error('Failed to load careers portal data:', err);
      setLoadError(err?.message || 'Portal de vagas indisponível.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortalData();
  }, [tenantSlug]);

  // Filtered jobs
  const filteredOpenings = openings.filter(job => {
    // Only show active/open jobs
    if (job.status !== 'open' && job.status !== 'in_progress') return false;

    const matchesSearch =
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.location.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDept = selectedDept === 'all' || job.departmentId === selectedDept;
    const matchesModel = selectedWorkModel === 'all' || job.workModel === selectedWorkModel;

    return matchesSearch && matchesDept && matchesModel;
  });

  const getPositionForJob = (job: JobOpening) => {
    return positions.find(p => p.id === job.positionId);
  };

  const getDepartmentForJob = (job: JobOpening) => {
    return departments.find(d => d.id === job.departmentId);
  };

  const handleOpenShare = (job: JobOpening | null) => {
    setShareModalJob(job);
    setIsShareModalOpen(true);
  };

  const handleOpenApply = (job: JobOpening) => {
    setApplicationModalJob(job);
    setIsApplicationModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased">
      
      {/* Top Banner Navigation: Admin Return & Tenant Switcher for preview */}
      <div className="bg-slate-950 text-slate-300 px-4 sm:px-8 py-2.5 text-xs flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          {onBackToAdmin && (
            <button
              onClick={onBackToAdmin}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao Painel Administrativo
            </button>
          )}
          <span className="text-slate-500 hidden sm:inline">|</span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span>Página Pública de Divulgação de Vagas</span>
          </span>
        </div>

        {/* Share */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenShare(null)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors ml-1"
            title="Compartilhar página geral de carreiras"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Divulgar Portal</span>
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 text-white py-14 px-4 sm:px-8 border-b border-slate-800 relative overflow-hidden">
        {/* Subtle decorative circles */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>

        <div className="max-w-6xl mx-auto space-y-6 relative z-10">
          
          {/* Org Identification Badge */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-indigo-950/50">
                {(activeTenant?.tradingName || activeTenant?.name || 'TC').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    {activeTenant?.tradingName || activeTenant?.name}
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Empresa Verificada
                  </span>
                </div>
                <div className="text-xs text-indigo-300 font-medium mt-0.5">
                  Portal Oficial de Carreiras & Banco de Talentos
                </div>
              </div>
            </div>

            {/* Quick Share Button */}
            <button
              onClick={() => handleOpenShare(null)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/20 shadow-md backdrop-blur-xs transition-all hover:scale-[1.02]"
            >
              <Share2 className="w-4 h-4 text-indigo-300" />
              Compartilhar no WhatsApp / Instagram / LinkedIn
            </button>
          </div>

          {/* Mission & Archetype Pitch */}
          <div className="max-w-3xl space-y-3">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100 leading-snug">
              Construa sua jornada com quem valoriza talento, autonomia e impacto real.
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              {dna?.mission || 'Buscamos profissionais apaixonados por inovação para integrar um ambiente transparente, dinâmico e focado em excelência.'}
            </p>
          </div>

          {/* Value Pillars Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
              <div className="text-indigo-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Arquétipo Cultural
              </div>
              <div className="text-sm font-semibold text-white mt-1">
                {dna?.archetype || 'Inovador & Ágil'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
              <div className="text-emerald-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Avaliação Assistida por IA
              </div>
              <div className="text-sm font-semibold text-white mt-1">
                Feedback Transparente & Decisão Humana
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
              <div className="text-blue-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Oportunidades Abertas
              </div>
              <div className="text-sm font-semibold text-white mt-1">
                {openings.filter(o => o.status === 'open').length} Vagas Disponíveis
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-10 space-y-8 flex-1">
        
        {/* Culture & Pillars Section */}
        {dna && dna.pillars && dna.pillars.length > 0 && (
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Compass className="w-4 h-4 text-indigo-600" />
                  Nossos Pilares Culturais & DNA
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  O que valorizamos no dia a dia e como avaliamos a aderência mútua no nosso processo seletivo.
                </p>
              </div>
              <span className="hidden sm:inline-block px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">
                Fit Cultural Explicável
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              {dna.pillars.slice(0, 3).map((pillar) => (
                <div key={pillar.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="font-bold text-slate-800 text-sm">{pillar.name}</div>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                    {pillar.description}
                  </p>
                  {pillar.expectedBehaviors && pillar.expectedBehaviors.length > 0 && (
                    <div className="text-[11px] text-indigo-600 font-medium pt-1">
                      ✓ {pillar.expectedBehaviors[0]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Vagas e Posições Abertas</h3>
              <p className="text-xs text-slate-500">
                Explore as oportunidades disponíveis e candidate-se com praticidade.
              </p>
            </div>
            <div className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 self-start sm:self-auto">
              {filteredOpenings.length} {filteredOpenings.length === 1 ? 'vaga encontrada' : 'vagas encontradas'}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Search Input */}
            <div className="sm:col-span-6 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por cargo ou palavra-chave..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-xs"
              />
            </div>

            {/* Department Filter */}
            <div className="sm:col-span-3">
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-xs bg-white"
              >
                <option value="all">Todos os Departamentos</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* Work Model Filter */}
            <div className="sm:col-span-3">
              <select
                value={selectedWorkModel}
                onChange={(e) => setSelectedWorkModel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 text-xs bg-white"
              >
                <option value="all">Todos os Modelos</option>
                <option value="Remoto">100% Remoto</option>
                <option value="Híbrido">Híbrido</option>
                <option value="Presencial">Presencial</option>
              </select>
            </div>
          </div>
        </div>

        {/* Job Openings Grid */}
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-xs animate-pulse">
            Carregando vagas públicas do banco de dados isolado...
          </div>
        ) : filteredOpenings.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Briefcase className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">Nenhuma vaga encontrada com estes filtros</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Tente redefinir a busca ou selecione outro departamento para encontrar posições abertas.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedDept('all');
                setSelectedWorkModel('all');
              }}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredOpenings.map((job) => {
              const pos = getPositionForJob(job);
              const dept = getDepartmentForJob(job);

              return (
                <div
                  key={job.id}
                  className="p-6 rounded-3xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between space-y-5 group"
                >
                  <div className="space-y-3">
                    {/* Top Badges */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {dept?.name || 'Tecnologia'}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {job.workModel} ({job.location})
                      </span>
                    </div>

                    {/* Job Title */}
                    <div>
                      <h4 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {job.title}
                      </h4>
                      {pos?.level && (
                        <div className="text-xs text-slate-500 font-medium mt-0.5">
                          Nível: {pos.level} {pos.careerTrack ? `• Carreira: ${pos.careerTrack}` : ''}
                        </div>
                      )}
                    </div>

                    {/* Technical and behavioral tags */}
                    {pos && (
                      <div className="space-y-2 pt-1">
                        {pos.technicalRequirements && pos.technicalRequirements.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {pos.technicalRequirements.slice(0, 3).map((req, rIdx) => (
                              <span key={rIdx} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium">
                                {req}
                              </span>
                            ))}
                            {pos.technicalRequirements.length > 3 && (
                              <span className="px-1.5 py-0.5 text-[10px] text-slate-400">
                                +{pos.technicalRequirements.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                    {/* Social Share Trigger */}
                    <button
                      onClick={() => handleOpenShare(job)}
                      className="p-2.5 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 border border-slate-200 transition-all flex items-center gap-1.5 text-xs font-semibold"
                      title="Divulgar esta vaga no Instagram, WhatsApp ou LinkedIn"
                    >
                      <Share2 className="w-4 h-4 text-indigo-600" />
                      <span className="hidden sm:inline">Divulgar Vaga</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedJobDetail(job)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                      >
                        Ver Detalhes
                      </button>

                      <button
                        onClick={() => handleOpenApply(job)}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-colors"
                      >
                        Candidatar-se
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-8 px-4 sm:px-8 mt-auto text-xs text-slate-500 text-center space-y-2">
        <div className="flex items-center justify-center gap-2 font-bold text-slate-800">
          <Building2 className="w-4 h-4 text-indigo-600" />
          {activeTenant?.tradingName || activeTenant?.name} • Portal de Carreiras
        </div>
        <div className="text-[11px] text-slate-400 max-w-md mx-auto">
          Powered by TalentCloud Multi-Tenant SaaS. Seus dados são processados com isolamento de banco de dados e total conformidade com a LGPD.
        </div>
      </footer>

      {/* Social Share Studio Modal */}
      <JobSocialShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        job={shareModalJob}
        position={shareModalJob ? getPositionForJob(shareModalJob) : null}
        department={shareModalJob ? getDepartmentForJob(shareModalJob) : null}
        tenant={activeTenant}
        dna={dna}
      />

      {/* Job Application Modal */}
      <JobApplicationModal
        isOpen={isApplicationModalOpen}
        onClose={() => setIsApplicationModalOpen(false)}
        job={applicationModalJob}
        tenant={activeTenant}
        onSuccess={() => {
          // Refresh list or state if needed
          loadPortalData();
        }}
      />

      {/* Job Details Drawer Modal */}
      {selectedJobDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-2xl border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-5 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800">
                  {getDepartmentForJob(selectedJobDetail)?.name || 'Área'}
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-1">{selectedJobDetail.title}</h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  {selectedJobDetail.workModel} • {selectedJobDetail.location}
                </div>
              </div>
              <button
                onClick={() => setSelectedJobDetail(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Position details */}
            {(() => {
              const pos = getPositionForJob(selectedJobDetail);
              return pos ? (
                <div className="space-y-4 text-xs text-slate-700">
                  <div>
                    <h4 className="font-bold text-slate-900 mb-1">Descrição do Cargo & Responsabilidades</h4>
                    <p className="leading-relaxed text-slate-600 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                      {pos.description || 'Atuação com foco em inovação contínua, colaboração multidisciplinar e impacto de negócio.'}
                    </p>
                  </div>

                  {pos.technicalRequirements && pos.technicalRequirements.length > 0 && (
                    <div>
                      <h4 className="font-bold text-slate-900 mb-1.5">Requisitos Técnicos Desejáveis</h4>
                      <ul className="space-y-1">
                        {pos.technicalRequirements.map((r, i) => (
                          <li key={i} className="flex items-center gap-2 text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {pos.behavioralCompetencies && pos.behavioralCompetencies.length > 0 && (
                    <div>
                      <h4 className="font-bold text-slate-900 mb-1.5">Competências Comportamentais & Fit Cultural</h4>
                      <ul className="space-y-1">
                        {pos.behavioralCompetencies.map((b, i) => (
                          <li key={i} className="flex items-center gap-2 text-slate-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-900 text-[11px]">
                    🔒 <strong>Processo com Feedback & IA Explicável:</strong> Valorizamos seu tempo. Todas as etapas do processo são auditáveis com feedback claro sobre o alinhamento com a vaga.
                  </div>
                </div>
              ) : null;
            })()}

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  const jobToShare = selectedJobDetail;
                  setSelectedJobDetail(null);
                  handleOpenShare(jobToShare);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5"
              >
                <Share2 className="w-4 h-4 text-indigo-600" />
                Divulgar nas Redes
              </button>

              <button
                onClick={() => {
                  const jobToApply = selectedJobDetail;
                  setSelectedJobDetail(null);
                  handleOpenApply(jobToApply);
                }}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md flex items-center gap-2"
              >
                Candidatar-se Agora
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
