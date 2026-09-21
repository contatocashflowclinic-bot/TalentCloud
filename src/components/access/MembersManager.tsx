import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserPlus, Check, Mail, Lock, KeyRound, Copy, AlertTriangle, Pencil, SlidersHorizontal, Link2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { MembersApi } from '../../services/api.js';
import { AccessProfile, TenantUser } from '../../types.js';
import type { PositionRef } from '../../services/api.js';
import { formatDateTimeSP } from '../../utils/dateUtils.js';
import { PermissionMatrix } from './PermissionMatrix.js';
import { ProfileCaps, ProfilesPanel } from './ProfilesPanel.js';
import { LinkPositionsModal } from './LinkPositionsModal.js';

interface UserDraft {
  id?: string;
  name: string;
  email: string;
  /** Cargo cadastrado (módulo Cargos); vazio = sem cargo. Nunca é texto livre. */
  positionId: string;
  profileId: string;
  active: boolean;
  custom: boolean;
  permissions: string[];
}

export interface MembersCaps {
  create: boolean;
  edit: boolean;
  viewProfiles: boolean;
  profiles: ProfileCaps;
}

const PAGE_SIZE = 25;
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(x => b.includes(x));

/**
 * People linked to ONE organization and their access profiles. Used by the organization's own
 * "Usuários e Permissões" screen and by the Conta Mãe (per organization) with the same behavior;
 * only the API adapter and the permission limits differ. Lists are searched and paginated on the server.
 */
