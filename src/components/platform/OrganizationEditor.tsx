import React, { useState } from 'react';
import { Lock, RotateCcw, X } from 'lucide-react';
import { CORE_ROUTINES, PLAN_ROUTINES, ROUTINES } from '../../access.js';
import { MasterApi } from '../../services/api.js';
import { Tenant } from '../../types.js';

const PLANS: Tenant['plan'][] = ['Starter', 'Scale', 'Enterprise'];
const STATUSES: Array<{ id: Tenant['status']; label: string }> = [
  { id: 'active', label: 'Ativo' },
  { id: 'maintenance', label: 'Manutenção' },
  { id: 'suspended', label: 'Suspenso (bloqueia todos os usuários)' }
];

/** Edit registration data, plan, status and the modules (routines) an organization may use. */
export const OrganizationEditor: React.FC<{
  tenant: Tenant;
  onClose: () => void;
  onSaved: () => void;
}> = ({ tenant, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: tenant.name,
    tradingName: tenant.tradingName,
    document: tenant.document,
    contactEmail: tenant.contactEmail,
    logoUrl: tenant.logoUrl ?? '',
    plan: tenant.plan,
    status: tenant.status
  });
  const [routines, setRoutines] = useState<string[]>(tenant.enabledRoutines);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (keys: string[]) => {
    const on = keys.every(k => routines.includes(k));
    setRoutines(on ? routines.filter(r => !keys.includes(r)) : [...new Set([...routines, ...keys])]);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await MasterApi.updateTenant(tenant.id, {
        name: form.name,
        tradingName: form.tradingName,
        document: form.document,
        contactEmail: form.contactEmail,
        logoUrl: form.logoUrl,
        plan: form.plan,
        enabledRoutines: routines
      });
      if (form.status !== tenant.status) await MasterApi.updateTenantStatus(tenant.id, form.status);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar a organização.');
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500';
  // one row per sidebar module; Usuários + Perfis travel together and are always on
  const rows = [
    { label: 'Usuários e Permissões', description: 'Usuários, vínculos e perfis de acesso da organização.', keys: CORE_ROUTINES, core: true },
    ...ROUTINES.filter(r => !CORE_ROUTINES.includes(r.key)).map(r => ({ label: r.label, description: r.description, keys: [r.key], core: false }))
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
      <form onSubmit={save} className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-5 text-xs">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Editar organização</h2>
            <p className="text-slate-500 font-mono">{tenant.slug} <span className="font-sans">(identificador não editável)</span></p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>

        {error && <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">{error}</div>}

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="block font-semibold text-slate-700 mb-1">Razão social</span>
            <input required className={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <label className="block"><span className="block font-semibold text-slate-700 mb-1">Nome fantasia</span>
            <input required className={input} value={form.tradingName} onChange={e => setForm({ ...form, tradingName: e.target.value })} /></label>
          <label className="block"><span className="block font-semibold text-slate-700 mb-1">CNPJ / documento</span>
            <input required className={input} value={form.document} onChange={e => setForm({ ...form, document: e.target.value })} /></label>
          <label className="block"><span className="block font-semibold text-slate-700 mb-1">E-mail de contato</span>
            <input required type="email" className={input} value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })} /></label>
          <label className="block sm:col-span-2"><span className="block font-semibold text-slate-700 mb-1">URL do logo (opcional)</span>
            <input className={input} value={form.logoUrl} placeholder="https://..." onChange={e => setForm({ ...form, logoUrl: e.target.value })} /></label>
          <label className="block"><span className="block font-semibold text-slate-700 mb-1">Plano</span>
            <select className={`${input} bg-white`} value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value as Tenant['plan'] })}>
              {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
            </select></label>
          <label className="block"><span className="block font-semibold text-slate-700 mb-1">Status</span>
            <select className={`${input} bg-white`} value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Tenant['status'] })}>
              {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              {form.status === 'provisioning' && <option value="provisioning">Provisionando</option>}
            </select></label>
        </div>

        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-slate-800 text-sm">Módulos liberados para a organização</div>
              <p className="text-slate-500">
                Vale para todos os usuários dela: mesmo que um perfil tenha a permissão, o módulo bloqueado não aparece nem responde.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRoutines(PLAN_ROUTINES[form.plan])}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold flex items-center gap-1.5"
              title={`Restaura os módulos padrão do plano ${form.plan}`}
            >
              <RotateCcw className="w-3.5 h-3.5" /> Padrão do plano {form.plan}
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {rows.map(row => {
              const on = row.keys.every(k => routines.includes(k));
              return (
                <label key={row.label} className={`flex items-start gap-2.5 p-3 rounded-xl border ${on ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200'} ${row.core ? 'opacity-90' : 'cursor-pointer'}`}>
                  <input type="checkbox" checked={on} disabled={row.core} onChange={() => toggle(row.keys)} className="w-4 h-4 mt-0.5 accent-indigo-600" />
                  <span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1">{row.label}{row.core && <Lock className="w-3 h-3 text-slate-400" />}</span>
                    <span className="block text-[11px] text-slate-500 leading-tight">{row.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium">Cancelar</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold">
            {saving ? 'Salvando...' : 'Salvar organização'}
          </button>
        </div>
      </form>
    </div>
  );
};
