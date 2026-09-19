import React from 'react';
import { useTenant } from '../../context/TenantContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { TenantApi } from '../../services/api.js';
import { MembersManager } from '../access/MembersManager.js';

/** Módulo 2 da organização: as mesmas telas que a Conta Mãe usa, limitadas às permissões de quem está logado. */
export const ModuleUsers: React.FC = () => {
  const { activeTenant, can, permissions } = useTenant();
  const { user: me } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Módulo 2</span>
          <span className="text-slate-300">•</span>
          <span className="text-xs font-mono text-slate-500">Partição: {activeTenant?.dbConfig?.dbName}</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mt-1">Usuários e Permissões (RBAC)</h1>
        <p className="text-xs text-slate-500">
          Cada usuário é vinculado a uma ou mais organizações e recebe um perfil de acesso com permissões por rotina.
          Senhas são guardadas apenas como hash.
        </p>
      </div>

      <MembersManager
        api={TenantApi.members}
        orgName={activeTenant?.name ?? 'esta organização'}
        orgSlug={activeTenant?.slug ?? ''}
        selfId={me?.id}
        // quem está logado só entrega o que possui (e o servidor confere de novo)
        limit={permissions}
        caps={{
          create: can('users:create'),
          edit: can('users:edit'),
          viewProfiles: can('profiles:view'),
          profiles: { create: can('profiles:create'), edit: can('profiles:edit'), delete: can('profiles:delete') }
        }}
      />
    </div>
  );
};
