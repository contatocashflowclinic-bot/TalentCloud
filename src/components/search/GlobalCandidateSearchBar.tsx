import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  X,
  User,
  Briefcase,
  Sparkles,
  GitBranch,
  ArrowRight,
  Filter,
  CheckCircle2,
  Clock,
  MapPin,
  Mail,
  Phone,
  Linkedin,
  Award,
  ExternalLink,
  Layers,
  Building2,
  ChevronRight,
  Eye,
  Command
} from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { useAiAccess } from '../../hooks/useAiAccess.js';
import {
  Candidate,
  JobOpening,
  SelectionApplication,
  AIAssistedEvaluation
} from '../../types.js';

interface GlobalCandidateSearchBarProps {
  onNavigateToCandidate?: (candidateId: string, searchTerm?: string) => void;
  onNavigateToProcess?: (jobId: string, candidateId?: string) => void;
  onNavigateToAI?: (candidateId: string, jobId?: string) => void;
}

type SearchFilterCategory = 'all' | 'name' | 'role' | 'skills' | 'in_process';

function normalizeText(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const GlobalCandidateSearchBar: React.FC<GlobalCandidateSearchBarProps> = ({
  onNavigateToCandidate,
  onNavigateToProcess,
  onNavigateToAI
}) => {
  const { activeTenant } = useTenant();
  const { aiEnabled } = useAiAccess();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<SearchFilterCategory>('all');
  const [selectedJobScope, setSelectedJobScope] = useState<string>('all');
  const [previewCandidate, setPreviewCandidate] = useState<Candidate | null>(null);

  // Cached data for the current active organization
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [openings, setOpenings] = useState<JobOpening[]>([]);
  const [applications, setApplications] = useState<SelectionApplication[]>([]);
  const [evaluations, setEvaluations] = useState<AIAssistedEvaluation[]>([]);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Load organization-isolated candidates and processes
  const loadSearchData = async () => {
    if (!activeTenant) return;
    try {
      setLoading(true);
      const [cands, ops, apps, evals] = await Promise.all([
        TenantApi.getCandidates(),
        TenantApi.getOpenings(),
        TenantApi.getApplications(),
        aiEnabled ? TenantApi.getAIEvaluations() : Promise.resolve([] as AIAssistedEvaluation[])
      ]);
      setCandidates(cands);
      setOpenings(ops);
      setApplications(apps);
      setEvaluations(evals);
    } catch (err) {
      console.error('Failed to load global search data for tenant:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSearchData();
  }, [activeTenant?.id]);

  // Global keyboard shortcut (Cmd+K / Ctrl+K or '/')
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      } else if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Handle outside click to close modal
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Extract top skills across all candidates in the organization for quick tags
  const popularSkills = useMemo(() => {
    const freq: Record<string, number> = {};
    candidates.forEach(c => {
      c.skills.forEach(s => {
        const trimmed = s.trim();
        if (trimmed) freq[trimmed] = (freq[trimmed] || 0) + 1;
      });
    });
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(entry => entry[0]);
  }, [candidates]);

  // Process and link each candidate with their job opening applications
  const enrichedCandidates = useMemo(() => {
    return candidates.map(candidate => {
      const candidateApps = applications.filter(a => a.candidateId === candidate.id);
      const activeJobs = candidateApps.map(app => {
        const opening = openings.find(o => o.id === app.jobOpeningId);
        const stage = opening?.stages.find(s => s.id === app.currentStageId);
        const aiEval = evaluations.find(e => e.candidateId === candidate.id && e.jobOpeningId === app.jobOpeningId);
        return {
          application: app,
          opening,
          stage,
          aiEval
        };
      });

      const generalEval = evaluations.find(e => e.candidateId === candidate.id);

      return {
        ...candidate,
        applications: activeJobs,
        hasActiveProcess: activeJobs.length > 0,
        generalEval
      };
    });
  }, [candidates, applications, openings, evaluations]);

  // Filter candidates matching the query, category, and job scope
  const filteredCandidates = useMemo(() => {
    const query = normalizeText(searchTerm);

    return enrichedCandidates.filter(candidate => {
      // 1. Job Opening scope filter
      if (selectedJobScope !== 'all') {
        const isInJob = candidate.applications.some(a => a.opening?.id === selectedJobScope);
        if (!isInJob) return false;
      }

      // If no query string, filter only by category tab
      if (!query) {
        if (filterCategory === 'in_process') return candidate.hasActiveProcess;
        return true;
      }

      const matchName = normalizeText(candidate.name).includes(query);
      const matchRole = normalizeText(candidate.currentRole).includes(query);
      const matchedSkills = candidate.skills.filter(s => normalizeText(s).includes(query));
      const matchSkill = matchedSkills.length > 0;
      const matchJobTitle = candidate.applications.some(a =>
        a.opening && normalizeText(a.opening.title).includes(query)
      );

      // Category tab filtering
      if (filterCategory === 'name') return matchName;
      if (filterCategory === 'role') return matchRole;
      if (filterCategory === 'skills') return matchSkill;
      if (filterCategory === 'in_process') {
        return candidate.hasActiveProcess && (matchName || matchRole || matchSkill || matchJobTitle);
      }

      // 'all' category tab
      return matchName || matchRole || matchSkill || matchJobTitle;
    });
  }, [enrichedCandidates, searchTerm, filterCategory, selectedJobScope]);

  const handleSelectCandidate = (candidateId: string) => {
    setIsOpen(false);
    if (onNavigateToCandidate) {
      onNavigateToCandidate(candidateId, searchTerm);
    }
  };

  const handleSelectProcess = (jobId: string, candidateId: string) => {
    setIsOpen(false);
    if (onNavigateToProcess) {
      onNavigateToProcess(jobId, candidateId);
    }
  };

  const handleSelectAI = (candidateId: string, jobId?: string) => {
    setIsOpen(false);
    if (onNavigateToAI) {
      onNavigateToAI(candidateId, jobId);
    }
  };

  return (
    <div className="relative w-full">
      {/* 1. Trigger Search Input Bar in Header */}
      <div
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="w-full min-w-0 flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-100/90 hover:bg-slate-100 border border-slate-200 hover:border-indigo-300 text-slate-500 hover:text-slate-800 transition-all cursor-pointer shadow-2xs group"
        title="Busca global de candidatos por nome, cargo ou habilidades (Atalho: ⌘K ou Ctrl+K)"
      >
        <Search className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 shrink-0 transition-colors" />
        <span className="text-xs truncate flex-1 select-none">
          {searchTerm ? (
            <span className="text-slate-800 font-medium">"{searchTerm}"</span>
          ) : (
            <span>Buscar candidatos, cargos, skills...</span>
          )}
        </span>
        <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-mono text-slate-400 group-hover:border-indigo-200 group-hover:text-indigo-600 shadow-2xs">
          <Command className="w-2.5 h-2.5" />
          <span>K</span>
        </div>
      </div>

      {/* 2. Interactive Search Palette & Results Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-16 px-3 sm:px-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-100">
          <div
            ref={modalRef}
            className="bg-white rounded-3xl w-full max-w-4xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-98 duration-150"
          >
            {/* Search Input Box */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center gap-3 bg-white">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <Search className="w-4 h-4" />
              </div>

              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrar candidatos por nome, cargo atual ou habilidades (ex: React, Python, Tech Lead)..."
                  className="w-full text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden bg-transparent pr-8"
                  autoFocus
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
                <div className="text-[11px] font-mono text-slate-400 hidden sm:block">
                  ESC para fechar
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter Bar: Category Tabs & Vaga Selector */}
            <div className="px-4 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              
              {/* Category Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                <button
                  onClick={() => setFilterCategory('all')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                    filterCategory === 'all'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                  }`}
                >
                  <span>Todos</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    filterCategory === 'all' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {enrichedCandidates.length}
                  </span>
                </button>

                <button
                  onClick={() => setFilterCategory('name')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                    filterCategory === 'name'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                  }`}
                >
                  <User className="w-3 h-3" />
                  <span>Nome</span>
                </button>

                <button
                  onClick={() => setFilterCategory('role')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                    filterCategory === 'role'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                  }`}
                >
                  <Briefcase className="w-3 h-3" />
                  <span>Cargo</span>
                </button>

                <button
                  onClick={() => setFilterCategory('skills')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                    filterCategory === 'skills'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                  }`}
                >
                  <Award className="w-3 h-3" />
                  <span>Habilidades</span>
                </button>

                <button
                  onClick={() => setFilterCategory('in_process')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                    filterCategory === 'in_process'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                  }`}
                >
                  <GitBranch className="w-3 h-3" />
                  <span>Em Processo Ativo</span>
                </button>
              </div>

              {/* Vaga Scope Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium hidden sm:inline">Filtrar por Vaga:</span>
                <select
                  value={selectedJobScope}
                  onChange={(e) => setSelectedJobScope(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="all">Todas as Vagas da Organização ({openings.length})</option>
                  {openings.map(o => (
                    <option key={o.id} value={o.id}>{o.title}</option>
                  ))}
                </select>
              </div>

            </div>

            {/* Quick Suggestions & Organization Info */}
            {!searchTerm && (
              <div className="px-4 sm:px-6 py-3 bg-indigo-50/40 border-b border-indigo-100/50 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-500">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="font-semibold text-slate-700">Competências em Destaque no Tenant:</span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {popularSkills.map(skill => (
                    <button
                      key={skill}
                      onClick={() => {
                        setSearchTerm(skill);
                        setFilterCategory('skills');
                      }}
                      className="px-2.5 py-0.5 rounded-md bg-white hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 text-[11px] font-medium border border-slate-200 transition-colors"
                    >
                      {skill}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Results List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 divide-y divide-slate-100">
              {loading ? (
                <div className="text-center py-12 text-slate-400 text-xs animate-pulse">
                  Consultando banco de dados isolado da organização...
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                    <Search className="w-6 h-6" />
                  </div>
                  <div className="font-bold text-slate-800 text-sm">
                    Nenhum candidato encontrado
                  </div>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Não encontramos correspondências para "{searchTerm}" com os filtros ativos. Tente buscar por habilidades (ex: React, SQL, Scrum) ou nome.
                  </p>
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilterCategory('all');
                      setSelectedJobScope('all');
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                  >
                    Redefinir Filtros de Busca
                  </button>
                </div>
              ) : (
                filteredCandidates.map((candidate) => {
                  const query = normalizeText(searchTerm);
                  const isQueryInSkills = candidate.skills.some(s => query && normalizeText(s).includes(query));

                  return (
                    <div
                      key={candidate.id}
                      className="pt-3.5 first:pt-0 group hover:bg-slate-50/70 p-3 rounded-2xl transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        {/* Candidate Basic Info */}
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0 mt-0.5">
                            {candidate.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                                {candidate.name}
                              </h4>
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-mono font-semibold">
                                {candidate.yearsOfExperience} anos exp
                              </span>
                              {candidate.generalEval && (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  {candidate.generalEval.overallFitScore}% Fit IA
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-indigo-700 font-semibold flex items-center gap-1.5">
                              <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                              <span>{candidate.currentRole}</span>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-500 font-normal">{candidate.location}</span>
                            </div>

                            {/* Skills matching badges */}
                            <div className="flex flex-wrap gap-1 pt-1">
                              {candidate.skills.slice(0, 5).map((skill, sIdx) => {
                                const isMatched = query && normalizeText(skill).includes(query);
                                return (
                                  <span
                                    key={sIdx}
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
                                      isMatched
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {skill}
                                  </span>
                                );
                              })}
                              {candidate.skills.length > 5 && (
                                <span className="px-1.5 py-0.5 text-[10px] text-slate-400">
                                  +{candidate.skills.length - 5}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Fast Actions */}
                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                          <button
                            onClick={() => setPreviewCandidate(candidate)}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Visualizar mini-bio e histórico do candidato"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            <span className="hidden sm:inline">Mini-Bio</span>
                          </button>

                          <button
                            onClick={() => handleSelectCandidate(candidate.id)}
                            className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors flex items-center gap-1"
                            title="Abrir no Módulo de Candidatos"
                          >
                            <span>Banco de Talentos</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Processos Seletivos Ativos / Vagas Inscritas */}
                      <div className="mt-3 ml-0 sm:ml-13 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          <span className="flex items-center gap-1">
                            <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
                            Processos Seletivos na Organização
                          </span>
                          <span>
                            {candidate.applications.length === 0
                              ? 'Disponível no Banco Geral'
                              : `${candidate.applications.length} vaga(s) em andamento`}
                          </span>
                        </div>

                        {candidate.applications.length === 0 ? (
                          <div className="text-[11px] text-slate-500 flex items-center justify-between">
                            <span>Candidato qualificado sem inscrição ativa em vagas abertas.</span>
                            {openings.length > 0 && (
                              <button
                                onClick={() => handleSelectProcess(openings[0].id, candidate.id)}
                                className="text-indigo-600 hover:underline font-semibold"
                              >
                                + Alocar em {openings[0].title}
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {candidate.applications.map((appItem, aIdx) => (
                              <div
                                key={aIdx}
                                className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                  <span className="font-bold text-slate-800">
                                    {appItem.opening?.title || 'Vaga'}
                                  </span>
                                  <span className="text-slate-400">•</span>
                                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold text-[10px]">
                                    Etapa: {appItem.stage?.name || 'Em Andamento'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  {appItem.aiEval && (
                                    <span className="text-[11px] font-bold text-indigo-700 flex items-center gap-1">
                                      <Sparkles className="w-3 h-3 text-indigo-500" />
                                      {appItem.aiEval.overallFitScore}% Fit
                                    </span>
                                  )}

                                  {appItem.opening && (
                                    <button
                                      onClick={() => handleSelectProcess(appItem.opening!.id, candidate.id)}
                                      className="px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[10px] flex items-center gap-1 transition-colors"
                                    >
                                      <span>Ver no Pipeline</span>
                                      <ArrowRight className="w-3 h-3" />
                                    </button>
                                  )}

                                  {onNavigateToAI && (
                                    <button
                                      onClick={() => handleSelectAI(candidate.id, appItem.opening?.id)}
                                      className="p-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors"
                                      title="Avaliação com IA"
                                    >
                                      <Sparkles className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Status Bar */}
            <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Escopo: <strong>{activeTenant?.name}</strong></span>
              </div>

              <div className="flex items-center gap-3 text-[11px]">
                <span>Total Encontrado: <strong>{filteredCandidates.length} candidatos</strong></span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 3. Candidate Quick Preview Drawer */}
      {previewCandidate && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="bg-white rounded-3xl w-full max-w-lg border border-slate-200 shadow-2xl p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white font-bold flex items-center justify-center text-base">
                  {previewCandidate.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{previewCandidate.name}</h3>
                  <div className="text-xs text-indigo-600 font-semibold">{previewCandidate.currentRole}</div>
                </div>
              </div>
              <button
                onClick={() => setPreviewCandidate(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="w-4 h-4 text-slate-400" />
                <span>{previewCandidate.email}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Phone className="w-4 h-4 text-slate-400" />
                <span>{previewCandidate.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>{previewCandidate.location}</span>
              </div>
              {previewCandidate.linkedinUrl && (
                <div className="flex items-center gap-2 text-indigo-600">
                  <Linkedin className="w-4 h-4 text-indigo-500" />
                  <a href={previewCandidate.linkedinUrl} target="_blank" rel="noreferrer" className="hover:underline">
                    {previewCandidate.linkedinUrl}
                  </a>
                </div>
              )}
            </div>

            <div className="space-y-1 text-xs">
              <span className="font-bold text-slate-800">Resumo Profissional:</span>
              <p className="text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                {previewCandidate.resumeSummary}
              </p>
            </div>

            <div className="space-y-1.5 text-xs">
              <span className="font-bold text-slate-800">Habilidades Técnicas & Comportamentais:</span>
              <div className="flex flex-wrap gap-1.5">
                {previewCandidate.skills.map((skill, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-semibold border border-indigo-100">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
              <button
                onClick={() => setPreviewCandidate(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
              >
                Voltar à Busca
              </button>
              <button
                onClick={() => {
                  const cid = previewCandidate.id;
                  setPreviewCandidate(null);
                  handleSelectCandidate(cid);
                }}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs"
              >
                Ver no Módulo de Candidatos
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