export const MembersManager: React.FC<{
  api: MembersApi;
  orgName: string;
  orgSlug: string;
  caps: MembersCaps;
  /** Permissions the actor may hand out (already restricted to the organization's enabled modules). */
  limit: readonly string[];
  /** Link id of the signed-in user (cannot edit their own access). */
  selfId?: string;
  /** Pre-filled search (e.g. opening the manager on one person). */
  initialSearch?: string;
  /** Only the Conta Mãe may attach an account that already exists (one person in several organizations). */
  canLinkExisting?: boolean;
}> = ({ api, orgName, orgSlug, caps, limit, selfId, initialSearch, canLinkExisting = false }) => {
  const [tab, setTab] = useState<'users' | 'profiles'>('users');
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialSearch ?? '');
  const [debounced, setDebounced] = useState((initialSearch ?? '').trim());
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  /** Cargos cadastrados que podem ser dados a uma pessoa (a Conta Mãe não os enxerga). */
  const [positionOptions, setPositionOptions] = useState<PositionRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [credentials, setCredentials] = useState<{ name: string; email: string; tempPassword: string; reset: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);

  const profileOf = useCallback((id: string) => profiles.find(p => p.id === id), [profiles]);
  const canSeeProfiles = caps.viewProfiles || caps.create || caps.edit;

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const mine = ++seq.current; // ignore out-of-order responses
    try {
      setLoading(true);
      const [u, p, cargos] = await Promise.all([
        api.listMembers({ search: debounced, page, pageSize: PAGE_SIZE }),
        canSeeProfiles ? api.listProfiles() : Promise.resolve([] as AccessProfile[]),
        api.listPositionOptions ? api.listPositionOptions().catch(() => [] as PositionRef[]) : Promise.resolve([] as PositionRef[])
      ]);
      if (mine !== seq.current) return;
      setUsers(u.items);
      setTotal(u.total);
      setProfiles(p);
      setPositionOptions(cargos);
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [api, debounced, page, canSeeProfiles]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    const first = profiles.find(p => !p.isAdmin) ?? profiles[0];
    setError(null);
    setDraft({ name: '', email: '', positionId: '', profileId: first?.id ?? '', active: true, custom: false, permissions: first?.permissions ?? [] });
  };

  const openEdit = (u: TenantUser) => {
    setError(null);
    setDraft({
      id: u.id, name: u.name, email: u.email, positionId: u.positionId ?? '', profileId: u.profileId, active: u.active,
      custom: u.grantedPermissions.length + u.revokedPermissions.length > 0,
      permissions: u.permissions ?? []
    });
  };

  const changeProfile = (profileId: string) => {
    if (!draft) return;
    setDraft({ ...draft, profileId, custom: false, permissions: profileOf(profileId)?.permissions ?? [] });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const profile = profileOf(draft.profileId);
    const previous = draft.id ? users.find(u => u.id === draft.id) : undefined;
    // The server stores only the difference against the profile. Omitting `permissions` keeps the current
    // exceptions when the profile is unchanged and clears them when it changes; sending the profile's own set clears them.
    const permissions = draft.custom
      ? draft.permissions
      : previous && previous.profileId === draft.profileId ? profile?.permissions : undefined;
    setSaving(true);
    setError(null);
    try {
      if (draft.id) {
        await api.updateMember(draft.id, { name: draft.name, ...(api.listPositionOptions ? { positionId: draft.positionId || null } : {}), profileId: draft.profileId, active: draft.active, permissions });
        setNotice('Acesso atualizado.');
      } else {
        const created = await api.createMember({
          name: draft.name, email: draft.email, positionId: draft.positionId || undefined, profileId: draft.profileId,
          permissions: draft.custom && profile && !sameSet(draft.permissions, profile.permissions) ? draft.permissions : undefined
        });
        if (created.tempPassword) {
          setCopied(false);
          setCredentials({ name: created.user.name, email: created.user.email, tempPassword: created.tempPassword, reset: false });
        } else {
          setNotice(`${created.user.email} já possuía conta e foi vinculado a ${orgName} (a senha atual foi mantida).`);
        }
      }
      setDraft(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar o usuário.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (u: TenantUser) => {
    if (!confirm(`Gerar nova senha temporária para ${u.name}? A senha atual deixará de funcionar e as sessões dele serão encerradas.`)) return;
    try {
      const res = await api.resetPassword(u.id);
      setCopied(false);
      setCredentials({ name: res.user.name, email: res.user.email, tempPassword: res.tempPassword, reset: true });
    } catch (err: any) {
      alert(err.message || 'Erro ao redefinir a senha');
    }
  };

  const toggleActive = async (u: TenantUser) => {
    if (!confirm(`${u.active ? 'Desativar' : 'Reativar'} o acesso de ${u.name} a ${orgName}?`)) return;
    try {
      await api.updateMember(u.id, { active: !u.active });
      await load();
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar o status');
    }
  };

  const profileBadge = (u: TenantUser) => {
    const admin = profileOf(u.profileId)?.isAdmin;
    const custom = u.grantedPermissions.length + u.revokedPermissions.length > 0;
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${admin ? 'bg-purple-100 text-purple-800' : 'bg-indigo-100 text-indigo-800'}`}>
          {u.profileName ?? u.profileId}
        </span>
        {custom && (
          <span title="Possui permissões individuais diferentes do perfil" className="text-amber-600">
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </span>
        )}
      </span>
    );
  };

  const draftProfile = draft ? profileOf(draft.profileId) : undefined;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {caps.viewProfiles ? (
          <div className="flex gap-1 border-b border-slate-200">
            {([['users', 'Usuários'], ['profiles', 'Perfis de acesso']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                  tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : <span />}

        {tab === 'users' && caps.edit && api.linkPositions && (
          <button
            onClick={() => setLinkOpen(true)}
            className="px-4 py-2.5 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 font-semibold text-xs transition-colors"
          >
            Vincular cargos em lote
          </button>
        )}

        {tab === 'users' && caps.create && (
          <button
            onClick={openCreate}
            disabled={profiles.length === 0}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            {canLinkExisting ? 'Vincular Usuário' : 'Cadastrar Usuário'}
          </button>
        )}
      </div>

      {linkOpen && api.linkPositions && (
        <LinkPositionsModal
          api={api}
          onClose={() => setLinkOpen(false)}
          onLinked={(count) => { setLinkOpen(false); setNotice(`${count} ${count === 1 ? 'pessoa vinculada' : 'pessoas vinculadas'} a cargos do cadastro.`); void load(); }}
        />
      )}

      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
          <span className="flex items-start gap-2"><Check className="w-4 h-4 shrink-0 mt-0.5" /> {notice}</span>
          <button onClick={() => setNotice(null)} className="font-semibold">OK</button>
        </div>
      )}

      {tab === 'profiles' ? (
        <ProfilesPanel profiles={profiles} api={api} caps={caps.profiles} limit={limit} onChanged={load} />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Usuários vinculados ({total})</span>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome ou e-mail (início)..."
                  className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 w-56"
                />
              </div>
              <span className="hidden sm:flex text-[11px] text-emerald-600 font-semibold items-center gap-1">
                <Lock className="w-3 h-3" /> Restrito a esta organização
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Nome / Identificação</th>
                  <th className="px-5 py-3">Perfil de acesso</th>
                  <th className="px-5 py-3 hidden md:table-cell">Cargo</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 hidden lg:table-cell">Último Acesso</th>
                  {caps.edit && <th className="px-5 py-3 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && <tr><td colSpan={6} className="px-5 py-6 text-center text-xs text-slate-400">Carregando...</td></tr>}
                {!loading && users.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-center text-xs text-slate-400">Nenhum usuário encontrado.</td></tr>}
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{u.name}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" /> {u.email}</div>
                    </td>
                    <td className="px-5 py-3.5">{profileBadge(u)}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-700 hidden md:table-cell">
                      {u.jobTitle}
                      {api.listPositionOptions && !u.positionId && (
                        <span className="block text-[10px] text-amber-700" title="Escolha um cargo do cadastro de Cargos ao editar a pessoa.">sem cargo cadastrado</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${u.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.active ? 'bg-emerald-500' : 'bg-slate-300'}`}></span> {u.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400 font-mono hidden lg:table-cell" title="Horário de São Paulo - SP">
                      {u.lastLoginAt ? formatDateTimeSP(u.lastLoginAt) : '—'}
                    </td>
                    {caps.edit && (
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {u.id === selfId ? (
                          <span className="text-[11px] text-slate-400">Você</span>
                        ) : (
                          <div className="inline-flex gap-1.5">
                            <button onClick={() => openEdit(u)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 text-[11px] font-semibold inline-flex items-center gap-1.5">
                              <Pencil className="w-3.5 h-3.5" /> Acesso
                            </button>
                            <button onClick={() => toggleActive(u)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-[11px] font-semibold">
                              {u.active ? 'Desativar' : 'Reativar'}
                            </button>
                            <button onClick={() => handleResetPassword(u)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 text-[11px] font-semibold inline-flex items-center gap-1.5" title="Gerar nova senha temporária">
                              <KeyRound className="w-3.5 h-3.5" /> Senha
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Página {page} de {pages}</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50" aria-label="Página anterior"><ChevronLeft className="w-4 h-4" /></button>
                <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50" aria-label="Próxima página"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Link / edit user modal */}
      {draft && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <form onSubmit={save} className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-slate-200 shadow-xl space-y-4 text-xs">
            <div>
              <h3 className="text-base font-bold text-slate-900">{draft.id ? 'Acesso do usuário' : canLinkExisting ? 'Vincular usuário' : 'Cadastrar usuário'}</h3>
              <p className="text-slate-500 mt-1 flex items-start gap-1.5">
                {!draft.id && <Link2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                <span>
                  {draft.id ? (
                    <>Organização <span className="font-semibold">{orgName}</span></>
                  ) : (
                    canLinkExisting ? (
                      <>
                        Vincula a pessoa à organização <span className="font-semibold">{orgName}</span>. Se o e-mail já tiver conta
                        (em outra organização), ela é apenas vinculada e mantém a senha; senão, uma senha temporária é gerada e exibida uma única vez.
                      </>
                    ) : (
                      <>
                        Cadastra a pessoa na organização <span className="font-semibold">{orgName}</span> com uma senha temporária, exibida uma única vez.
                        O e-mail precisa ser novo na plataforma: para dar acesso a quem já atua em outra organização, solicite à Conta Mãe.
                      </>
                    )
                  )}
                </span>
              </p>
            </div>

            {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">{error}</div>}

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block font-semibold text-slate-700 mb-1">Nome completo</span>
                <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex: Carlos Silva"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500" />
              </label>
              <label className="block">
                <span className="block font-semibold text-slate-700 mb-1">E-mail corporativo</span>
                <input type="email" required disabled={!!draft.id} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="carlos@empresa.com.br"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500 disabled:bg-slate-50" />
              </label>
              <label className="block">
                <span className="block font-semibold text-slate-700 mb-1">Cargo</span>
                {api.listPositionOptions ? (
                  <>
                    <select value={draft.positionId} onChange={(e) => setDraft({ ...draft, positionId: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500">
                      <option value="">— sem cargo cadastrado —</option>
                      {positionOptions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                    <span className="block text-[11px] text-slate-400 mt-1">Só cargos do módulo Cargos. Para incluir um novo, cadastre-o lá.</span>
                  </>
                ) : (
                  <span className="block px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500">O cargo é escolhido pela própria organização, no cadastro de Cargos.</span>
                )}
              </label>
              <label className="block">
                <span className="block font-semibold text-slate-700 mb-1">Perfil de acesso</span>
                <select value={draft.profileId} onChange={(e) => changeProfile(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500">
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>

            {draft.id && (
              <label className="flex items-center gap-2 font-semibold text-slate-700">
                <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
                Acesso ativo nesta organização
              </label>
            )}

            {draftProfile && (
              <div className="space-y-2">
                {draftProfile.isAdmin ? (
                  <p className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-800">
                    O perfil administrador possui todas as permissões dos módulos liberados e não aceita exceções individuais.
                  </p>
                ) : (
                  <>
                    <label className="flex items-center gap-2 font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={draft.custom}
                        onChange={(e) => setDraft({ ...draft, custom: e.target.checked, permissions: e.target.checked ? draft.permissions : draftProfile.permissions })}
                        className="w-4 h-4 accent-indigo-600"
                      />
                      Personalizar permissões deste usuário (exceções ao perfil)
                    </label>
                    <PermissionMatrix
                      value={draft.permissions}
                      onChange={(permissions) => setDraft({ ...draft, permissions })}
                      disabled={!draft.custom}
                      limit={limit}
                      baseline={draftProfile.permissions}
                    />
                    {draft.custom && <p className="text-[11px] text-slate-400">Células destacadas diferem do perfil. Só é possível liberar módulos habilitados para a organização.</p>}
                  </>
                )}
              </div>
            )}

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
              <button type="button" onClick={() => setDraft(null)} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium">Cancelar</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold shadow-xs">
                {saving ? 'Salvando...' : draft.id ? 'Salvar acesso' : canLinkExisting ? 'Vincular usuário' : 'Cadastrar usuário'}
              </button>
            </div>
          </form>
        </div>
      )}

      {credentials && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700"><KeyRound className="w-5 h-5" /></div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{credentials.reset ? 'Nova senha temporária' : 'Usuário criado'}</h3>
                <p className="text-xs text-slate-500">{credentials.name}</p>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
              <div><span className="text-slate-500">Organização:</span> <span className="font-mono font-semibold">{orgSlug}</span></div>
              <div><span className="text-slate-500">E-mail:</span> <span className="font-mono font-semibold">{credentials.email}</span></div>
              <div><span className="text-slate-500">Senha temporária:</span> <span className="font-mono font-bold text-indigo-700 select-all">{credentials.tempPassword}</span></div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Exibida uma única vez. A pessoa precisará trocá-la no primeiro acesso.</span>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`Organização: ${orgSlug}\nE-mail: ${credentials.email}\nSenha temporária: ${credentials.tempPassword}`);
                    setCopied(true);
                  } catch { /* clipboard unavailable */ }
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-2"
              >
                <Copy className="w-4 h-4" /> {copied ? 'Copiado' : 'Copiar acesso'}
              </button>
              <button onClick={() => setCredentials(null)} className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
