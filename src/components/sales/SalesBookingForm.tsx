import React, { useState } from 'react';
import { CalendarDays, CheckCircle2, Loader2 } from 'lucide-react';
import { PublicSalesApi, type DemoRequestInput } from '../../services/api.js';

const initial: DemoRequestInput = { name: '', email: '', phone: '', company: '', roleTitle: '', employeeRange: '', pain: '', painDetails: '', preferredDate: '', preferredPeriod: 'morning', consent: false, website: '' };
const field = 'mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400';
const PAINS = [
  ['hiring', 'Demoramos para contratar'], ['consistency', 'Cada gestor conduz a selecao de um jeito'],
  ['development', 'Nao consigo acompanhar o desenvolvimento'], ['retention', 'Estamos perdendo bons profissionais'],
  ['scattered_data', 'As informacoes estao espalhadas'], ['indicators', 'Faltam indicadores para decidir'], ['other', 'Outro desafio']
] as const;

export const SalesBookingForm: React.FC = () => {
  const [form, setForm] = useState(initial);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof DemoRequestInput, value: string | boolean) => setForm(prev => ({ ...prev, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setSending(true);
    try { await PublicSalesApi.requestDemo(form); setSent(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Nao foi possivel enviar. Tente novamente.'); }
    finally { setSending(false); }
  };
  if (sent) return <div className='py-10 text-center'><CheckCircle2 className='mx-auto h-12 w-12 text-emerald-400' /><h3 className='mt-5 text-2xl font-bold'>Solicitacao recebida!</h3><p className='mt-3 text-sm leading-6 text-slate-300'>Nossa equipe vai confirmar o melhor horario pelos seus canais de contato.</p></div>;
  return (
    <form onSubmit={submit} className='mt-7 space-y-4' aria-label='Agendar demonstracao'>
      <input value={form.website} onChange={e => set('website', e.target.value)} tabIndex={-1} autoComplete='off' className='hidden' aria-hidden='true' />
      <div className='grid gap-4 sm:grid-cols-2'>
        <label className='text-xs font-semibold text-slate-300'>Seu nome<input required maxLength={120} value={form.name} onChange={e => set('name', e.target.value)} className={field} placeholder='Como podemos chamar voce?' /></label>
        <label className='text-xs font-semibold text-slate-300'>Empresa<input required maxLength={160} value={form.company} onChange={e => set('company', e.target.value)} className={field} placeholder='Nome da empresa' /></label>
        <label className='text-xs font-semibold text-slate-300'>E-mail corporativo<input required type='email' value={form.email} onChange={e => set('email', e.target.value)} className={field} placeholder='voce@empresa.com.br' /></label>
        <label className='text-xs font-semibold text-slate-300'>WhatsApp / telefone<input required type='tel' value={form.phone} onChange={e => set('phone', e.target.value)} className={field} placeholder='(11) 99999-9999' /></label>
        <label className='text-xs font-semibold text-slate-300'>Seu cargo<input required maxLength={120} value={form.roleTitle} onChange={e => set('roleTitle', e.target.value)} className={field} placeholder='Ex.: Head de Pessoas' /></label>
        <label className='text-xs font-semibold text-slate-300'>Colaboradores<select required value={form.employeeRange} onChange={e => set('employeeRange', e.target.value)} className={field}><option value=''>Selecione</option>{['1-20','21-50','51-100','101-250','251-500','500+'].map(v => <option key={v}>{v}</option>)}</select></label>
      </div>
      <label className='block text-xs font-semibold text-slate-300'>Principal desafio<select required value={form.pain} onChange={e => set('pain', e.target.value)} className={field}><option value=''>Escolha a dor mais urgente</option>{PAINS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className='block text-xs font-semibold text-slate-300'>Conte um pouco mais <span className='font-normal text-slate-500'>(opcional)</span><textarea maxLength={1500} rows={3} value={form.painDetails} onChange={e => set('painDetails', e.target.value)} className={field} placeholder='O que acontece hoje e o que voce gostaria de melhorar?' /></label>
      <div className='grid gap-4 sm:grid-cols-2'>
        <label className='text-xs font-semibold text-slate-300'>Melhor data<input required type='date' min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={form.preferredDate} onChange={e => set('preferredDate', e.target.value)} className={field} /></label>
        <label className='text-xs font-semibold text-slate-300'>Melhor periodo<select value={form.preferredPeriod} onChange={e => set('preferredPeriod', e.target.value)} className={field}><option value='morning'>Manha, 9h as 12h</option><option value='afternoon'>Tarde, 13h as 18h</option></select></label>
      </div>
      <label className='flex items-start gap-3 text-xs leading-5 text-slate-400'><input required type='checkbox' checked={form.consent} onChange={e => set('consent', e.target.checked)} className='mt-1 h-4 w-4 accent-indigo-500' /><span>Concordo em receber contato da equipe Vertice 360 sobre esta demonstracao.</span></label>
      {error && <p role='alert' className='rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-300'>{error}</p>}
      <button disabled={sending} className='flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3.5 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60'>{sending ? <Loader2 className='h-4 w-4 animate-spin' /> : <CalendarDays className='h-4 w-4' />}{sending ? 'Enviando...' : 'Solicitar minha demonstracao'}</button>
    </form>
  );
};
