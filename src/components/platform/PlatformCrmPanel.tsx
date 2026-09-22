import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Mail, Phone, RefreshCw, Search, UsersRound } from 'lucide-react';
import { MasterApi } from '../../services/api.js';
import type { SalesLead, SalesLeadStatus } from '../../types.js';

const STATUS: Record<SalesLeadStatus, string> = { new: 'Novo', contacted: 'Contatado', scheduled: 'Agendado', qualified: 'Qualificado', won: 'Convertido', lost: 'Perdido' };
const PAIN: Record<string, string> = { hiring: 'Contratacao lenta', consistency: 'Processo inconsistente', development: 'Desenvolvimento', retention: 'Retencao', scattered_data: 'Dados espalhados', indicators: 'Falta de indicadores', other: 'Outro desafio' };

export const PlatformCrmPanel: React.FC = () => {
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<SalesLead | null>(null);
  const [status, setStatus] = useState('');
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const data = await MasterApi.getLeads({ status, q: term, pageSize: 100 }); setLeads(data.items); setCounts(data.counts); } catch (err) { setError(err instanceof Error ? err.message : 'Nao foi possivel carregar o CRM.'); } finally { setLoading(false); } }, [status, term]);
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load]);
  const save = async () => {
    if (!selected) return; setSaving(true);
    try { const lead = await MasterApi.updateLead(selected.id, { status: selected.status, commercialNotes: selected.commercialNotes, nextFollowUpAt: selected.nextFollowUpAt, assignedTo: selected.assignedTo }); setSelected(lead); await load(); }
    finally { setSaving(false); }
  };
  if (error) return <div className='rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700'>{error} <button onClick={() => void load()} className='ml-2 font-bold underline'>Tentar novamente</button></div>;
  return (
    <div className='space-y-6'>
      <div className='flex flex-col justify-between gap-4 sm:flex-row sm:items-end'><div><p className='text-xs font-bold uppercase tracking-wider text-amber-600'>Conta Mae</p><h1 className='text-2xl font-bold'>CRM de demonstracoes</h1><p className='text-xs text-slate-500'>Leads capturados pela pagina de vendas, com a dor e o melhor momento para contato.</p></div><button onClick={() => void load()} className='inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold'><RefreshCw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} /> Atualizar</button></div>
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-6'>
        {(Object.keys(STATUS) as SalesLeadStatus[]).map(key => <button key={key} onClick={() => setStatus(status === key ? '' : key)} className={'rounded-xl border p-4 text-left ' + (status === key ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white')}><span className='block text-2xl font-black text-slate-900'>{counts[key] ?? 0}</span><span className='text-xs text-slate-500'>{STATUS[key]}</span></button>)}
      </div>
      <div className='relative max-w-xl'><Search className='absolute left-3 top-3 h-4 w-4 text-slate-400' /><input value={term} onChange={e => setTerm(e.target.value)} placeholder='Buscar por nome, empresa ou e-mail' className='w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-amber-400' /></div>
      <div className='grid gap-5 xl:grid-cols-[1fr_420px]'>
        <div className='space-y-3'>
          {!loading && leads.length === 0 && <div className='rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500'>Nenhum lead encontrado.</div>}
          {leads.map(lead => <button key={lead.id} onClick={() => setSelected(lead)} className={'w-full rounded-2xl border bg-white p-5 text-left transition hover:border-amber-300 ' + (selected?.id === lead.id ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200')}><div className='flex flex-wrap items-start justify-between gap-3'><div><h3 className='font-bold text-slate-900'>{lead.name}</h3><p className='text-sm text-slate-500'>{lead.roleTitle} em {lead.company}</p></div><span className='rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600'>{STATUS[lead.status]}</span></div><div className='mt-4 flex flex-wrap gap-3 text-xs text-slate-500'><span className='inline-flex items-center gap-1'><UsersRound className='h-3.5 w-3.5' />{lead.employeeRange}</span><span>{PAIN[lead.pain]}</span><span className='inline-flex items-center gap-1'><CalendarDays className='h-3.5 w-3.5' />{new Date(lead.preferredDate + 'T12:00:00').toLocaleDateString('pt-BR')} - {lead.preferredPeriod === 'morning' ? 'manha' : 'tarde'}</span></div></button>)}
        </div>
        <aside className='xl:sticky xl:top-24 xl:self-start'>
          {!selected ? <div className='rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500'>Selecione um lead para ver os detalhes e registrar o acompanhamento.</div> : (
            <div className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
              <div><p className='text-xs font-bold uppercase tracking-wider text-amber-600'>{PAIN[selected.pain]}</p><h2 className='mt-1 text-xl font-bold'>{selected.name}</h2><p className='text-sm text-slate-500'>{selected.company} - {selected.roleTitle}</p></div>
              <div className='mt-4 grid gap-2 text-sm'><a href={'mailto:' + selected.email} className='inline-flex items-center gap-2 text-indigo-600 hover:underline'><Mail className='h-4 w-4' />{selected.email}</a><a href={'tel:' + selected.phone} className='inline-flex items-center gap-2 text-indigo-600 hover:underline'><Phone className='h-4 w-4' />{selected.phone}</a></div>
              {selected.painDetails && <div className='mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600'>{selected.painDetails}</div>}
              <div className='mt-5 space-y-4'>
                <label className='block text-xs font-semibold text-slate-600'>Etapa comercial<select value={selected.status} onChange={e => setSelected({ ...selected, status: e.target.value as SalesLeadStatus })} className='mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm'>{(Object.keys(STATUS) as SalesLeadStatus[]).map(key => <option key={key} value={key}>{STATUS[key]}</option>)}</select></label>
                <label className='block text-xs font-semibold text-slate-600'>Responsavel<input value={selected.assignedTo ?? ''} onChange={e => setSelected({ ...selected, assignedTo: e.target.value })} className='mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm' placeholder='Nome do responsavel comercial' /></label>
                <label className='block text-xs font-semibold text-slate-600'>Proximo contato<input type='datetime-local' value={selected.nextFollowUpAt?.slice(0, 16) ?? ''} onChange={e => setSelected({ ...selected, nextFollowUpAt: e.target.value || undefined })} className='mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm' /></label>
                <label className='block text-xs font-semibold text-slate-600'>Observacoes<textarea rows={5} maxLength={5000} value={selected.commercialNotes} onChange={e => setSelected({ ...selected, commercialNotes: e.target.value })} className='mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm' placeholder='Registre contatos, contexto e proximos passos.' /></label>
                <button onClick={() => void save()} disabled={saving} className='w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-60'>{saving ? 'Salvando...' : 'Salvar acompanhamento'}</button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
