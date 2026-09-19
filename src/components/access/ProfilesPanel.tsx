import React, { useState } from 'react';
import { Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { MembersApi } from '../../services/api.js';
import { AccessProfile } from '../../types.js';
import { PermissionMatrix } from './PermissionMatrix.js';

interface Draft {
  id?: string;
  name: string;
  description: string;
  permissions: string[];
  locked: boolean;
}

export interface ProfileCaps {
  create: boolean;
  edit: boolean;
  delete: boolean;
}

export const ProfilesPanel: React.FC<{
  profiles: AccessProfile[];
  api: Pick<MembersApi, 'createProfile' | 'updateProfile' | 'deleteProfile'>;
  caps: ProfileCaps;
  /** Permissions that may be handed out (what the actor holds, within the organization's enabled modules). */
  limit: readonly string[];
  onChanged: () => Promise<void> | void;
}> = ({ profiles, api, caps, limit, onChanged }) => {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (p?: AccessProfile) => {
    setError(null);
    setDraft(
      p
        ? { id: p.id, name: p.name, description: p.description, permissions: p.permissions, locked: p.isAdmin || !caps.edit }
        : { name: '', description: '', permissions: [], locked: false }
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const body = { name: draft.name, description: draft.description, permissions: draft.permissions };
      if (draft.id) await api.updateProfile(draft.id, body);
      else await api.createProfile(body);
      setDraft(null);
      await onChanged();
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar o perfil.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: AccessProfile) => {
    if (!confirm(`Excluir o perfil "${p.name}"?`)) return;
    try {
      await api.deleteProfile(p.id);
      await onChanged();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir perfil');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Cada perfil define, por rotina, o que o usuário pode visualizar, incluir, alterar ou excluir.
        </p>
        {caps.create && (
          <button
            onClick={() => open()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Novo perfil
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {profiles.map(p => (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-slate-900 text-sm truncate flex items-center gap-1.5">
                  {p.isAdmin ? <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0" /> : null}
                  {p.name}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{p.description || 'Sem descrição'}</div>
              </div>
              {p.isSystem && (
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Sistema
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {p.memberCount ?? 0} usuário(s)</span>
              <span>{p.isAdmin ? 'Todas as permissões' : `${p.permissions.length} permissões`}</span>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => open(p)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 text-[11px] font-semibold flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" /> {caps.edit && !p.isAdmin ? 'Editar' : 'Ver'}
              </button>
              {caps.delete && !p.isSystem && (
                <button
                  onClick={() => remove(p)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50 text-[11px] font-semibold flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <form onSubmit={save} className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[92vh] overflow-y-auto border border-slate-200 shadow-xl space-y-4 text-xs">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {draft.id ? (draft.locked ? 'Perfil de acesso' : 'Editar perfil de acesso') : 'Novo perfil de acesso'}
              </h3>
              {draft.locked && <p className="text-slate-500 mt-1">Somente leitura.</p>}
            </div>

            {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">{error}</div>}

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block font-semibold text-slate-700 mb-1">Nome</span>
                <input
                  required
                  disabled={draft.locked}
                  value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500 disabled:bg-slate-50"
                  placeholder="Ex.: Recrutador Sênior"
                />
              </label>
              <label className="block">
                <span className="block font-semibold text-slate-700 mb-1">Descrição</span>
                <input
                  disabled={draft.locked}
                  value={draft.description}
                  onChange={e => setDraft({ ...draft, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500 disabled:bg-slate-50"
                />
              </label>
            </div>

            <div>
              <span className="block font-semibold text-slate-700 mb-1.5">Permissões por rotina</span>
              <PermissionMatrix
                value={draft.permissions}
                onChange={permissions => setDraft({ ...draft, permissions })}
                disabled={draft.locked}
                limit={limit}
              />
              {!draft.locked && (
                <p className="text-[11px] text-slate-400 mt-1.5">Você só pode liberar permissões que você mesmo possui.</p>
              )}
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
              <button type="button" onClick={() => setDraft(null)} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium">
                {draft.locked ? 'Fechar' : 'Cancelar'}
              </button>
              {!draft.locked && (
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold"
                >
                  {saving ? 'Salvando...' : 'Salvar perfil'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
