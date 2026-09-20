import React, { useState } from 'react';
import { Check, Loader2, LogOut } from 'lucide-react';
import { BrandLogo } from '../BrandLogo.js';
import { useAuth } from '../../context/AuthContext.js';

/** Shown right after login when the person has access to more than one organization. */
export const OrganizationPickerPage: React.FC = () => {
  const { user, logout, switchOrganization, confirmOrganization } = useAuth();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const memberships = user?.memberships ?? [];

  const handlePick = async (tenantId: string) => {
    if (tenantId === user?.tenantId) {
      confirmOrganization();
      return;
    }
    setPendingId(tenantId);
    try {
      await switchOrganization(tenantId);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-7 space-y-4">
          <div className="flex justify-center pb-1">
            <BrandLogo width={300} className="max-w-full h-auto" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Escolha a organização</h1>
            <p className="text-xs text-slate-500 mt-0.5">Sua conta tem acesso a mais de uma organização. Selecione com qual deseja trabalhar.</p>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {memberships.map((m) => {
              const isActive = m.tenantId === user?.tenantId;
              const isPending = pendingId === m.tenantId;
              return (
                <button
                  key={m.tenantId}
                  disabled={pendingId !== null}
                  onClick={() => handlePick(m.tenantId)}
                  className={`w-full px-3.5 py-3 rounded-2xl border flex items-center justify-between text-left transition-colors disabled:opacity-60 ${
                    isActive ? 'bg-indigo-50/70 border-indigo-200' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                      {m.slug.slice(0, 2)}
                    </div>
                    <div className="truncate">
                      <div className="text-sm font-semibold text-slate-900 truncate">{m.name}</div>
                      <div className="text-[11px] text-slate-400 truncate">{m.profileName}</div>
                    </div>
                  </div>
                  {isPending ? (
                    <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
                  ) : isActive ? (
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => void logout()}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Não é você? Sair
          </button>
        </div>
      </div>
    </div>
  );
};
