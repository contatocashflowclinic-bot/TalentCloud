import React from 'react';
import {
  Building2,
  Users,
  Dna,
  Network,
  Briefcase,
  Layers,
  UserCheck,
  GitBranch,
  Sparkles,
  Calendar,
  FileCheck,
  Rocket,
  TrendingUp,
  HeartHandshake,
  BarChart3,
  Shield,
  Search,
  Globe
} from 'lucide-react';
import { useTenant } from '../context/TenantContext.js';
import { canAccessModule } from '../access.js';

export interface SidebarProps {
  activeModule: number; // 1 to 15
  onSelectModule: (moduleNumber: number) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const { isSuperAdminMode, setSuperAdminMode, activeTenant, isSuperAdmin, currentRole } = useTenant();

  const moduleSections = [
    {
      title: 'Governança & Fundamentos',
      modules: [
        { id: 1, name: '1. Organizações', icon: Building2, desc: 'Conta Mãe & Configurações' },
        { id: 2, name: '2. Usuários e Permissões', icon: Users, desc: 'RBAC e Acessos' },
        { id: 3, name: '3. DNA Organizacional', icon: Dna, desc: 'Cultura e Pilares' },
        { id: 4, name: '4. Estrutura Organizacional', icon: Network, desc: 'Departamentos e Squads' },
        { id: 5, name: '5. Cargos', icon: Briefcase, desc: 'Competências e Faixas' },
      ]
    },
    {
      title: 'Atração & Seleção',
      modules: [
        { id: 6, name: '6. Vagas', icon: Layers, desc: 'Abertura e Pipeline' },
        { id: 16, name: 'Divulgação & Portal', icon: Globe, badge: 'Social', desc: 'Instagram, WhatsApp, LinkedIn' },
        { id: 7, name: '7. Candidatos', icon: UserCheck, desc: 'Banco de Talentos Isolado' },
        { id: 8, name: '8. Processo Seletivo', icon: GitBranch, desc: 'Kanban e Etapas' },
        { id: 9, name: '9. Avaliação Assistida por IA', icon: Sparkles, badge: 'Gemini', desc: 'Apoio à Decisão & Explicabilidade' },
        { id: 10, name: '10. Entrevistas', icon: Calendar, desc: 'Scorecards e Roteiro' },
      ]
    },
    {
      title: 'Ciclo do Colaborador',
      modules: [
        { id: 11, name: '11. Proposta', icon: FileCheck, desc: 'Oferta e Aprovação' },
        { id: 12, name: '12. Onboarding', icon: Rocket, desc: 'Checklist 30-60-90 dias' },
        { id: 13, name: '13. Desenvolvimento', icon: TrendingUp, desc: 'PDI e Reuniões 1:1' },
        { id: 14, name: '14. Retenção', icon: HeartHandshake, desc: 'eNPS & Risco de Turnover' },
        { id: 15, name: '15. Indicadores', icon: BarChart3, desc: 'People Analytics' },
      ]
    }
  ];

  const visibleSections = moduleSections
    .map(sec => ({ ...sec, modules: sec.modules.filter(m => m.id === 16 || canAccessModule(currentRole, m.id)) }))
    .filter(sec => sec.modules.length > 0);

  if (isCollapsed) {
    return (
      <aside className="w-16 shrink-0 bg-white border-r border-slate-200 min-h-[calc(100vh-4rem)] flex flex-col justify-between py-4 px-2 items-center transition-all duration-200">
        <div className="space-y-4 w-full flex flex-col items-center">
          {isSuperAdmin && (
            <>
          {/* SuperAdmin Icon */}
          <button
            onClick={() => {
              setSuperAdminMode(!isSuperAdminMode);
              if (!isSuperAdminMode) onSelectModule(1);
            }}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              isSuperAdminMode
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-700'
            }`}
            title={isSuperAdminMode ? 'Conta Mãe Ativa (SuperAdmin)' : 'Alternar para Conta Mãe'}
          >
            <Shield className="w-5 h-5" />
          </button>

          <div className="w-8 h-px bg-slate-200 my-1"></div>
            </>
          )}

          {/* Module Icons */}
          <div className="space-y-1.5 w-full flex flex-col items-center">
            {visibleSections.flatMap(s => s.modules).map((mod) => {
              const Icon = mod.icon;
              const isActive = activeModule === mod.id && !isSuperAdminMode;
              return (
                <button
                  key={mod.id}
                  onClick={() => {
                    setSuperAdminMode(false);
                    onSelectModule(mod.id);
                  }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative group ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm font-bold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-600'
                  }`}
                  title={`${mod.name} - ${mod.desc}`}
                >
                  <Icon className="w-5 h-5" />
                  {mod.badge && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-purple-500 border-2 border-white"></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer Icon */}
        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-indigo-600 text-xs font-bold" title={activeTenant?.name}>
          {activeTenant?.name ? activeTenant.name.slice(0, 2).toUpperCase() : 'TC'}
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 xl:w-72 shrink-0 bg-white border-r border-slate-200 min-h-[calc(100vh-4rem)] flex flex-col justify-between p-4 transition-all duration-200">
      <div className="space-y-6">
        
        {isSuperAdmin && (
          <>
            {/* SuperAdmin Quick Switch Banner */}
            <div
              onClick={() => {
                setSuperAdminMode(!isSuperAdminMode);
                if (!isSuperAdminMode) onSelectModule(1);
              }}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                isSuperAdminMode
                  ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`p-1.5 rounded-lg ${isSuperAdminMode ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700'}`}>
                  <Shield className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold uppercase tracking-wider">
                    {isSuperAdminMode ? 'CONTA MÃE ATIVA' : 'Visão SuperAdmin'}
                  </div>
                  <div className="text-[11px] opacity-90 leading-tight">
                    {isSuperAdminMode ? 'Gerenciando todos os tenants' : 'Clique para entrar na Conta Mãe'}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Modules List */}
        <div className="space-y-5">
          {visibleSections.map((section, sIdx) => (
            <div key={sIdx}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2.5 mb-2">
                {section.title}
              </div>
              <div className="space-y-1">
                {section.modules.map((mod) => {
                  const Icon = mod.icon;
                  const isActive = activeModule === mod.id && !isSuperAdminMode;
                  return (
                    <button
                      key={mod.id}
                      onClick={() => {
                        setSuperAdminMode(false);
                        onSelectModule(mod.id);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors text-xs sm:text-sm ${
                        isActive
                          ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                      <span className="truncate flex-1">{mod.name}</span>
                      {mod.badge && (
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            isActive ? 'bg-indigo-700 text-white' : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {mod.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Tenant Info */}
      <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400">
        <div className="font-semibold text-slate-700 truncate">{activeTenant?.name || 'TalentCloud SaaS'}</div>
        <div className="font-mono text-[10px] text-slate-400 truncate">
          Dados: {activeTenant?.dbConfig?.dbName || 'partição isolada por organização'}
        </div>
      </div>
    </aside>
  );
};