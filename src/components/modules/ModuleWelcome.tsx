import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useTenant } from '../../context/TenantContext.js';
import { canAccessModule } from '../../access.js';
import { MODULE_SECTIONS } from '../../moduleRegistry.js';
import { AgendaBoard } from '../agenda/AgendaBoard.js';

const GREETING_BY_HOUR = (hour: number) => (hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite');

export const ModuleWelcome: React.FC<{ onNavigate: (moduleId: number) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { activeTenant, profileLabel, permissions } = useTenant();
  const firstName = (user?.name || '').split(' ')[0] || 'tudo bem';

  const shortcutSections = MODULE_SECTIONS
    .map(sec => ({
      ...sec,
      modules: sec.modules.filter(m => m.id !== 1 && m.id !== 17 && (m.id === 16 || canAccessModule(permissions, m.id)))
    }))
    .filter(sec => sec.modules.length > 0);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-blue-500 text-white p-6 sm:p-8 shadow-lg shadow-indigo-900/10">
        <p className="text-indigo-100 text-xs font-semibold uppercase tracking-wider">
          {GREETING_BY_HOUR(new Date().getHours())}
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold mt-1">Olá, {firstName}!</h1>
        <p className="text-indigo-100 text-sm mt-2">
          Você está em <span className="font-semibold text-white">{activeTenant?.name || 'sua organização'}</span>
          {profileLabel && <> como <span className="font-semibold text-white">{profileLabel}</span></>}.
        </p>
      </div>

      <AgendaBoard compact onOpenFull={() => onNavigate(17)} />

      {shortcutSections.map((section) => (
        <div key={section.title}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{section.title}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {section.modules.map((mod) => {
              const Icon = mod.icon;
              return (
                <button
                  key={mod.id}
                  onClick={() => onNavigate(mod.id)}
                  className="flex items-center gap-3.5 p-4 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md text-left transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900 truncate">{mod.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{mod.desc}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 group-hover:text-indigo-500 transition-colors" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
