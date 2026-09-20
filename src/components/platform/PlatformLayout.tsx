import React, { useState } from 'react';
import { Activity, Building2, Cpu, KeyRound, LogOut, ScrollText, ShieldCheck, ShieldAlert, UserCircle2, ChevronDown, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { SaoPauloClockBadge } from '../SaoPauloClockBadge.js';
import { ChangePasswordModal } from '../auth/ChangePasswordModal.js';
import { MultiTenantArchitectureModal } from '../MultiTenantArchitectureModal.js';
import { ProvisionOrganizationModal } from '../ProvisionOrganizationModal.js';
import { PlatformSection, SuperAdminConsole } from '../SuperAdminConsole.js';
import { PlatformUsersPanel } from './PlatformUsersPanel.js';
import { AppFooter } from '../AppFooter.js';

const SECTIONS: Array<{ id: PlatformSection; name: string; desc: string; icon: React.ElementType }> = [
  { id: 'overview', name: 'Visão geral', desc: 'Indicadores da plataforma', icon: Activity },
  { id: 'organizations', name: 'Organizações', desc: 'Clientes, planos e status', icon: Building2 },
  { id: 'users', name: 'Usuários', desc: 'Pessoas, vínculos e acessos', icon: Users },
  { id: 'audit', name: 'Auditoria', desc: 'Segurança e governança', icon: ScrollText }
];

/**
 * Conta Mãe environment: deliberately NOT the organization workspace. It only offers platform routines
 * (overview, organization catalog, audit) — recruiting modules and organization data are never opened here.
 */
export const PlatformLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const [section, setSection] = useState<PlatformSection>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [architectureOpen, setArchitectureOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased">
      <header className="sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800">
        <div className="w-full max-w-[1820px] mx-auto px-3 sm:px-5 lg:px-7 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-md">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight">Vértice 360</span>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded-md">
                  Conta Mãe
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-none">Administração da plataforma</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden 2xl:block"><SaoPauloClockBadge /></div>
            <button
              onClick={() => setArchitectureOpen(true)}
              className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200"
            >
              <Cpu className="w-4 h-4 text-indigo-400" /> Arquitetura
            </button>

            <div className="relative">
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium"
                title="Minha conta"
              >
                <UserCircle2 className="w-4 h-4 text-slate-300" />
                <span className="hidden sm:block text-left leading-tight max-w-[160px]">
                  <span className="block font-semibold truncate">{user?.name}</span>
                  <span className="block text-[10px] text-slate-400 truncate">SuperAdmin</span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50">
                  <div className="px-3.5 py-2 border-b border-slate-100">
                    <div className="text-sm font-semibold truncate">{user?.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
                  </div>
                  <button
                    onClick={() => { setMenuOpen(false); setPasswordOpen(true); }}
                    className="w-full px-3.5 py-2 flex items-center gap-2.5 text-left text-xs hover:bg-slate-50"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" /> Alterar senha
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); void logout(); }}
                    className="w-full px-3.5 py-2 flex items-center gap-2.5 text-left text-xs text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {user?.usingDefaultPassword && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-4 py-2 flex items-center justify-center gap-3 flex-wrap">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Você ainda está usando a <strong>senha padrão</strong> do SuperAdmin. Altere-a antes de colocar o sistema em uso.</span>
          <button onClick={() => setPasswordOpen(true)} className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold">
            Alterar agora
          </button>
        </div>
      )}

      <div className="flex-1 flex w-full max-w-[1820px] mx-auto">
        <aside className="w-16 sm:w-60 shrink-0 bg-white border-r border-slate-200 p-2 sm:p-4">
          <div className="hidden sm:block text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2.5 mb-2">Plataforma</div>
          <nav className="space-y-1">
            {SECTIONS.map(s => {
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  title={`${s.name} — ${s.desc}`}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors text-sm ${
                    active ? 'bg-amber-500 text-white font-semibold shadow-xs' : 'text-slate-700 hover:bg-slate-100 font-medium'
                  }`}
                >
                  <s.icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-500'}`} />
                  <span className="hidden sm:block truncate">
                    {s.name}
                    <span className={`block text-[10px] font-normal ${active ? 'text-amber-100' : 'text-slate-400'}`}>{s.desc}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
          {section === 'users' ? (
            <PlatformUsersPanel />
          ) : (
            <SuperAdminConsole
              section={section}
              reloadKey={reloadKey}
              onNavigate={setSection}
              onOpenProvisionModal={() => setProvisionOpen(true)}
            />
          )}
        </main>
      </div>

      <AppFooter />

      <MultiTenantArchitectureModal isOpen={architectureOpen} onClose={() => setArchitectureOpen(false)} />
      <ProvisionOrganizationModal isOpen={provisionOpen} onClose={() => setProvisionOpen(false)} onCreated={() => setReloadKey(k => k + 1)} />
      {passwordOpen && <ChangePasswordModal onClose={() => setPasswordOpen(false)} />}
    </div>
  );
};
