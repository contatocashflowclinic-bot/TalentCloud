import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Shield, Check, Mail, Briefcase, Lock, Database, KeyRound, Copy, AlertTriangle } from 'lucide-react';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { TenantUser, UserRole } from '../../types.js';
import { formatDateTimeSP } from '../../utils/dateUtils.js';

export const ModuleUsers: React.FC = () => {
  const { activeTenant, currentRole } = useTenant();
  const canManage = currentRole === 'ORG_ADMIN' || currentRole === 'SUPER_ADMIN';
  const [credentials, setCredentials] = useState<{ name: string; email: string; tempPassword: string; reset: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('RECRUITER');
  const [jobTitle, setJobTitle] = useState('');

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await TenantApi.getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [activeTenant?.id]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;
    try {
      const created = await TenantApi.createUser({
        name,
        email,
        role,
        jobTitle: jobTitle || 'Colaborador',
      });
      setCopied(false);
      setCredentials({ name: created.user.name, email: created.user.email, tempPassword: created.tempPassword, reset: false });
      setName('');
      setEmail('');
      setJobTitle('');
      setIsModalOpen(false);
      await loadUsers();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar usuário');
    }
  };

  const handleResetPassword = async (u: TenantUser) => {
    if (!confirm(`Gerar nova senha temporária para ${u.name}? A senha atual deixará de funcionar e as sessões dele serão encerradas.`)) return;
    try {
      const res = await TenantApi.resetUserPassword(u.id);
      setCopied(false);
      setCredentials({ name: res.user.name, email: res.user.email, tempPassword: res.tempPassword, reset: true });
    } catch (err: any) {
      alert(err.message || 'Erro ao redefinir a senha');
    }
  };

  const getRoleBadge = (r: UserRole) => {
    switch (r) {
      case 'SUPER_ADMIN':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">SuperAdmin</span>;
      case 'ORG_ADMIN':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">Admin Org</span>;
      case 'RECRUITER':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">Recrutador</span>;
      case 'HIRING_MANAGER':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">Gestor da Vaga</span>;
      case 'COLLABORATOR':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800">Colaborador</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800">Entrevistador</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Módulo 2</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs font-mono text-slate-500">Partição: {activeTenant?.dbConfig?.dbName}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mt-1">Usuários e Permissões (RBAC)</h1>
          <p className="text-xs text-slate-500">
            Controle de acessos e papéis. Senhas são guardadas apenas como hash e cada usuário só acessa a própria organização.
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-2 self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            Convidar Usuário
          </button>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Usuários Cadastrados ({users.length})
          </span>
          <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
            <Lock className="w-3 h-3" /> Criptografia em repouso ativa
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Nome / Identificação</th>
                <th className="px-5 py-3">Papel de Acesso (RBAC)</th>
                <th className="px-5 py-3">Cargo</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Último Acesso</th>
                {canManage && <th className="px-5 py-3 text-right">Acesso</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-slate-900">{u.name}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <Mail className="w-3 h-3" /> {u.email}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">{getRoleBadge(u.role)}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-700">{u.jobTitle}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${u.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.active ? 'bg-emerald-500' : 'bg-slate-300'}`}></span> {u.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-400 font-mono" title="Horário de São Paulo - SP">
                    {u.lastLoginAt ? formatDateTimeSP(u.lastLoginAt) : '—'}
                  </td>
                  {canManage && (
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleResetPassword(u)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 text-[11px] font-semibold inline-flex items-center gap-1.5"
                        title="Gerar nova senha temporária"
                      >
                        <KeyRound className="w-3.5 h-3.5" /> Redefinir senha
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-slate-200 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">Convidar Novo Usuário</h3>
            <p className="text-xs text-slate-500 mb-4">
              O usuário será criado na organização <span className="font-semibold">{activeTenant?.name}</span> com uma senha temporária, exibida uma única vez.
            </p>

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Carlos Silva"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email Corporativo</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="carlos@empresa.com.br"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cargo</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Ex: Tech Recruiter Senior"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Papel (Role)</label>
                <select
                  value={role}
                  onChange={(e: any) => setRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="RECRUITER">Recrutador / Talent Acquisition</option>
                  <option value="HIRING_MANAGER">Gestor da Vaga / Squad Lead</option>
                  <option value="ORG_ADMIN">Administrador da Organização</option>
                  <option value="INTERVIEWER">Entrevistador Técnico</option>
                  <option value="COLLABORATOR">Colaborador</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs transition-colors"
                >
                  Salvar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700"><KeyRound className="w-5 h-5" /></div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{credentials.reset ? 'Nova senha temporária' : 'Usuário criado'}</h3>
                <p className="text-xs text-slate-500">{credentials.name}</p>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
              <div><span className="text-slate-500">Organização:</span> <span className="font-mono font-semibold">{activeTenant?.slug}</span></div>
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
                    await navigator.clipboard.writeText(`Organização: ${activeTenant?.slug}\nE-mail: ${credentials.email}\nSenha temporária: ${credentials.tempPassword}`);
                    setCopied(true);
                  } catch { /* clipboard unavailable */ }
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-2"
              >
                <Copy className="w-4 h-4" /> {copied ? 'Copiado' : 'Copiar acesso'}
              </button>
              <button onClick={() => setCredentials(null)} className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
