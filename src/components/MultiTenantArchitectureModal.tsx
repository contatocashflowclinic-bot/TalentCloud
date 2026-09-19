import React from 'react';
import { Cpu, Database, KeyRound, Layers, Lock, Network, Route, ShieldCheck, Timer, X } from 'lucide-react';
import { useTenant } from '../context/TenantContext.js';
import { formatDateTimeSP } from '../utils/dateUtils.js';

export const MultiTenantArchitectureModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { activeTenant, telemetry, routingResolution } = useTenant();

  if (!isOpen) return null;

  const statusItems = [
    {
      label: 'Tenant ativo',
      value: activeTenant?.name || 'Visão da plataforma',
      detail: activeTenant?.id ? `ID ${activeTenant.id}` : 'Aguardando resolucao',
      icon: Network,
    },
    {
      label: 'Particao de dados',
      value: activeTenant?.dbConfig?.dbName || 'Postgres compartilhado',
      detail: activeTenant?.dbConfig?.host || 'Banco compartilhado com filtros por tenant',
      icon: Database,
    },
    {
      label: 'Pool e latencia',
      value: `${telemetry?.latencyMs ?? 0} ms`,
      detail: `${telemetry?.activeConnections ?? 0}/${activeTenant?.dbConfig?.maxPoolSize ?? 0} conexoes ativas`,
      icon: Timer,
    },
  ];

  const flowSteps = [
    {
      number: '1',
      title: 'Requisicao',
      color: 'bg-blue-600',
      border: 'border-blue-100',
      bg: 'bg-blue-50/40',
      text: 'O cliente envia a sessao e, quando aplicavel, o slug da organizacao.',
      detail: 'Authorization (a organização vem da sessão)',
    },
    {
      number: '2',
      title: 'Resolucao',
      color: 'bg-indigo-600',
      border: 'border-indigo-100',
      bg: 'bg-indigo-50/50',
      text: 'O middleware valida usuario, status e permissao no catalogo mestre.',
      detail: 'Dynamic Resolver',
    },
    {
      number: '3',
      title: 'Roteamento',
      color: 'bg-amber-600',
      border: 'border-amber-100',
      bg: 'bg-amber-50/50',
      text: 'O servidor entrega um repositorio ja restrito ao tenant resolvido.',
      detail: 'TenantConnectionRouter',
    },
    {
      number: '4',
      title: 'Isolamento',
      color: 'bg-emerald-600',
      border: 'border-emerald-100',
      bg: 'bg-emerald-50/60',
      text: 'As consultas usam tenant_id, chaves compostas e regras RLS no banco.',
      detail: 'Somente API servidor',
    },
  ];

  const principles = [
    {
      title: 'Isolamento logico',
      text: 'Cada linha carrega tenant_id e fica protegida por filtros do servidor, RLS e criptografia do provedor.',
      icon: Lock,
    },
    {
      title: 'Conta mae',
      text: 'SuperAdmin cria tenants, controla acessos, status, auditoria e consumo por organizacao.',
      icon: Layers,
    },
    {
      title: 'IA por tenant',
      text: 'As avaliacoes usam apenas o DNA cultural e os cargos da organizacao ativa. A decisao final e humana.',
      icon: Cpu,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200">
        <div className="flex items-start justify-between gap-4 px-5 py-5 sm:px-6 border-b border-slate-100">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100 shrink-0">
              <Network className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">Arquitetura Multi-Tenancy</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Roteamento dinamico e isolamento de dados por organizacao.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <div className="rounded-2xl bg-slate-950 text-white shadow-inner overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b border-white/10 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold uppercase tracking-wide">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Roteamento em tempo real
              </span>
              <span className="font-mono text-[11px]" title="Fuso horario oficial: America/Sao Paulo">
                SP {formatDateTimeSP(new Date(), true)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
              {statusItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="p-4 min-w-0">
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </div>
                    <div className="mt-2 font-semibold text-sm text-white truncate" title={item.value}>
                      {item.value}
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-slate-400 break-words [overflow-wrap:anywhere]" title={item.detail}>
                      {item.detail}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 bg-white/[0.04] border-t border-white/10 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Route className="w-4 h-4 text-amber-300 shrink-0" />
                <span className="text-slate-400">Estrategia</span>
                <span className="font-mono font-semibold text-amber-200 truncate">
                  {routingResolution?.strategy || 'Indefinida'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-emerald-300 min-w-0">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span className="truncate">Chaves compostas + RLS</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            Fluxo da camada de abstracao
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {flowSteps.map((step) => (
              <div key={step.number} className={`p-4 rounded-xl border ${step.border} ${step.bg} min-w-0`}>
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-lg ${step.color} text-white flex items-center justify-center font-bold text-xs shrink-0`}>
                    {step.number}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-900 text-sm">{step.title}</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{step.text}</p>
                    <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md bg-white/70 px-2 py-1 text-[11px] font-mono text-slate-700 border border-white/80">
                      <KeyRound className="w-3 h-3 shrink-0" />
                      <span className="truncate" title={step.detail}>{step.detail}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 mx-5 sm:mx-6 pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {principles.map((principle) => {
            const Icon = principle.icon;
            return (
              <div key={principle.title} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 min-w-0">
                <Icon className="w-[18px] h-[18px] text-indigo-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h5 className="font-semibold text-slate-900 text-sm">{principle.title}</h5>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{principle.text}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-5 sm:px-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Fechar Console
          </button>
        </div>
      </div>
    </div>
  );
};
