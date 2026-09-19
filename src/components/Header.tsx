import React, { useState } from 'react';
import {
  Building2,
  Database,
  ChevronDown,
  Activity,
  Layers,
  Sparkles,
  Info,
  Check,
  Globe,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  KeyRound,
  UserCircle2
} from 'lucide-react';
import { useTenant } from '../context/TenantContext.js';
import { useAuth } from '../context/AuthContext.js';
import { SaoPauloClockBadge } from './SaoPauloClockBadge.js';
import { GlobalCandidateSearchBar } from './search/GlobalCandidateSearchBar.js';

export const Header: React.FC<{
  onOpenArchitectureModal: () => void;
  onOpenCareersPortal?: () => void;
  onNavigateToCandidate?: (candidateId: string, searchTerm?: string) => void;
  onNavigateToProcess?: (jobId: string, candidateId?: string) => void;
  onNavigateToAI?: (candidateId: string, jobId?: string) => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenChangePassword?: () => void;
}> = ({
  onOpenArchitectureModal,
  onOpenCareersPortal,
  onNavigateToCandidate,
  onNavigateToProcess,
  onNavigateToAI,
  isSidebarCollapsed,
  onToggleSidebar,
  onOpenChangePassword
}) => {
  const {
    activeTenant,
    profileLabel,
    can,
    telemetry,
    routingResolution
  } = useTenant();
  const { user, logout, switchOrganization } = useAuth();
  const memberships = user?.memberships ?? [];
  const canSwitchOrg = memberships.length > 1;

  const [isTenantMenuOpen, setIsTenantMenuOpen] = useState(false);
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
      <div className="w-full max-w-[1820px] mx-auto px-3 sm:px-5 lg:px-7">
        <div className="flex items-center justify-between h-16 gap-3 sm:gap-4">
          
          {/* Logo & Main Title & Sidebar Toggle */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {onToggleSidebar && (
              <button
                onClick={onToggleSidebar}
                className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                title={isSidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral para maximizar área"}
              >
                {isSidebarCollapsed ? (
                  <PanelLeft className="w-5 h-5" />
                ) : (
                  <PanelLeftClose className="w-5 h-5" />
                )}
              </button>
            )}

            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-lg tracking-tight">TalentCloud</span>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 rounded-md">
                  Multi-Tenancy
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-none">
                SaaS de Ciclo de Gestão de Talentos
              </p>
            </div>
          </div>

          {/* Global Intelligent Candidate Search Bar */}
          {can('candidates:view') && (
            <div className="flex-1 min-w-0 max-w-xs xl:max-w-[250px] 2xl:max-w-md w-full mx-1 sm:mx-2">
              <GlobalCandidateSearchBar
                onNavigateToCandidate={onNavigateToCandidate}
                onNavigateToProcess={onNavigateToProcess}
                onNavigateToAI={onNavigateToAI}
              />
            </div>
          )}

          {/* Dynamic Routing & DB Health Pill (Clickable for Architecture details) */}
          <button
            onClick={onOpenArchitectureModal}
            className="hidden lg:flex shrink-0 whitespace-nowrap items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all text-left group"
            title="Clique para ver o console de arquitetura multi-tenant e roteamento dinâmico"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <div className="text-xs">
              <span className="text-slate-500 font-medium">Partição:</span>{' '}
              <span className="font-mono font-semibold text-slate-800 group-hover:text-indigo-600">
                {activeTenant?.dbConfig?.dbName || '—'}
              </span>
            </div>
            <div className="h-3 w-px bg-slate-300"></div>
            <span className="text-[11px] font-mono text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
              {telemetry?.latencyMs ?? 0}ms
            </span>
            <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600" />
          </button>

          {/* Horário Padrão São Paulo - SP Badge */}
          <div className="hidden 2xl:block shrink-0">
            <SaoPauloClockBadge />
          </div>

          {/* Careers Portal Quick Button */}
          {onOpenCareersPortal && (
            <button
              onClick={onOpenCareersPortal}
              className="hidden xl:flex shrink-0 whitespace-nowrap items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold transition-colors"
              title="Abrir a página pública de divulgação de vagas da organização"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Portal de Vagas</span>
            </button>
          )}

          {/* Tenant Switcher & Role Selector */}
          <div className="flex items-center gap-3 shrink-0">
            
            {/* Tenant Selector Dropdown */}
            <div className="relative">
              <button
                disabled={!canSwitchOrg}
                onClick={() => {
                  setIsTenantMenuOpen(!isTenantMenuOpen);
                  setIsRoleMenuOpen(false);
                }}
                className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-sm font-medium transition-all bg-white border-slate-200 text-slate-800 hover:border-slate-300 shadow-xs"
              >
                <Building2 className="w-4 h-4 text-indigo-600" />
                <div className="text-left max-w-[120px] sm:max-w-[170px] truncate">
                  <span className="block text-[10px] uppercase font-bold text-slate-400 leading-none">
                    Empresa Ativa
                  </span>
                  <span className="font-semibold text-slate-900 text-xs sm:text-sm truncate block">
                    {activeTenant?.name || 'Selecione'}
                  </span>
                </div>
                {canSwitchOrg && <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
              </button>

              {canSwitchOrg && isTenantMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    Minhas organizações
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {memberships.map((m) => (
                      <button
                        key={m.tenantId}
                        onClick={() => {
                          setIsTenantMenuOpen(false);
                          if (m.tenantId !== activeTenant?.id) void switchOrganization(m.tenantId);
                        }}
                        className={`w-full px-3.5 py-2 flex items-center justify-between text-left hover:bg-slate-50 transition-colors ${
                          activeTenant?.id === m.tenantId ? 'bg-indigo-50/70 font-semibold' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs uppercase">
                            {m.slug.slice(0, 2)}
                          </div>
                          <div className="truncate">
                            <div className="text-sm text-slate-900 truncate">{m.name}</div>
                            <div className="text-[11px] text-slate-400 truncate">{m.profileName}</div>
                          </div>
                        </div>
                        {activeTenant?.id === m.tenantId && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* User menu (real session) */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsRoleMenuOpen(!isRoleMenuOpen);
                  setIsTenantMenuOpen(false);
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium transition-all"
                title="Minha conta"
              >
                <UserCircle2 className="w-4 h-4 text-slate-500" />
                <span className="hidden sm:block text-left leading-tight max-w-[150px]">
                  <span className="block font-semibold text-slate-900 truncate">{user?.name}</span>
                  <span className="block text-[10px] text-slate-400 truncate">{profileLabel}</span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {isRoleMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in duration-100">
                  <div className="px-3.5 py-2 border-b border-slate-100">
                    <div className="text-sm font-semibold text-slate-900 truncate">{user?.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mt-1">{profileLabel}</div>
                  </div>
                  <button
                    onClick={() => {
                      setIsRoleMenuOpen(false);
                      onOpenChangePassword?.();
                    }}
                    className="w-full px-3.5 py-2 flex items-center gap-2.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" /> Alterar senha
                  </button>
                  <button
                    onClick={() => {
                      setIsRoleMenuOpen(false);
                      void logout();
                    }}
                    className="w-full px-3.5 py-2 flex items-center gap-2.5 text-left text-xs text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sair
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </header>
  );
};
