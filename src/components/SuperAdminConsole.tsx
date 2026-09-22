import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Building2,
  Database,
  ShieldCheck,
  Activity,
  HardDrive,
  Power,
  Search,
  RefreshCw,
  AlertTriangle,
  Lock,
  KeyRound,
  Copy,
  Check,
  X,
  PlusCircle,
  Pencil,
  Users,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { MasterApi } from '../services/api.js';
import { Tenant, SystemAuditLog } from '../types.js';
import { formatDateTimeSP } from '../utils/dateUtils.js';
import { OrganizationEditor } from './platform/OrganizationEditor.js';
import { OrgAccessModal } from './platform/OrgAccessModal.js';
import { ActionsMenu } from './platform/ActionsMenu.js';

export type PlatformSection = 'overview' | 'leads' | 'organizations' | 'users' | 'ai' | 'audit';

const STATUS_LABEL: Record<Tenant['status'], string> = {
  active: 'Ativo',
  suspended: 'Suspenso',
  maintenance: 'Manutenção',
  provisioning: 'Provisionando'
};

const CATEGORY: Record<SystemAuditLog['category'], { label: string; style: string }> = {
  SALES_CRM: { label: 'CRM Comercial', style: 'bg-orange-100 text-orange-800' },
  TENANT_ROUTING: { label: 'Roteamento de Tenant', style: 'bg-blue-100 text-blue-800' },
  DB_PROVISIONING: { label: 'Provisionamento', style: 'bg-purple-100 text-purple-800' },
  AI_EXECUTION: { label: 'Execução de IA', style: 'bg-emerald-100 text-emerald-800' },
  CANDIDATE_DATA: { label: 'Dados de candidatos', style: 'bg-cyan-100 text-cyan-800' },
  PEOPLE_DATA: { label: 'Dados de pessoas', style: 'bg-rose-100 text-rose-800' },
  ACCESS_CONTROL: { label: 'Segurança / Governança', style: 'bg-amber-100 text-amber-800' }
};

const AuditRow: React.FC<{ log: SystemAuditLog }> = ({ log }) => (
  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono text-xs">
    <div className="space-y-0.5 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${CATEGORY[log.category]?.style ?? 'bg-slate-100 text-slate-700'}`}>
          {CATEGORY[log.category]?.label ?? log.category}
        </span>
        <span className="font-bold text-slate-800">{log.action}</span>
        <span className="text-slate-400">• Por: {log.userName}</span>
      </div>
      <div className="text-slate-600 font-sans text-xs">{log.details}</div>
    </div>
    <div className="text-right shrink-0">
      <span className="text-[11px] text-slate-500 block" title="Horário Oficial de São Paulo - SP">
        {formatDateTimeSP(log.timestamp, true)} (SP)
      </span>
      <span className="text-[10px] text-indigo-600 font-semibold block">{log.databaseAffected}</span>
    </div>
  </div>
);

/** Platform (Conta Mãe) routines: overview, organization catalog and audit trail. No organization data lives here. */
const TENANT_PAGE_SIZE = 20;

