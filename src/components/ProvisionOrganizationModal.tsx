import React, { useState } from 'react';
import { Building2, Database, X, CheckCircle2, Sparkles, KeyRound, Copy, Check, AlertTriangle } from 'lucide-react';
import { MasterApi } from '../services/api.js';

export const ProvisionOrganizationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}> = ({ isOpen, onClose, onCreated }) => {

  const [name, setName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [slug, setSlug] = useState('');
  const [document, setDocument] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [plan, setPlan] = useState<'Starter' | 'Scale' | 'Enterprise'>('Scale');
  const [adminUserName, setAdminUserName] = useState('');
  const [adminUserEmail, setAdminUserEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ slug: string; name: string; email: string; tempPassword: string; linkedExisting: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const resetForm = () => {
    setName(''); setTradingName(''); setSlug(''); setDocument(''); setContactEmail('');
    setPlan('Scale'); setAdminUserName(''); setAdminUserEmail(''); setError(null);
    setCreated(null); setCopied(false);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]/g, '-')) {
      const generatedSlug = val.toLowerCase().trim().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      setSlug(generatedSlug);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug || !contactEmail) {
      setError('Por favor preencha os campos obrigatórios.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const res = await MasterApi.provisionTenant({
        name,
        tradingName: tradingName || name,
        slug,
        document: document || '00.000.000/0001-00',
        contactEmail,
        plan,
        adminUserName: adminUserName || 'Administrador',
        adminUserEmail: adminUserEmail || contactEmail
      });

      onCreated?.();
      setCreated({
        slug: res.tenant.slug,
        name: res.tenant.name,
        email: res.adminCredentials.email,
        tempPassword: res.adminCredentials.tempPassword,
        linkedExisting: res.adminCredentials.linkedExisting
      });
    } catch (err: any) {
      setError(err.message || 'Falha ao provisionar organização.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyCredentials = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(
        created.linkedExisting
          ? `Organização: ${created.slug}\nE-mail: ${created.email}\n(use a senha atual da conta)`
          : `Organização: ${created.slug}\nE-mail: ${created.email}\nSenha temporária: ${created.tempPassword}`
      );
      setCopied(true);
    } catch {
      // clipboard unavailable: the values are visible on screen
    }
  };

  const finish = () => {
    resetForm();
    onClose();
  };

  // Step 2: one-time credentials hand-over
  if (created) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
        <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Organização criada</h2>
              <p className="text-xs text-slate-500">{created.name}</p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <KeyRound className="w-4 h-4 text-indigo-600" /> Acesso do administrador
            </div>
            <div><span className="text-slate-500">Organização:</span> <span className="font-mono font-semibold">{created.slug}</span></div>
            <div><span className="text-slate-500">E-mail:</span> <span className="font-mono font-semibold">{created.email}</span></div>
            {created.linkedExisting ? (
              <div className="text-slate-600">Este e-mail já possuía conta: foi <strong>vinculado</strong> à organização e mantém a senha atual.</div>
            ) : (
              <div>
                <span className="text-slate-500">Senha temporária:</span>{' '}
                <span className="font-mono font-bold text-indigo-700 select-all">{created.tempPassword}</span>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Esta senha é exibida <strong>uma única vez</strong> e não pode ser recuperada. O administrador será
              obrigado a trocá-la no primeiro acesso. Se perder, gere outra no console (Redefinir senha do admin).
            </span>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={copyCredentials}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-2"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copiado' : 'Copiar acesso'}
            </button>
            <button
              onClick={finish}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md"
            >
              Concluir
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 p-6">

        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Criar Nova Organização (Cliente)</h2>
              <p className="text-xs text-slate-500">
                Cadastro na Conta Mãe com dados isolados por organização e administrador inicial
              </p>
            </div>
          </div>
          <button
            onClick={() => { resetForm(); onClose(); }}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div role="alert" className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Razão Social *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Ex: Nova Finanças S.A."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nome Fantasia</label>
              <input
                type="text"
                value={tradingName}
                onChange={(e) => setTradingName(e.target.value)}
                placeholder="Ex: NovaBank"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Identificador Único (slug) *</label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="novabank"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-sm focus:outline-hidden focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Usado no login da organização e no link do portal de vagas (<code className="font-mono">?tenant={slug || '...'}</code>)
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">CNPJ / Documento Fiscal</label>
              <input
                type="text"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email de Contato Institucional *</label>
              <input
                type="email"
                required
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="rh@novabank.com.br"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Plano de Subscrição</label>
              <select
                value={plan}
                onChange={(e: any) => setPlan(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
              >
                <option value="Starter">Starter (cota 1 GB)</option>
                <option value="Scale">Scale (cota 2 GB, retenção preditiva)</option>
                <option value="Enterprise">Enterprise (cota 4 GB, retenção preditiva)</option>
              </select>
            </div>
          </div>

          {/* Isolation info (read-only, truthful) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
              <Database className="w-4 h-4 text-indigo-600" />
              Isolamento de dados
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              A organização usa o Postgres compartilhado (Supabase) com isolamento lógico: todo registro carrega o
              identificador da organização, os vínculos entre tabelas só aceitam dados da mesma organização e o acesso
              direto pela API pública do banco é bloqueado.
            </p>
            <div className="p-2 rounded-lg bg-white border border-slate-200 font-mono text-[11px] text-slate-700">
              <span className="text-slate-400">Partição lógica:</span>{' '}
              <span className="text-indigo-600 font-semibold">tenant:{slug || 'slug'}</span>
            </div>
          </div>

          {/* Initial Admin User */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nome do Administrador Inicial</label>
              <input
                type="text"
                value={adminUserName}
                onChange={(e) => setAdminUserName(e.target.value)}
                placeholder="Ex: Mariana Santos"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email do Administrador Inicial</label>
              <input
                type="email"
                value={adminUserEmail}
                onChange={(e) => setAdminUserEmail(e.target.value)}
                placeholder="mariana@novabank.com.br"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">Uma senha temporária será gerada e exibida uma única vez.</p>
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => { resetForm(); onClose(); }}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-xs shadow-md transition-all flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {isSubmitting ? 'Criando organização...' : 'Confirmar e Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
