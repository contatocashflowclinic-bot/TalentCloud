import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, KeyRound, Link2, Mail, Power, Search, UserPlus, X } from 'lucide-react';
import { MasterApi } from '../../services/api.js';
import { AccessProfile, Tenant, PlatformUser } from '../../types.js';
import { formatDateTimeSP } from '../../utils/dateUtils.js';
import { OrgAccessModal } from './OrgAccessModal.js';

const PAGE_SIZE = 25;

/** Organization + profile picker. Organizations are searched on the server (works with thousands of tenants). */
const OrgProfilePicker: React.FC<{
  required?: boolean;
  onChange: (value: { tenantId: string; profileId: string } | null) => void;
}> = ({ required, onChange }) => {
  const [term, setTerm] = useState('');
  const [orgs, setOrgs] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [profileId, setProfileId] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      MasterApi.getTenantsPage({ search: term, pageSize: 20 }).then(p => setOrgs(p.items)).catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    setProfiles([]);
    setProfileId('');
    if (!tenantId) return;
    MasterApi.membersOf(tenantId).listProfiles().then(list => {
      setProfiles(list);
      setProfileId((list.find(p => !p.isAdmin) ?? list[0])?.id ?? '');
    }).catch(() => undefined);
  }, [tenantId]);

  useEffect(() => {
    onChange(tenantId && profileId ? { tenantId, profileId } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, profileId]);

  const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500';
  return (
    <div className="grid sm:grid-cols-3 gap-3">
      <label className="block"><span className="block font-semibold text-slate-700 mb-1">Buscar organização</span>
        <input className={input} value={term} onChange={e => setTerm(e.target.value)} placeholder="Nome, identificador ou e-mail" /></label>
      <label className="block"><span className="block font-semibold text-slate-700 mb-1">Organização{required ? '' : ' (opcional)'}</span>
        <select className={input} required={required} value={tenantId} onChange={e => setTenantId(e.target.value)}>
          <option value="">{required ? 'Selecione...' : 'Sem vínculo por enquanto'}</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name} ({o.slug})</option>)}
        </select></label>
      <label className="block"><span className="block font-semibold text-slate-700 mb-1">Perfil de acesso</span>
        <select className={input} required={!!tenantId} disabled={!tenantId} value={profileId} onChange={e => setProfileId(e.target.value)}>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
    </div>
  );
};

const VISIBLE_LINKS = 2;

/** Organization links of one person: one tidy line per organization; beyond two, the rest folds into "+N". */
const LinksCell: React.FC<{ links: PlatformUser['links']; onOpen: (link: PlatformUser['links'][number]) => void }> = ({ links, onOpen }) => {
  const [expanded, setExpanded] = useState(false);
  if (links.length === 0) return <span className="text-xs text-slate-400">Sem vínculo</span>;
  const shown = expanded ? links : links.slice(0, VISIBLE_LINKS);
  const hidden = links.length - shown.length;
  return (
    <ul className="max-w-md space-y-0.5">
      {shown.map(l => (
        <li key={l.membershipId}>
          <button
            onClick={() => onOpen(l)}
            title="Editar perfil e permissões nesta organização"
            className={`w-full flex items-center justify-between gap-3 rounded-lg px-2 py-1 -mx-2 text-left hover:bg-slate-100 ${l.active ? '' : 'opacity-50'}`}
          >
            <span className={`truncate text-xs font-medium ${l.active ? 'text-slate-800' : 'text-slate-500 line-through'}`}>{l.tenantName}</span>
            <span className="shrink-0 whitespace-nowrap rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">{l.profileName}</span>
          </button>
        </li>
      ))}
      {links.length > VISIBLE_LINKS && (
        <li>
          <button onClick={() => setExpanded(v => !v)} className="px-0.5 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800">
            {expanded ? 'Mostrar menos' : `+ ${hidden} ${hidden === 1 ? 'organização' : 'organizações'}`}
          </button>
        </li>
      )}
    </ul>
  );
};

