import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { ALL_PERMISSIONS, entitledPermissions } from '../../access.js';
import { MasterApi } from '../../services/api.js';
import { Tenant } from '../../types.js';
import { MembersManager } from '../access/MembersManager.js';

/**
 * Conta Mãe: manage the people, links and profiles of ONE organization. The Conta Mãe holds every permission, but only
 * the modules enabled for that organization can be handed out (the rest stays greyed out in the matrix).
 */
export const OrgAccessModal: React.FC<{
  tenant: Pick<Tenant, 'id' | 'name' | 'slug' | 'enabledRoutines'>;
  initialSearch?: string;
  onClose: () => void;
}> = ({ tenant, initialSearch, onClose }) => {
  const api = useMemo(() => MasterApi.membersOf(tenant.id), [tenant.id]);
  const limit = useMemo(() => entitledPermissions(ALL_PERMISSIONS, tenant.enabledRoutines), [tenant.enabledRoutines]);

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 bg-slate-900/70 backdrop-blur-xs">
      <div className="w-full max-w-6xl max-h-[94vh] overflow-y-auto bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Usuários e acessos — {tenant.name}</h2>
            <p className="text-xs text-slate-500">
              Vínculos, perfis e permissões por rotina desta organização. <span className="font-mono">{tenant.slug}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 rounded-lg" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>
        <MembersManager
          api={api}
          orgName={tenant.name}
          orgSlug={tenant.slug}
          limit={limit}
          initialSearch={initialSearch}
          caps={{ create: true, edit: true, viewProfiles: true, profiles: { create: true, edit: true, delete: true } }}
        />
      </div>
    </div>
  );
};
