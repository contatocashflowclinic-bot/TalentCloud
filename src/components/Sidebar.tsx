import React from 'react';
import {
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
  Globe,
  X
} from 'lucide-react';
import { useTenant } from '../context/TenantContext.js';
import { canAccessModule } from '../access.js';

export interface SidebarProps {
  activeModule: number; // 1 to 15
  onSelectModule: (moduleNumber: number) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Mobile/tablet drawer state (the menu is off-canvas below the lg breakpoint). */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  isCollapsed = false,
  mobileOpen = false,
  onCloseMobile
}) => {
  const { activeTenant, permissions } = useTenant();

  const moduleSections = [
    {
      title: 'Governança & Fundamentos',
      modules: [
        { id: 2, name: '2. Usuários e Permissões', icon: Users, desc: 'Perfis e Acessos' },
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
    .map(sec => ({ ...sec, modules: sec.modules.filter(m => m.id === 16 || canAccessModule(permissions, m.id)) }))
    .filter(sec => sec.modules.length > 0);

  const allModules = visibleSections.flatMap(s => s.modules);

  const select = (id: number) => {
    onSelectModule(id);
    onCloseMobile?.();
  };

  /** Full menu (used by the desktop sidebar and by the mobile drawer). */
  const fullList = (
    <div className="space-y-5">
      {visibleSections.map((section, sIdx) => (
        <div key={sIdx}>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2.5 mb-2">
            {section.title}
          </div>
          <div className="space-y-1">
            {section.modules.map((mod) => {
              const Icon = mod.icon;
              const isActive = activeModule === mod.id;
              return (
                <button
                  key={mod.id}
                  data-module={mod.id}
                  onClick={() => select(mod.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 lg:py-2 rounded-xl text-left transition-colors text-sm ${
                    isActive
                      ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span className="truncate flex-1">{mod.name}</span>
                  {mod.badge && (
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${isActive ? 'bg-indigo-700 text-white' : 'bg-purple-100 text-purple-700'}`}>
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
  );

  const footer = (
    <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400">
      <div className="font-semibold text-slate-700 truncate">{activeTenant?.name || 'TalentCloud SaaS'}</div>
      <div className="font-mono text-[10px] text-slate-400 truncate">
        Dados: {activeTenant?.dbConfig?.dbName || 'partição isolada por organização'}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop (lg+): fixed sidebar, collapsible to an icon rail */}
      {isCollapsed ? (
        <aside className="hidden lg:flex w-16 shrink-0 bg-white border-r border-slate-200 min-h-[calc(100vh-4rem)] flex-col justify-between py-4 px-2 items-center transition-all duration-200">
          <div className="space-y-1.5 w-full flex flex-col items-center">
            {allModules.map((mod) => {
              const Icon = mod.icon;
              const isActive = activeModule === mod.id;
              return (
                <button
                  key={mod.id}
                  data-module={mod.id}
                  onClick={() => select(mod.id)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative ${
                    isActive ? 'bg-indigo-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-600'
                  }`}
                  title={`${mod.name} - ${mod.desc}`}
                >
                  <Icon className="w-5 h-5" />
                  {mod.badge && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-purple-500 border-2 border-white"></span>}
                </button>
              );
            })}
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-indigo-600 text-xs font-bold" title={activeTenant?.name}>
            {activeTenant?.name ? activeTenant.name.slice(0, 2).toUpperCase() : 'TC'}
          </div>
        </aside>
      ) : (
        <aside className="hidden lg:flex w-64 xl:w-72 shrink-0 bg-white border-r border-slate-200 min-h-[calc(100vh-4rem)] flex-col justify-between p-4 transition-all duration-200">
          {fullList}
          {footer}
        </aside>
      )}

      {/* Mobile / tablet (<lg): off-canvas drawer opened from the header button */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menu de módulos">
          <div className="absolute inset-0 bg-slate-900/50" onClick={onCloseMobile} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col p-4 overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between mb-4">
              <span className="font-bold text-slate-900">Módulos</span>
              <button onClick={onCloseMobile} className="p-2 -mr-2 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Fechar menu">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1">{fullList}</div>
            <div className="mt-6">{footer}</div>
          </aside>
        </div>
      )}
    </>
  );
};
