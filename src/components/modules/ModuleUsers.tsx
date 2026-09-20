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
        <h1 className="text-xl font-bold text-slate-900">Usuários e Permissões</h1>
        <p className="text-xs text-slate-500">
          Cada pessoa é vinculada a uma ou mais organizações e recebe um perfil de acesso, que define o que ela pode ver e fazer em cada área do sistema.
          As senhas são guardadas de forma segura.
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