/** Conta Mãe: every person on the platform, their organization links and access. */
export const PlatformUsersPanel: React.FC = () => {
  const [items, setItems] = useState<PlatformUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [linking, setLinking] = useState<PlatformUser | null>(null);
  const [access, setAccess] = useState<{ tenant: Tenant; search: string } | null>(null);
  const [credentials, setCredentials] = useState<{ name: string; email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      setLoading(true);
      const res = await MasterApi.getUsersPage({ search: debounced, page, pageSize: PAGE_SIZE });
      if (mine !== seq.current) return;
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [debounced, page]);

  useEffect(() => { void load(); }, [load]);

  const resetPassword = async (u: PlatformUser) => {
    if (!confirm(`Gerar nova senha temporária para ${u.name}? Ela vale para TODAS as organizações da pessoa e encerra as sessões dela.`)) return;
    try {
      const res = await MasterApi.resetUserPassword(u.id);
      setCopied(false);
      setCredentials({ name: res.user.name, email: res.user.email, tempPassword: res.tempPassword });
    } catch (err: any) {
      alert(err.message || 'Erro ao redefinir a senha');
    }
  };

  const toggleActive = async (u: PlatformUser) => {
    if (!confirm(`${u.active ? 'Desativar' : 'Reativar'} ${u.name} em TODA a plataforma?`)) return;
    try {
      await MasterApi.updateUser(u.id, { active: !u.active });
      await load();
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar o status');
    }
  };

  const openOrg = async (tenantId: string, email: string) => {
    try {
      const page = await MasterApi.getTenantsPage({ search: '', pageSize: 100 });
      const tenant = page.items.find(t => t.id === tenantId);
      if (tenant) return setAccess({ tenant, search: email });
      alert('Organização não encontrada na lista. Abra-a pela tela Organizações.');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Usuários da plataforma</h1>
          <p className="text-xs text-slate-500">
            Cada pessoa tem uma conta única e pode ser vinculada a várias organizações, com perfil e permissões próprios em cada uma.
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Novo usuário
        </button>
      </div>

      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
          <span className="flex items-start gap-2"><Check className="w-4 h-4 shrink-0 mt-0.5" /> {notice}</span>
          <button onClick={() => setNotice(null)} className="font-semibold">OK</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Pessoas ({total})</span>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome ou e-mail (início)..."
              className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 w-64" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Pessoa</th>
                <th className="px-5 py-3">Organizações e perfis</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 hidden lg:table-cell">Último acesso</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={5} className="px-5 py-6 text-center text-xs text-slate-400">Carregando...</td></tr>}
              {!loading && items.length === 0 && <tr><td colSpan={5} className="px-5 py-6 text-center text-xs text-slate-400">Nenhum usuário encontrado.</td></tr>}
              {items.map(u => (
                <tr key={u.id} className="hover:bg-slate-50/70 align-top">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-slate-900">{u.name}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" /> {u.email}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <LinksCell links={u.links} onOpen={l => openOrg(l.tenantId, u.email)} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${u.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.active ? 'bg-emerald-500' : 'bg-slate-300'}`}></span> {u.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-400 font-mono hidden lg:table-cell">{u.lastLoginAt ? formatDateTimeSP(u.lastLoginAt) : '—'}</td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1.5">
                      <button onClick={() => setLinking(u)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 text-[11px] font-semibold inline-flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5" /> Vincular
                      </button>
                      <button onClick={() => resetPassword(u)} className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 text-[11px] font-semibold inline-flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5" /> Senha
                      </button>
                      <button onClick={() => toggleActive(u)} className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 ${u.active ? 'border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}>
                        <Power className="w-3.5 h-3.5" /> {u.active ? 'Desativar' : 'Reativar'}
                      </button>
                    </div>
                  </td>
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

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={async (res) => {
            setCreating(false);
            setCopied(false);
            setCredentials({ name: res.user.name, email: res.user.email, tempPassword: res.tempPassword });
            await load();
          }}
        />
      )}

      {linking && (
        <LinkModal
          user={linking}
          onClose={() => setLinking(null)}
          onLinked={async (msg) => { setLinking(null); setNotice(msg); await load(); }}
        />
      )}

      {access && <OrgAccessModal tenant={access.tenant} initialSearch={access.search} onClose={() => { setAccess(null); void load(); }} />}

      {credentials && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700"><KeyRound className="w-5 h-5" /></div>
                <div><h3 className="text-base font-bold text-slate-900">Senha temporária</h3><p className="text-xs text-slate-500">{credentials.name}</p></div>
              </div>
              <button onClick={() => setCredentials(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Fechar"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
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
                  try { await navigator.clipboard.writeText(`E-mail: ${credentials.email}\nSenha temporária: ${credentials.tempPassword}`); setCopied(true); } catch { /* clipboard unavailable */ }
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

const CreateUserModal: React.FC<{
  onClose: () => void;
  onCreated: (res: { user: PlatformUser; tempPassword: string }) => void | Promise<void>;
}> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<{ tenantId: string; profileId: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onCreated(await MasterApi.createUser({ name, email, ...(link ? { link } : {}) }));
    } catch (err: any) {
      setError(err.message || 'Não foi possível criar o usuário.');
      setSaving(false);
    }
  };

  const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
      <form onSubmit={submit} className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Novo usuário</h2>
          <p className="text-slate-500">Uma senha temporária é gerada e exibida uma única vez. O vínculo inicial com uma organização é opcional.</p>
        </div>
        {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">{error}</div>}
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="block font-semibold text-slate-700 mb-1">Nome completo</span>
            <input required className={input} value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="block"><span className="block font-semibold text-slate-700 mb-1">E-mail</span>
            <input required type="email" className={input} value={email} onChange={e => setEmail(e.target.value)} /></label>
        </div>
        <OrgProfilePicker onChange={setLink} />
        <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium">Cancelar</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold">
            {saving ? 'Criando...' : 'Criar usuário'}
          </button>
        </div>
      </form>
    </div>
  );
};

const LinkModal: React.FC<{
  user: PlatformUser;
  onClose: () => void;
  onLinked: (message: string) => void | Promise<void>;
}> = ({ user, onClose, onLinked }) => {
  const [link, setLink] = useState<{ tenantId: string; profileId: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!link) return;
    setSaving(true);
    setError(null);
    try {
      await MasterApi.membersOf(link.tenantId).createMember({ name: user.name, email: user.email, profileId: link.profileId });
      await onLinked(`${user.email} vinculado à organização (a senha atual foi mantida).`);
    } catch (err: any) {
      setError(err.message || 'Não foi possível vincular.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
      <form onSubmit={submit} className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 text-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Vincular a uma organização</h2>
          <p className="text-slate-500"><span className="font-semibold">{user.name}</span> ({user.email}) mantém a mesma senha. Depois do vínculo, ajuste exceções pela organização (clique no vínculo da pessoa).</p>
        </div>
        {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">{error}</div>}
        <OrgProfilePicker required onChange={setLink} />
        <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium">Cancelar</button>
          <button type="submit" disabled={saving || !link} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold">
            {saving ? 'Vinculando...' : 'Vincular'}
          </button>
        </div>
      </form>
    </div>
  );
};
