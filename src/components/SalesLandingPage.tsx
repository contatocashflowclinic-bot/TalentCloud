import React from 'react';
import { BrandLogo } from './BrandLogo.js';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { SalesBookingForm } from './sales/SalesBookingForm.js';

export const SalesLandingPage: React.FC = () => (
  <div className='min-h-screen bg-white text-slate-950'>
    <header className='mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8'>
      <BrandLogo width={160} />
      <a href='?view=login' className='rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-indigo-700'>J&aacute; sou cliente</a>
    </header>
    <main>
      <section className='relative overflow-hidden border-t border-slate-100'>
        <div className='absolute -right-32 top-10 h-96 w-96 rounded-full bg-indigo-100/80 blur-3xl' />
        <div className='relative mx-auto grid max-w-7xl gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.05fr_.95fr] lg:items-center'>
          <div>
            <p className='mb-6 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700'><ShieldCheck className='h-4 w-4' /> Gest&atilde;o de pessoas com contexto, n&atilde;o com improviso</p>
            <h1 className='text-balance text-4xl font-black leading-[1.08] tracking-[-0.04em] sm:text-6xl'>Sua empresa cresceu. A gest&atilde;o de pessoas precisa acompanhar.</h1>
            <p className='mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl'>Organize a jornada dos seus talentos, d&ecirc; clareza aos gestores e tome decis&otilde;es melhores, sem depender de planilhas, mem&oacute;ria ou processos espalhados.</p>
            <a href='#agendar' className='mt-9 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700'>Agendar uma demonstra&ccedil;&atilde;o <ArrowRight className='h-4 w-4' /></a>
            <div className='mt-7 flex flex-wrap gap-5 text-sm text-slate-600'>{['Menos retrabalho', 'Decisoes mais seguras', 'Jornada conectada'].map(item => <span key={item} className='inline-flex items-center gap-2'><CheckCircle2 className='h-4 w-4 text-emerald-500' />{item}</span>)}</div>
          </div>
          <div id='agendar' className='scroll-mt-5 rounded-[2rem] bg-slate-950 p-7 text-white shadow-2xl sm:p-9'>
            <p className='text-xs font-bold uppercase tracking-[0.18em] text-amber-400'>Demonstra&ccedil;&atilde;o personalizada</p>
            <h2 className='mt-3 text-2xl font-bold'>Qual desafio de pessoas voc&ecirc; quer resolver primeiro?</h2>
            <p className='mt-3 text-sm leading-6 text-slate-300'>Conte o que mais incomoda hoje. A conversa ser&aacute; conduzida a partir da realidade da sua empresa.</p>
            <SalesBookingForm />
          </div>
        </div>
      </section>
      <section className='bg-slate-50 py-20 sm:py-28'>
        <div className='mx-auto max-w-6xl px-5 sm:px-8'>
          <div className='max-w-3xl'><p className='text-xs font-bold uppercase tracking-widest text-indigo-600'>O problema n&atilde;o &eacute; falta de esfor&ccedil;o</p><h2 className='mt-4 text-3xl font-black tracking-tight sm:text-4xl'>Quando a jornada fica desconectada, sua equipe trabalha muito para enxergar pouco.</h2></div>
          <div className='mt-10 grid gap-5 md:grid-cols-3'>
            {[
              ['Contratacoes lentas', 'Bons candidatos se perdem enquanto informacoes e aprovacoes ficam espalhadas.'],
              ['Decisoes inconsistentes', 'Cada gestor avalia de um jeito e o historico desaparece entre planilhas e mensagens.'],
              ['Sinais que chegam tarde', 'Desenvolvimento e retencao so viram prioridade quando o problema ja apareceu.']
            ].map(([title, body], i) => <article key={title} className='rounded-2xl border border-slate-200 bg-white p-6'><span className='text-sm font-black text-indigo-600'>0{i + 1}</span><h3 className='mt-4 text-lg font-bold'>{title}</h3><p className='mt-2 text-sm leading-6 text-slate-600'>{body}</p></article>)}
          </div>
        </div>
      </section>
      <section className='py-20 sm:py-28'>
        <div className='mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:items-center'>
          <div><p className='text-xs font-bold uppercase tracking-widest text-indigo-600'>Uma jornada, o contexto inteiro</p><h2 className='mt-4 text-3xl font-black tracking-tight sm:text-4xl'>Da primeira conversa ao desenvolvimento de quem ficou.</h2><p className='mt-5 text-base leading-7 text-slate-600'>O V&eacute;rtice 360 conecta cada etapa para que RH, gestores e lideran&ccedil;a saibam o que aconteceu, o que precisa acontecer e onde agir primeiro.</p></div>
          <div className='grid gap-3'>
            {['Contrate com um processo claro e consistente.', 'Transforme informacao em decisoes com contexto.', 'Acompanhe desenvolvimento antes de virar urgencia.', 'Perceba sinais de desengajamento enquanto ha tempo.'].map(item => <div key={item} className='flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-700'><CheckCircle2 className='mt-0.5 h-5 w-5 shrink-0 text-emerald-500' />{item}</div>)}
          </div>
        </div>
      </section>
      <section className='bg-indigo-700 py-16 text-white'>
        <div className='mx-auto flex max-w-6xl flex-col items-start justify-between gap-7 px-5 sm:px-8 lg:flex-row lg:items-center'><div className='max-w-2xl'><p className='text-sm font-bold text-indigo-200'>Tecnologia para apoiar. Pessoas para decidir.</p><h2 className='mt-2 text-3xl font-black'>A IA organiza sinais relevantes. A decis&atilde;o continua humana.</h2></div><a href='#agendar' className='inline-flex shrink-0 items-center gap-2 rounded-xl bg-amber-400 px-6 py-4 text-sm font-bold text-slate-950'>Quero ver na pr&aacute;tica <ArrowRight className='h-4 w-4' /></a></div>
      </section>
    </main>
    <footer className='border-t border-slate-200 bg-white'><div className='mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8'><BrandLogo width={160} /><span>Gest&atilde;o de talentos com contexto, seguran&ccedil;a e decis&atilde;o humana.</span></div></footer>
  </div>
);