export const SuperAdminConsole: React.FC<{
  section: PlatformSection;
  onOpenProvisionModal: () => void;
  onNavigate: (section: PlatformSection) => void;
  /** Bumped by the layout after an organization is created, to reload the catalog. */
  reloadKey: number;
}> = ({ section, onOpenProvisionModal, onNavigate, reloadKey }) => {
  const [telemetry, setTelemetry] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<SystemAuditLog[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantTotal, setTenantTotal] = useState(0);
  const [tenantPage, setTenantPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filterTerm, setFilterTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [auditTerm, setAuditTerm] = useState('');
  const [debouncedAudit, setDebouncedAudit] = useState('');
  const [auditCategory, setAuditCategory] = useState('');
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [managing, setManaging] = useState<Tenant | null>(null);
  const [resetResult, setResetResult] = useState<{ tenantName: string; slug: string; email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedTerm(filterTerm.trim()); setTenantPage(1); }, 300);
    return () => clearTimeout(t);
  }, [filterTerm]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAudit(auditTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [auditTerm]);

  // Each section loads only what it shows; lists are searched/paginated in the database
  const loadData = useCallback(async () => {
    const mine = ++seq.current;
    try {
      setLoading(true);
      if (section === 'overview') {
        const [tel, audit] = await Promise.all([MasterApi.getTelemetry(), MasterApi.getAuditLogs({ limit: 5 })]);
        if (mine !== seq.current) return;
        setTelemetry(tel);
        setAuditLogs(audit.logs);
      } else if (section === 'organizations') {
        const page = await MasterApi.getTenantsPage({ search: debouncedTerm, page: tenantPage, pageSize: TENANT_PAGE_SIZE });
        if (mine !== seq.current) return;
        setTenants(page.items);
        setTenantTotal(page.total);
      } else if (section === 'audit') {
        const audit = await MasterApi.getAuditLogs({ limit: 50, category: auditCategory, q: debouncedAudit });
        if (mine !== seq.current) return;
        setAuditLogs(audit.logs);
        setAuditCursor(audit.nextCursor);
      }
    } catch (err) {
      console.error('Failed to load platform data:', err);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [section, debouncedTerm, tenantPage, auditCategory, debouncedAudit]);

  useEffect(() => { void loadData(); }, [loadData, reloadKey]);

  const loadMoreAudit = async () => {
    if (!auditCursor) return;
    try {
      const audit = await MasterApi.getAuditLogs({ limit: 50, category: auditCategory, q: debouncedAudit, before: auditCursor });
      setAuditLogs(prev => [...prev, ...audit.logs]);
      setAuditCursor(audit.nextCursor);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResetAdminPassword = async (tenant: Tenant) => {
    if (!confirm(`Gerar nova senha temporária para o administrador de "${tenant.name}"? A senha atual deixará de funcionar.`)) return;
    try {
      setResetting(tenant.id);
      const res = await MasterApi.resetAdminPassword(tenant.id);
      setCopied(false);
      setResetResult({ tenantName: tenant.name, slug: tenant.slug, email: res.user.email, tempPassword: res.tempPassword });
    } catch (err: any) {
      alert(`Erro ao redefinir a senha: ${err.message}`);
    } finally {
      setResetting(null);
    }
  };

  const handleToggleStatus = async (tenant: Tenant) => {
    const suspending = tenant.status === 'active';
    if (suspending && !confirm(`Suspender "${tenant.name}"? Todos os usuários perdem o acesso imediatamente.`)) return;
    try {
      setStatusUpdating(tenant.id);
      await MasterApi.updateTenantStatus(tenant.id, suspending ? 'suspended' : 'active');
      await loadData();
    } catch (err: any) {
      alert(`Erro ao alterar status: ${err.message}`);
    } finally {
      setStatusUpdating(null);
    }
  };

  const refreshButton = (
    <button
      onClick={loadData}
      disabled={loading}
      className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200"
      title="Recarregar"
    >
      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
    </button>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ------------------------------------------------------------ Overview */}
      {section === 'overview' && (
        <>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Visão geral da plataforma</h1>
            <p className="text-xs text-slate-500">Indicadores globais de todas as organizações clientes.</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Building2, tone: 'text-indigo-600', label: 'Organizações', value: telemetry?.totalTenants ?? 0, sub: `${telemetry?.activeTenants ?? 0} ativas` },
              { icon: Database, tone: 'text-emerald-600', label: 'Isolamento lógico', value: telemetry?.activeIsolationEngines ?? 0, sub: 'Chaves compostas + RLS' },
              { icon: HardDrive, tone: 'text-cyan-600', label: 'Armazenamento (est.)', value: `${telemetry?.totalStorageUsedMb ?? 0} MB`, sub: `Cotas: ${((telemetry?.totalStorageMaxMb ?? 0) / 1024).toFixed(1)} GB` },
              { icon: Activity, tone: 'text-amber-600', label: 'Latência média', value: `${telemetry?.averageLatencyMs ?? 0} ms`, sub: `${telemetry?.totalQueriesPerMinute ?? 0} req/min` }
            ].map(card => (
              <div key={card.label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <card.icon className={`w-3.5 h-3.5 ${card.tone}`} /> {card.label}
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{card.value}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{card.sub}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Saúde por organização (janela de 60s)</h2>
              {refreshButton}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-3">Organização</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Requisições/min</th>
                    <th className="px-5 py-3">Latência</th>
                    <th className="px-5 py-3">Saúde</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(telemetry?.tenantBreakdowns ?? []).map((b: any) => (
                    <tr key={b.tenantId}>
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-900">{b.tenantName}</div>
                        <div className="text-[11px] font-mono text-slate-400">{b.slug}</div>
                      </td>
                      <td className="px-5 py-3 text-xs">{STATUS_LABEL[b.status as Tenant['status']] ?? b.status}</td>
                      <td className="px-5 py-3 text-xs font-mono">{b.telemetry.queriesPerMinute}</td>
                      <td className="px-5 py-3 text-xs font-mono">{b.telemetry.latencyMs} ms</td>
                      <td className="px-5 py-3 text-xs">
                        <span className={b.telemetry.status === 'healthy' ? 'text-emerald-700' : 'text-amber-700'}>
                          {b.telemetry.status === 'healthy' ? 'Saudável' : 'Degradada'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Últimos eventos de segurança e governança</h2>
              <button onClick={() => onNavigate('audit')} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                Ver auditoria completa
              </button>
            </div>
            {auditLogs.slice(0, 5).map(log => <AuditRow key={log.id} log={log} />)}
            {auditLogs.length === 0 && <p className="text-xs text-slate-400">Nenhum evento registrado.</p>}
          </div>
        </>
      )}

      {/* ------------------------------------------------------- Organizations */}
      {section === 'organizations' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-bold text-slate-900">Organizações clientes</h1>
              <p className="text-xs text-slate-500">
                Cadastro, plano, status e suporte de acesso. Os dados de cada organização ficam isolados e só são vistos por seus próprios usuários.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={filterTerm}
                  onChange={(e) => setFilterTerm(e.target.value)}
                  placeholder="Buscar por nome, slug ou e-mail..."
                  className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 w-56 sm:w-64"
                />
              </div>
              {refreshButton}
              <button
                onClick={onOpenProvisionModal}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" /> Criar Organização
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Organização / Razão Social</th>
                  <th className="px-5 py-3">Identificador</th>
                  <th className="px-5 py-3">Plano, módulos & armazenamento</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-3 sm:px-5 py-3 text-right sticky right-0 bg-slate-50 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.15)]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenants.map((tenant) => {
                  const isSuspended = tenant.status === 'suspended';
                  return (
                    <tr key={tenant.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{tenant.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">CNPJ: {tenant.document} • {tenant.contactEmail}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-mono text-xs font-semibold text-indigo-600">{tenant.slug}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Lock className="w-3 h-3 text-emerald-600" /> criada em {formatDateTimeSP(tenant.createdAt)}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          tenant.plan === 'Enterprise' ? 'bg-purple-100 text-purple-800' :
                          tenant.plan === 'Scale' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'
                        }`}>
                          {tenant.plan}
                        </span>
                        <div className="text-[11px] text-slate-500 mt-1">
                          {tenant.enabledRoutines.length} módulos • {tenant.dbConfig.storageUsedMb.toFixed(2)} / {tenant.dbConfig.maxStorageMb} MB
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          tenant.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${tenant.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                          {STATUS_LABEL[tenant.status]}
                        </span>
                      </td>
                      <td className="px-3 sm:px-5 py-3.5 text-right sticky right-0 bg-white shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.15)]">
                        <div className="flex items-center justify-end">
                          <ActionsMenu
                            label={`Ações de ${tenant.name}`}
                            items={[
                              { label: 'Editar organização', icon: Pencil, onClick: () => setEditing(tenant), title: 'Dados, plano, status e módulos liberados' },
                              { label: 'Usuários e acessos', icon: Users, onClick: () => setManaging(tenant), title: 'Vínculos, perfis e permissões desta organização' },
                              { label: 'Senha do administrador', icon: KeyRound, onClick: () => handleResetAdminPassword(tenant), disabled: resetting === tenant.id, title: 'Gera uma senha temporária para o administrador' },
                              {
                                label: isSuspended ? 'Reativar organização' : 'Suspender organização',
                                icon: Power,
                                onClick: () => handleToggleStatus(tenant),
                                disabled: statusUpdating === tenant.id,
                                danger: !isSuspended,
                                separated: true
                              }
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && tenants.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-xs text-slate-400">Nenhuma organização encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {tenantTotal > TENANT_PAGE_SIZE && (
            <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>{tenantTotal} organizações • página {tenantPage} de {Math.ceil(tenantTotal / TENANT_PAGE_SIZE)}</span>
              <div className="flex gap-2">
                <button disabled={tenantPage <= 1} onClick={() => setTenantPage(p => p - 1)} className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50" aria-label="Página anterior"><ChevronLeft className="w-4 h-4" /></button>
                <button disabled={tenantPage >= Math.ceil(tenantTotal / TENANT_PAGE_SIZE)} onClick={() => setTenantPage(p => p + 1)} className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50" aria-label="Próxima página"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------- Audit */}
      {section === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700"><ShieldCheck className="w-4 h-4" /></div>
              <div>
                <h1 className="text-sm font-bold text-slate-900">Auditoria de segurança e governança</h1>
                <p className="text-xs text-slate-500">Logins, provisionamento, mudanças de acesso e ações da Conta Mãe</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={auditCategory}
                onChange={(e) => setAuditCategory(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:border-indigo-500"
              >
                <option value="">Todas as categorias</option>
                {Object.entries(CATEGORY).map(([key, c]) => <option key={key} value={key}>{c.label}</option>)}
              </select>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={auditTerm}
                  onChange={(e) => setAuditTerm(e.target.value)}
                  placeholder="Ação, usuário ou detalhe..."
                  className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 w-56"
                />
              </div>
              {refreshButton}
            </div>
          </div>
          <div className="text-xs font-mono text-slate-400">{auditLogs.length} eventos carregados{auditCursor ? ' (há mais)' : ''}</div>
          <div className="space-y-2.5 max-h-[65vh] overflow-y-auto">
            {auditLogs.map(log => <AuditRow key={log.id} log={log} />)}
            {auditCursor && (
              <button onClick={loadMoreAudit} className="w-full py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">Carregar mais</button>
            )}
          </div>
        </div>
      )}

      {editing && (
        <OrganizationEditor tenant={editing} onClose={() => setEditing(null)} onSaved={() => void loadData()} />
      )}
      {managing && <OrgAccessModal tenant={managing} onClose={() => setManaging(null)} />}

      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700"><KeyRound className="w-5 h-5" /></div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Nova senha temporária</h3>
                  <p className="text-xs text-slate-500">{resetResult.tenantName}</p>
                </div>
              </div>
              <button onClick={() => setResetResult(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
              <div><span className="text-slate-500">Organização:</span> <span className="font-mono font-semibold">{resetResult.slug}</span></div>
              <div><span className="text-slate-500">E-mail:</span> <span className="font-mono font-semibold">{resetResult.email}</span></div>
              <div><span className="text-slate-500">Senha temporária:</span> <span className="font-mono font-bold text-indigo-700 select-all">{resetResult.tempPassword}</span></div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Exibida uma única vez. O administrador será obrigado a trocá-la no próximo acesso e todas as sessões dele foram encerradas.</span>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`Organização: ${resetResult.slug}\nE-mail: ${resetResult.email}\nSenha temporária: ${resetResult.tempPassword}`);
                    setCopied(true);
                  } catch { /* clipboard unavailable */ }
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-2"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado' : 'Copiar acesso'}
              </button>
              <button onClick={() => setResetResult(null)} className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
