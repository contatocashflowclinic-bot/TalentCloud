import React from 'react';
import { X } from 'lucide-react';
import { useTenant } from '../context/TenantContext.js';
import { canAccessModule } from '../access.js';
import { MODULE_SECTIONS } from '../moduleRegistry.js';
import { usePendingSurveyCount } from '../hooks/usePendingSurveys.js';

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
  // Retenção: a badge shows how many climate surveys wait for the signed-in person's answer
  const pendingSurveys = usePendingSurveyCount(activeTenant?.id, permissions.includes('climate:view'));
  const badgeOf = (mod: { id: number; badge?: string }): string | undefined =>
    mod.id === 14 && pendingSurveys > 0 ? `${pendingSurveys} ${pendingSurveys === 1 ? 'pesquisa' : 'pesquisas'}` : mod.badge;

  const visibleSections = MODULE_SECTIONS
    .map(sec => ({ ...sec, modules: sec.modules.filter(m => canAccessModule(permissions, m.id)) }))
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
                  {badgeOf(mod) && (
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${isActive ? 'bg-indigo-700 text-white' : mod.id === 14 ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-700'}`}>
                      {badgeOf(mod)}
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
      <div className="font-semibold text-slate-700 truncate">{activeTenant?.name || 'Vértice 360'}</div>
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
                  {badgeOf(mod) && <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white ${mod.id === 14 ? 'bg-amber-500' : 'bg-purple-500'}`}></span>}
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
