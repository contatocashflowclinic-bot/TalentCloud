import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  ChevronDown,
  Clock,
  Code,
  Cpu,
  Filter,
  Globe,
  Heart,
  MapPin,
  Monitor,
  RotateCcw,
  Rocket,
  Search,
  Share2,
  ShieldCheck,
  User,
  Users,
  X
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

type SortKey = 'recent' | 'oldest' | 'title';

const WORK_MODELS: JobOpening['workModel'][] = ['Remoto', 'Híbrido', 'Presencial'];
const LEVEL_ORDER: JobPosition['level'][] = ['Júnior', 'Pleno', 'Sênior', 'Especialista', 'Coordenação', 'Gerência', 'Diretoria'];
const PILLAR_ICONS = [Code, Rocket, Users];

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value]);

const publishedLabel = (openedAt: string) => {
  const days = Math.floor((Date.now() - new Date(openedAt).getTime()) / 86_400_000);
  if (!Number.isFinite(days) || days < 1) return 'Publicado hoje';
  return `Publicado há ${days} ${days === 1 ? 'dia' : 'dias'}`;
};

const jobIcon = (areaName: string) => {
  const n = areaName.toLowerCase();
  if (/intelig|dados|\bia\b|data/.test(n)) return Cpu;
  if (/engenharia|software|tecnologia|produto|ti\b/.test(n)) return Monitor;
  return Briefcase;
};

const FilterGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-2">
    <h4 className="text-sm font-bold text-slate-900">{title}</h4>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const FilterOption: React.FC<{ label: string; count: number; checked: boolean; onChange: () => void }> = ({ label, count, checked, onChange }) => (
  <label className={`flex items-center gap-2.5 text-sm cursor-pointer ${count === 0 && !checked ? 'text-slate-400' : 'text-slate-700'}`}>
    <input type="checkbox" checked={checked} onChange={onChange} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
    <span>{label} <span className="text-slate-400">({count})</span></span>
  </label>
);

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
  const [locationFilter, setLocationFilter] = useState('all');
  const [workModels, setWorkModels] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [filtersOpen, setFiltersOpen] = useState(false); // filters panel on small screens

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

  const getPositionForJob = (job: JobOpening) => positions.find(p => p.id === job.positionId);
  const getDepartmentForJob = (job: JobOpening) => departments.find(d => d.id === job.departmentId);

  const openJobs = useMemo(() => openings.filter(j => j.status === 'open' || j.status === 'in_progress'), [openings]);
  const orgName = activeTenant?.tradingName || activeTenant?.name || '';
  const locations = useMemo(() => [...new Set(openJobs.map(j => j.location).filter(Boolean))].sort(), [openJobs]);

  const levelOf = (j: JobOpening) => getPositionForJob(j)?.level as string | undefined;
  const areaOf = (j: JobOpening) => getDepartmentForJob(j)?.id;

  const filteredOpenings = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const list = openJobs.filter(job => {
      const pos = positions.find(p => p.id === job.positionId);
      const haystack = [job.title, job.location, pos?.description ?? '', ...(pos?.technicalRequirements ?? [])].join(' ').toLowerCase();
      return (
        (!term || haystack.includes(term)) &&
        (locationFilter === 'all' || job.location === locationFilter) &&
        (workModels.length === 0 || workModels.includes(job.workModel)) &&
        (areas.length === 0 || areas.includes(job.departmentId)) &&
        (levels.length === 0 || (pos?.level && levels.includes(pos.level)))
      );
    });
    return list.sort((a, b) =>
      sortBy === 'title' ? a.title.localeCompare(b.title, 'pt-BR')
        : sortBy === 'oldest' ? a.openedAt.localeCompare(b.openedAt)
        : b.openedAt.localeCompare(a.openedAt)
    );
  }, [openJobs, positions, searchTerm, locationFilter, workModels, areas, levels, sortBy]);

  const activeFilterCount = workModels.length + areas.length + levels.length + (locationFilter !== 'all' ? 1 : 0);
  const clearFilters = () => {
    setSearchTerm('');
    setLocationFilter('all');
    setWorkModels([]);
    setAreas([]);
    setLevels([]);
  };

  const countBy = (pred: (j: JobOpening) => boolean) => openJobs.filter(pred).length;
  const areaOptions = departments.filter(d => countBy(j => j.departmentId === d.id) > 0 || areas.includes(d.id));
  const levelOptions = LEVEL_ORDER.filter(l => countBy(j => levelOf(j) === l) > 0 || levels.includes(l));

  // Selection process: what candidates actually go through (stages of the open jobs), preceded by the application
  const processSteps = useMemo(() => {
    const stages = [...(openJobs.find(j => j.stages?.length)?.stages ?? [])].sort((a, b) => a.order - b.order);
    return [
      { name: 'Candidatura', text: 'Inscreva-se na vaga de seu interesse.' },
      ...stages.slice(0, 4).map(s => ({ name: s.name, text: s.description }))
    ];
  }, [openJobs]);

  const handleOpenShare = (job: JobOpening | null) => {
    setShareModalJob(job);
    setIsShareModalOpen(true);
  };

  const handleOpenApply = (job: JobOpening) => {
    setApplicationModalJob(job);
    setIsApplicationModalOpen(true);
  };

  const navLink = 'text-sm font-medium text-slate-600 hover:text-indigo-700 transition-colors';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased scroll-smooth">

      {/* Admin preview strip: only when opened from the admin panel */}
      {onBackToAdmin && (
        <div className="bg-slate-950 text-slate-300 px-4 sm:px-8 py-2 text-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToAdmin}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao Painel Administrativo
            </button>
            <span className="hidden sm:flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              Pré-visualização da página pública de vagas
            </span>
          </div>
          <button
            onClick={() => handleOpenShare(null)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors"
            title="Compartilhar a página geral de carreiras"
          >
            <Share2 className="w-3.5 h-3.5" />
            Divulgar Portal
          </button>
        </div>
      )}

      {/* Top navigation */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <a href="#vagas" className="flex items-center gap-3 min-w-0">
            {activeTenant?.logoUrl ? (
              <img src={activeTenant.logoUrl} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
            ) : (
              <span className="w-9 h-9 rounded-lg bg-indigo-600 text-white font-extrabold text-sm flex items-center justify-center shrink-0">
                {orgName.slice(0, 2).toUpperCase() || 'TC'}
              </span>
            )}
            <span className="font-bold text-slate-900 text-lg truncate">{orgName}</span>
          </a>
          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            <a href="#vagas" className={`${navLink} text-indigo-700 border-b-2 border-indigo-600 py-5`}>Vagas</a>
            <a href="#como-trabalhamos" className={navLink}>Como trabalhamos</a>
            <a href="#processo" className={navLink}>Processo seletivo</a>
            <a href="#sobre" className={navLink}>Sobre nós</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-900 text-white relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 sm:py-16 relative grid lg:grid-cols-[1fr_280px] gap-10 items-center">
          <div className="space-y-6 min-w-0">
            <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight tracking-tight">
              Encontre uma oportunidade<br className="hidden sm:block" /> para transformar o futuro<br className="hidden sm:block" />{' '}
              <span className="text-blue-400">com a gente.</span>
            </h1>
            <p className="text-slate-200 text-sm sm:text-base max-w-xl">
              {dna?.cultureSummary || 'Autonomia e impacto real em um ambiente que valoriza pessoas.'}
            </p>

            <div className="bg-white rounded-2xl p-2 flex flex-col sm:flex-row gap-2 shadow-xl max-w-3xl">
              <label className="flex items-center gap-2.5 flex-1 min-w-0 px-3">
                <Search className="w-5 h-5 text-indigo-600 shrink-0" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Cargo, competência ou palavra-chave"
                  aria-label="Buscar vagas"
                  className="w-full py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden"
                />
              </label>
              <label className="flex items-center gap-2 sm:border-l border-slate-200 px-3 sm:w-56 relative">
                <MapPin className="w-5 h-5 text-slate-500 shrink-0" />
                <select
                  value={locationFilter}
                  onChange={e => setLocationFilter(e.target.value)}
                  aria-label="Localização"
                  className="w-full py-2.5 text-sm text-slate-700 bg-transparent appearance-none focus:outline-hidden pr-5"
                >
                  <option value="all">Localização</option>
                  {locations.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 pointer-events-none" />
              </label>
              <a href="#vagas" className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                Buscar vagas <ArrowRight className="w-4 h-4" />
              </a>
            </div>

            <div className="flex flex-wrap gap-x-7 gap-y-2 text-sm font-medium text-slate-100">
              <span className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-400" /> Empresa verificada</span>
              <span className="flex items-center gap-2"><Users className="w-5 h-5 text-blue-300" /> Processo transparente</span>
              <span className="flex items-center gap-2"><Heart className="w-5 h-5 text-violet-300 fill-violet-300" /> Decisão final humana</span>
            </div>
          </div>

          {dna?.mission && (
            <aside className="hidden lg:block border-l border-white/15 pl-8 space-y-3">
              <p className="font-bold text-lg leading-snug">{dna.mission}</p>
              <div className="w-12 h-0.5 bg-indigo-400" />
              {dna.vision && <p className="text-sm text-slate-300 leading-relaxed">{dna.vision}</p>}
            </aside>
          )}
        </div>
      </section>

      <main className="flex-1">

        {/* Openings + filters */}
        <section id="vagas" className="scroll-mt-16 py-14 sm:py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 grid lg:grid-cols-[1fr_270px] gap-8 items-start">
            <div className="space-y-5 min-w-0">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">Oportunidades</span>
                  <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Vagas abertas</h2>
                  <p className="text-sm text-slate-500">
                    {filteredOpenings.length} {filteredOpenings.length === 1 ? 'oportunidade encontrada' : 'oportunidades encontradas'}
                  </p>
                </div>
                <button
                  onClick={() => setFiltersOpen(v => !v)}
                  className="lg:hidden flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
                >
                  <Filter className="w-4 h-4" /> Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </button>
              </div>

              {/* Active filters + sorting */}
              <div className="flex flex-wrap items-center gap-2">
                {activeFilterCount > 0 && (
                  <>
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-medium text-indigo-700">
                      <Filter className="w-3.5 h-3.5" /> Todos os filtros ({activeFilterCount})
                    </span>
                    {locationFilter !== 'all' && (
                      <button onClick={() => setLocationFilter('all')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-medium text-indigo-700">
                        {locationFilter} <X className="w-3 h-3" />
                      </button>
                    )}
                    {workModels.map(m => (
                      <button key={m} onClick={() => setWorkModels(toggle(workModels, m))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-medium text-indigo-700">
                        {m} <X className="w-3 h-3" />
                      </button>
                    ))}
                    {areas.map(id => (
                      <button key={id} onClick={() => setAreas(toggle(areas, id))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-medium text-indigo-700">
                        {departments.find(d => d.id === id)?.name ?? 'Área'} <X className="w-3 h-3" />
                      </button>
                    ))}
                    {levels.map(l => (
                      <button key={l} onClick={() => setLevels(toggle(levels, l))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-medium text-indigo-700">
                        {l} <X className="w-3 h-3" />
                      </button>
                    ))}
                    <button onClick={clearFilters} className="text-xs font-semibold text-indigo-600 underline hover:text-indigo-800">Limpar filtros</button>
                  </>
                )}
                <label className="ml-auto flex items-center gap-2 text-xs text-slate-500">
                  Ordenar por
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as SortKey)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value="recent">Mais recentes</option>
                    <option value="oldest">Mais antigas</option>
                    <option value="title">Título (A–Z)</option>
                  </select>
                </label>
              </div>

              {/* Job list */}
              {loading ? (
                <div className="text-center py-16 text-slate-400 text-sm animate-pulse">Carregando as vagas...</div>
              ) : loadError ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-rose-200 text-sm text-rose-700">{loadError}</div>
              ) : filteredOpenings.length === 0 ? (
                <div className="p-10 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                    <Briefcase className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">Nenhuma vaga encontrada</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">Tente outra palavra-chave ou remova alguns filtros para ver mais oportunidades.</p>
                  <button onClick={clearFilters} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors">
                    Limpar filtros
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredOpenings.map(job => {
                    const pos = getPositionForJob(job);
                    const dept = getDepartmentForJob(job);
                    const Icon = jobIcon(dept?.name ?? job.title);
                    const tags = pos?.technicalRequirements?.slice(0, 3) ?? [];
                    return (
                      <article key={job.id} className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all flex gap-4 sm:gap-5">
                        <div className="hidden sm:flex w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 items-center justify-center shrink-0">
                          <Icon className="w-7 h-7" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-2.5">
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">{job.title}</h3>
                            {dept && <div className="text-sm font-medium text-indigo-600">{dept.name}</div>}
                          </div>
                          {pos?.description && <p className="text-sm text-slate-500 line-clamp-2">{pos.description}</p>}
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500">
                            <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {job.workModel}{job.location ? ` • ${job.location}` : ''}</span>
                            {pos?.level && <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {pos.level}</span>}
                            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {publishedLabel(job.openedAt)}</span>
                          </div>
                          <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
                            <div className="flex flex-wrap gap-1.5">
                              {tags.map(t => (
                                <span key={t} className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs font-medium">{t}</span>
                              ))}
                            </div>
                            <button
                              onClick={() => setSelectedJobDetail(job)}
                              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold flex items-center gap-2 transition-colors"
                            >
                              Ver vaga <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Filters panel */}
            <aside className={`${filtersOpen ? 'block' : 'hidden'} lg:block p-5 rounded-2xl bg-white border border-slate-200 space-y-6 lg:sticky lg:top-24`}>
              <h3 className="text-lg font-bold text-slate-900">Filtrar vagas</h3>

              <FilterGroup title="Modelo de trabalho">
                {WORK_MODELS.map(m => (
                  <FilterOption key={m} label={m} count={countBy(j => j.workModel === m)} checked={workModels.includes(m)} onChange={() => setWorkModels(toggle(workModels, m))} />
                ))}
              </FilterGroup>

              {areaOptions.length > 0 && (
                <FilterGroup title="Área">
                  {areaOptions.map(d => (
                    <FilterOption key={d.id} label={d.name} count={countBy(j => areaOf(j) === d.id)} checked={areas.includes(d.id)} onChange={() => setAreas(toggle(areas, d.id))} />
                  ))}
                </FilterGroup>
              )}

              {levelOptions.length > 0 && (
                <FilterGroup title="Senioridade">
                  {levelOptions.map(l => (
                    <FilterOption key={l} label={l} count={countBy(j => levelOf(j) === l)} checked={levels.includes(l)} onChange={() => setLevels(toggle(levels, l))} />
                  ))}
                </FilterGroup>
              )}

              <button onClick={clearFilters} className="flex items-center gap-2 pt-4 border-t border-slate-100 w-full text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                <RotateCcw className="w-4 h-4" /> Limpar filtros
              </button>
            </aside>
          </div>
        </section>

        {/* Culture pillars */}
        {dna && dna.pillars.length > 0 && (
          <section id="como-trabalhamos" className="scroll-mt-16 bg-white border-y border-slate-200 py-16 sm:py-20">
            <div className="max-w-6xl mx-auto px-4 sm:px-8 space-y-10">
              <div className="text-center max-w-2xl mx-auto space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">Cultura</span>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Nosso jeito de trabalhar</h2>
                <p className="text-sm sm:text-base text-slate-500">O que nos move todos os dias e faz da {orgName} um lugar único para crescer.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {dna.pillars.slice(0, 3).map((pillar, i) => {
                  const PillarIcon = PILLAR_ICONS[i % PILLAR_ICONS.length];
                  return (
                    <div key={pillar.id} className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-center md:text-left">
                      <span className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto md:mx-0 shadow-md shadow-indigo-200"><PillarIcon className="w-6 h-6" /></span>
                      <h3 className="font-bold text-slate-900 text-lg">{pillar.name}</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">{pillar.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Selection process */}
        <section id="processo" className="scroll-mt-16 bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-900 text-white py-16 sm:py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 space-y-12">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-indigo-300">Passo a passo</span>
              <h2 className="text-2xl sm:text-3xl font-bold">Nosso processo seletivo</h2>
              <p className="text-sm sm:text-base text-slate-300">Transparente, respeitoso e focado em pessoas. A decisão final é sempre humana.</p>
            </div>
            <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-flow-col lg:auto-cols-fr gap-x-6 gap-y-10">
              {processSteps.map((step, i) => (
                <li key={`${step.name}-${i}`} className="relative flex lg:flex-col items-start lg:items-center gap-4 lg:text-center">
                  {i < processSteps.length - 1 && (
                    <span aria-hidden className="hidden lg:block absolute top-6 left-1/2 w-full h-px bg-white/20" />
                  )}
                  <span className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center text-base font-bold shrink-0 ring-4 ring-indigo-950 ${i === 0 ? 'bg-indigo-500 text-white' : 'bg-white text-indigo-800'}`}>{i + 1}</span>
                  <div className="lg:px-2">
                    <h3 className="text-sm font-bold">{step.name}</h3>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* About */}
        {dna && (dna.cultureSummary || dna.coreValues.length > 0) && (
          <section id="sobre" className="scroll-mt-16 py-16 sm:py-20">
            <div className="max-w-6xl mx-auto px-4 sm:px-8 space-y-5">
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">Quem somos</span>
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Sobre nós</h2>
              </div>
              {dna.cultureSummary && <p className="text-sm sm:text-base text-slate-600 max-w-3xl leading-relaxed">{dna.cultureSummary}</p>}
              {dna.coreValues.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {dna.coreValues.map(v => (
                    <span key={v} className="px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700">{v}</span>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-8 px-4 sm:px-8 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 font-bold text-slate-900">
              <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white text-xs font-extrabold flex items-center justify-center">{orgName.slice(0, 2).toUpperCase() || 'TC'}</span>
              {orgName}
            </div>
            <p className="text-xs text-slate-500 mt-2">Portal de Carreiras</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
            <a href="#vagas" className="hover:text-indigo-700">Vagas</a>
            <a href="#como-trabalhamos" className="hover:text-indigo-700">Como trabalhamos</a>
            <a href="#processo" className="hover:text-indigo-700">Processo seletivo</a>
            <a href="#sobre" className="hover:text-indigo-700">Sobre nós</a>
          </nav>
        </div>
        <div className="max-w-6xl mx-auto mt-6 pt-4 border-t border-slate-100 text-[11px] text-slate-400 flex flex-wrap justify-between gap-2">
          <span>© {new Date().getFullYear()} {orgName} • Seus dados são tratados com segurança e em conformidade com a LGPD.</span>
          <span>Powered by Vértice 360</span>
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
