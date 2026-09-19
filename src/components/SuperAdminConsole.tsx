import React, { useState, useEffect } from 'react';
import {
  Building2,
  Database,
  PlusCircle,
  ShieldCheck,
  Activity,
  HardDrive,
  Cpu,
  Power,
  ExternalLink,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Server,
  Layers,
  KeyRound,
  Copy,
  Check,
  X
} from 'lucide-react';
import { useTenant } from '../context/TenantContext.js';
import { MasterApi } from '../services/api.js';
import { Tenant, SystemAuditLog, DatabaseConfig } from '../types.js';
import { formatDateTimeSP } from '../utils/dateUtils.js';

export const SuperAdminConsole: React.FC<{
  onOpenProvisionModal: () => void;
  onOpenArchitectureModal: () => void;
}> = ({ onOpenProvisionModal, onOpenArchitectureModal }) => {
  const { allTenants, switchTenant, refreshTenants } = useTenant();
  const [telemetry, setTelemetry] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<SystemAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterTerm, setFilterTerm] = useState('');
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{
    tenantName: string;
    slug: string;
    email: string;
    tempPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

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

  const loadData = async () => {
    try {
      setLoading(true);
      const [tel, logs] = await Promise.all([
        MasterApi.getTelemetry(),
        MasterApi.getAuditLogs()
      ]);
      setTelemetry(tel);
      setAuditLogs(logs);
      await refreshTenants();
    } catch (err) {
      console.error('Failed to load SuperAdmin telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleStatus = async (tenant: Tenant) => {
    try {
      setStatusUpdating(tenant.id);
      const newStatus = tenant.status === 'active' ? 'suspended' : 'active';
      await MasterApi.updateTenantStatus(tenant.id, newStatus);
      await loadData();
    } catch (err: any) {
      alert(`Erro ao alterar status: ${err.message}`);
    } finally {
      setStatusUpdating(null);
    }
  };

  const filteredTenants = allTenants.filter(t => 
    t.name.toLowerCase().includes(filterTerm.toLowerCase()) ||
    t.slug.toLowerCase().includes(filterTerm.toLowerCase()) ||
    t.dbConfig.dbName.toLowerCase().includes(filterTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      
      {/* Top Banner Conta Mãe */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                Conta Mãe • SuperAdmin
              </span>
              <span className="text-xs text-slate-400">• Multi-Organizações com isolamento lógico de dados</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Gestão Global de Organizações & Roteamento Dinâmico
            </h1>
            <p className="text-sm text-slate-300 max-w-3xl">
              Ambiente de controle mestre para criar organizações clientes, gerenciar acessos e status, auditar a segurança entre empresas e acompanhar o consumo de dados de cada tenant.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onOpenArchitectureModal}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-2"
            >
              <Cpu className="w-4 h-4 text-indigo-400" />
              Ver Arquitetura
            </button>
            <button
              onClick={onOpenProvisionModal}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-900/30 transition-all flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              Criar Organização
            </button>
          </div>
        </div>

        {/* Global Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800">
          <div>
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              Total de Organizações
            </div>
            <div className="text-2xl font-bold text-white mt-1">
              {telemetry?.totalTenants ?? allTenants.length}
            </div>
            <div className="text-[11px] text-emerald-400 mt-0.5">
              {telemetry?.activeTenants ?? allTenants.filter(t => t.status === 'active').length} ativas
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              Organizações Isoladas
            </div>
            <div className="text-2xl font-bold text-emerald-300 mt-1">
              {telemetry?.activeIsolationEngines ?? allTenants.length}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" /> Chaves compostas + RLS no banco
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              Armazenamento Usado (estimado)
            </div>
            <div className="text-2xl font-bold text-white mt-1">
              {telemetry?.totalStorageUsedMb ?? 0} <span className="text-xs text-slate-400 font-normal">MB</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Cotas dos planos: {((telemetry?.totalStorageMaxMb ?? 0) / 1024).toFixed(1)} GB
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              Latência Média do Roteador
            </div>
            <div className="text-2xl font-bold text-amber-300 mt-1">
              {telemetry?.averageLatencyMs ?? 0} <span className="text-xs text-slate-400 font-normal">ms</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {telemetry?.totalQueriesPerMinute ?? 0} req/minuto (última janela de 60s)
            </div>
          </div>
        </div>
      </div>

      {/* Tenants Table & Management */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Catálogo Mestre de Tenants Provisionados</h2>
            <p className="text-xs text-slate-500">
              Cada organização só enxerga os próprios dados: o banco recusa vínculos entre organizações diferentes
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                placeholder="Buscar por nome ou slug..."
                className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500 w-56 sm:w-64"
              />
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200"
              title="Recarregar catálogo"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Organização / Razão Social</th>
                <th className="px-5 py-3">Roteamento & Partição</th>
                <th className="px-5 py-3">Hospedagem</th>
                <th className="px-5 py-3">Plano & Armazenamento</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTenants.map((tenant) => {
                const isSuspended = tenant.status === 'suspended';
                return (
                  <tr key={tenant.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{tenant.name}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>CNPJ: {tenant.document}</span>
                        <span>•</span>
                        <span>{tenant.contactEmail}</span>
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-800">
                        <Database className="w-3.5 h-3.5 text-indigo-600" />
                        {tenant.dbConfig.dbName}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        Routing Slug: <span className="text-indigo-600 font-semibold">{tenant.slug}</span>
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="text-xs font-medium text-slate-800">{tenant.dbConfig.host}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Lock className="w-3 h-3 text-emerald-600" />
                        {tenant.dbConfig.encryptionKeyId}
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
                        {tenant.dbConfig.storageUsedMb.toFixed(2)} MB / {tenant.dbConfig.maxStorageMb} MB (cota do plano)
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        tenant.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${tenant.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                        {{ active: 'Ativo', suspended: 'Suspenso', maintenance: 'Manutenção', provisioning: 'Provisionando' }[tenant.status]}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Switch/Impersonate Connection */}
                        <button
                          onClick={() => switchTenant(tenant.slug)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
                          title="Abrir os dados desta organização (o acesso fica registrado na auditoria)"
                        >
                          Conectar
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleResetAdminPassword(tenant)}
                          disabled={resetting === tenant.id}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                          title="Redefinir senha do administrador da organização"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>

                        {/* Toggle Status */}
                        <button
                          onClick={() => handleToggleStatus(tenant)}
                          disabled={statusUpdating === tenant.id}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            isSuspended
                              ? 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                              : 'text-slate-400 border-slate-200 hover:text-rose-600 hover:bg-rose-50'
                          }`}
                          title={isSuspended ? 'Reativar Organização' : 'Suspender Acesso'}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* System Audit Logs (Rastreabilidade & Isolamento de Dados) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Registro de Auditoria de Roteamento & Segurança</h3>
              <p className="text-xs text-slate-500">Rastreabilidade completa de conexões entre tenants e provisionamento</p>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-400">Total: {auditLogs.length} eventos auditados</span>
        </div>

        <div className="space-y-2.5 max-h-64 overflow-y-auto font-mono text-xs">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    log.category === 'TENANT_ROUTING' ? 'bg-blue-100 text-blue-800' :
                    log.category === 'DB_PROVISIONING' ? 'bg-purple-100 text-purple-800' :
                    log.category === 'AI_EXECUTION' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {log.category === 'TENANT_ROUTING' ? 'Roteamento de Tenant' :
                     log.category === 'DB_PROVISIONING' ? 'Provisionamento de Banco' :
                     log.category === 'AI_EXECUTION' ? 'Execução de IA' : 'Segurança / Governança'}
                  </span>
                  <span className="font-bold text-slate-800">{log.action}</span>
                  <span className="text-slate-400">• Por: {log.userName}</span>
                </div>
                <div className="text-slate-600 font-sans text-xs">{log.details}</div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[11px] text-slate-500 block font-mono" title="Horário Oficial de São Paulo - SP">
                  {formatDateTimeSP(log.timestamp, true)} (SP)
                </span>
                <span className="text-[10px] text-indigo-600 font-semibold block">{log.databaseAffected}</span>
              </div>
            </div>
          ))}
        </div>
      </div>


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
