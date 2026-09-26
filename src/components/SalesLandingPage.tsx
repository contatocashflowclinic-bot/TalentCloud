import React from 'react';
import { motion } from 'motion/react';
import { BrandLogo } from './BrandLogo.js';
import { ArrowRight, CheckCircle2, ListChecks, Paperclip, ShieldCheck } from 'lucide-react';
import { SalesBookingForm } from './sales/SalesBookingForm.js';

const revealViewport = { once: true, amount: 0.2 } as const;

export const SalesLandingPage: React.FC = () => (
  <div className='font-sales min-h-screen overflow-x-hidden bg-white text-slate-950'>
    <header className='sticky top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl'>
      <div className='mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:h-24 sm:px-8'>
        <BrandLogo width={160} />
        <a href='?view=login' className='rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-md'>J&aacute; sou cliente</a>
      </div>
    </header>

    <main>
      <section className='relative isolate overflow-hidden border-b border-slate-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8faff_48%,#eef2ff_100%)]'>
        <motion.div aria-hidden='true' className='absolute -right-32 top-10 h-[30rem] w-[30rem] rounded-full bg-indigo-200/55 blur-3xl' animate={{ x: [0, 18, 0], y: [0, -16, 0] }} transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div aria-hidden='true' className='absolute -bottom-48 -left-36 h-96 w-96 rounded-full bg-amber-100/70 blur-3xl' animate={{ x: [0, -12, 0], y: [0, 20, 0] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} />

        <div className='relative mx-auto grid max-w-7xl gap-16 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:gap-20 lg:py-32'>
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }}>
            <p className='mb-7 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-4 py-2 text-xs font-bold text-indigo-700 shadow-sm backdrop-blur'><ShieldCheck className='h-4 w-4' /> Gest&atilde;o de pessoas com contexto, n&atilde;o com improviso</p>
            <h1 className='max-w-3xl text-balance text-4xl font-black leading-[1.06] tracking-[-0.045em] text-[#1c2b4d] sm:text-6xl lg:text-[4rem]'>Sua empresa cresceu. A gest&atilde;o de pessoas precisa acompanhar.</h1>
            <p className='mt-7 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl'>Organize a jornada dos seus talentos, d&ecirc; clareza aos gestores e tome decis&otilde;es melhores, sem depender de planilhas, mem&oacute;ria ou processos espalhados.</p>
            <a href='#agendar' className='group mt-10 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-4 text-sm font-bold text-white shadow-xl shadow-indigo-200 transition-all duration-300 hover:-translate-y-1 hover:bg-indigo-700 hover:shadow-2xl hover:shadow-indigo-200'>Agendar uma demonstra&ccedil;&atilde;o <ArrowRight className='h-4 w-4 transition-transform duration-300 group-hover:translate-x-1' /></a>
            <div className='mt-8 flex flex-wrap gap-3 text-sm text-slate-600'>{['Menos retrabalho', 'Decisoes mais seguras', 'Jornada conectada'].map(item => <span key={item} className='inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/75 px-3.5 py-2 shadow-sm backdrop-blur'><CheckCircle2 className='h-4 w-4 text-emerald-500' />{item}</span>)}</div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 36, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.75, delay: 0.15, ease: 'easeOut' }} className='relative'>
            <div aria-hidden='true' className='absolute -inset-3 rounded-[2.4rem] bg-gradient-to-br from-indigo-300/50 via-transparent to-amber-200/40 blur-xl' />
            <div id='agendar' className='relative scroll-mt-32 rounded-[2rem] border border-white/10 bg-slate-950 p-7 text-white shadow-[0_30px_80px_-25px_rgba(15,23,42,0.65)] sm:p-9'>
              <p className='text-xs font-bold uppercase tracking-[0.18em] text-amber-400'>Demonstra&ccedil;&atilde;o personalizada</p>
              <h2 className='mt-4 text-2xl font-bold leading-tight sm:text-3xl'>Qual desafio de pessoas voc&ecirc; quer resolver primeiro?</h2>
              <p className='mt-4 text-sm leading-6 text-slate-300'>Conte o que mais incomoda hoje. A conversa ser&aacute; conduzida a partir da realidade da sua empresa.</p>
              <SalesBookingForm />
            </div>
          </motion.div>
        </div>
      </section>

      <section className='relative isolate overflow-hidden border-b border-indigo-100 bg-indigo-50/70 py-24 sm:py-32'>
        <div aria-hidden='true' className='absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300 to-transparent' />
        <div aria-hidden='true' className='absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-200/30 blur-3xl' />
        <div className='relative mx-auto max-w-7xl px-5 sm:px-8'>
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={revealViewport} transition={{ duration: 0.6 }} className='mx-auto max-w-4xl text-center'>
            <h2 className='sales-heading text-[#1c2b4d]'>Recrutamento inteligente</h2>
            <p className='sales-paragraph mx-auto mt-7 max-w-[600px]'>Descubra como contratar o melhor candidato sem perder horas em triagens manuais.</p>
          </motion.div>

          <div className='mt-14 grid gap-6 md:grid-cols-3 lg:mt-16'>
            <motion.article initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} whileHover={{ y: -10 }} viewport={revealViewport} transition={{ duration: 0.5 }} className='group rounded-[1.75rem] border border-white/80 bg-white p-7 text-left shadow-[0_18px_50px_-24px_rgba(49,46,129,0.3)] transition-shadow duration-300 hover:shadow-[0_28px_65px_-25px_rgba(49,46,129,0.4)] sm:p-8'>
              <div className='flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-500 text-xl font-light text-white shadow-lg shadow-indigo-200 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110'>AI</div>
              <h3 className='mt-7 text-lg font-bold text-slate-950'>IA que filtra em minutos</h3>
              <p className='mt-4 text-sm leading-6 text-slate-600'>Descreva o perfil e a IA pontua e pr&eacute;-seleciona os melhores candidatos automaticamente.</p>
            </motion.article>

            <motion.article initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} whileHover={{ y: -10 }} viewport={revealViewport} transition={{ duration: 0.5, delay: 0.1 }} className='group rounded-[1.75rem] border border-white/80 bg-white p-7 text-left shadow-[0_18px_50px_-24px_rgba(49,46,129,0.3)] transition-shadow duration-300 hover:shadow-[0_28px_65px_-25px_rgba(49,46,129,0.4)] sm:p-8'>
              <div className='flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-500 text-white shadow-lg shadow-indigo-200 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-110'>
                <Paperclip className='h-7 w-7' />
              </div>
              <h3 className='mt-7 text-lg font-bold text-slate-950'>Pipeline com visibilidade total</h3>
              <p className='mt-4 text-sm leading-6 text-slate-600'>Vagas ativas, candidatos em cada etapa e time-to-hire em tempo real.</p>
            </motion.article>

            <motion.article initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} whileHover={{ y: -10 }} viewport={revealViewport} transition={{ duration: 0.5, delay: 0.2 }} className='group rounded-[1.75rem] border border-white/80 bg-white p-7 text-left shadow-[0_18px_50px_-24px_rgba(49,46,129,0.3)] transition-shadow duration-300 hover:shadow-[0_28px_65px_-25px_rgba(49,46,129,0.4)] sm:p-8'>
              <div className='flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-500 text-white shadow-lg shadow-indigo-200 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110'>
                <ListChecks className='h-7 w-7' />
              </div>
              <h3 className='mt-7 text-lg font-bold text-slate-950'>LGPD sem complica&ccedil;&atilde;o</h3>
              <p className='mt-4 text-sm leading-6 text-slate-600'>Consentimentos, reten&ccedil;&atilde;o de dados e conformidade com a LGPD gerenciados automaticamente.</p>
            </motion.article>
          </div>

          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={revealViewport} transition={{ duration: 0.6 }} className='mx-auto mt-16 max-w-4xl text-center sm:mt-20'>
            <h3 className='text-2xl font-bold tracking-tight text-[#1c2b4d] sm:text-3xl'>Tudo o que muda quando voc&ecirc; para de revisar curr&iacute;culos um a um</h3>
            <a href='#agendar' className='group mt-9 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-7 py-4 text-sm font-bold text-white shadow-xl shadow-indigo-200 transition-all duration-300 hover:-translate-y-1 hover:bg-indigo-700 hover:shadow-2xl'>Acesse a demo <ArrowRight className='h-4 w-4 transition-transform duration-300 group-hover:translate-x-1' /></a>
          </motion.div>
        </div>
      </section>

      <section className='relative overflow-hidden bg-slate-50 py-24 sm:py-32'>
        <div aria-hidden='true' className='absolute right-0 top-0 h-80 w-80 translate-x-1/3 rounded-full bg-slate-200/60 blur-3xl' />
        <div className='relative mx-auto max-w-6xl px-5 sm:px-8'>
          <motion.div initial={{ opacity: 0, x: -24 }} whileInView={{ opacity: 1, x: 0 }} viewport={revealViewport} transition={{ duration: 0.6 }} className='max-w-3xl'>
            <p className='text-xs font-bold uppercase tracking-widest text-indigo-600'>O problema n&atilde;o &eacute; falta de esfor&ccedil;o</p>
            <h2 className='sales-heading mt-5 text-[#1c2b4d]'>Quando a jornada fica desconectada, sua equipe trabalha muito para enxergar pouco.</h2>
          </motion.div>
          <div className='mt-14 grid gap-6 md:grid-cols-3 lg:mt-16'>
            {[
              ['Contratacoes lentas', 'Bons candidatos se perdem enquanto informacoes e aprovacoes ficam espalhadas.'],
              ['Decisoes inconsistentes', 'Cada gestor avalia de um jeito e o historico desaparece entre planilhas e mensagens.'],
              ['Sinais que chegam tarde', 'Desenvolvimento e retencao so viram prioridade quando o problema ja apareceu.']
            ].map(([title, body], i) => (
              <motion.article key={title} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} whileHover={{ y: -8 }} viewport={revealViewport} transition={{ duration: 0.5, delay: i * 0.1 }} className='group relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-sm transition-shadow duration-300 hover:shadow-xl sm:p-8'>
                <div aria-hidden='true' className='absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-indigo-500 to-violet-400 transition-transform duration-500 group-hover:scale-x-100' />
                <span className='inline-flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-sm font-black text-indigo-600 transition-colors duration-300 group-hover:bg-indigo-600 group-hover:text-white'>0{i + 1}</span>
                <h3 className='mt-6 text-lg font-bold'>{title}</h3>
                <p className='mt-3 text-sm leading-6 text-slate-600'>{body}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className='relative py-24 sm:py-32'>
        <div className='mx-auto grid max-w-6xl gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:items-center lg:gap-20'>
          <motion.div initial={{ opacity: 0, x: -28 }} whileInView={{ opacity: 1, x: 0 }} viewport={revealViewport} transition={{ duration: 0.65 }}>
            <p className='text-xs font-bold uppercase tracking-widest text-indigo-600'>Uma jornada, o contexto inteiro</p>
            <h2 className='sales-heading mt-5 text-[#1c2b4d]'>Da primeira conversa ao desenvolvimento de quem ficou.</h2>
            <p className='sales-paragraph mt-7 max-w-[600px]'>O V&eacute;rtice 360 conecta cada etapa para que RH, gestores e lideran&ccedil;a saibam o que aconteceu, o que precisa acontecer e onde agir primeiro.</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 28 }} whileInView={{ opacity: 1, x: 0 }} viewport={revealViewport} transition={{ duration: 0.65 }} className='relative grid gap-4 rounded-[2rem] border border-slate-100 bg-slate-50/80 p-5 shadow-[0_25px_70px_-35px_rgba(15,23,42,0.25)] sm:p-7'>
            <div aria-hidden='true' className='absolute bottom-8 left-10 top-8 w-px bg-gradient-to-b from-transparent via-indigo-200 to-transparent' />
            {['Contrate com um processo claro e consistente.', 'Transforme informacao em decisoes com contexto.', 'Acompanhe desenvolvimento antes de virar urgencia.', 'Perceba sinais de desengajamento enquanto ha tempo.'].map((item, i) => (
              <motion.div key={item} whileHover={{ x: 8 }} transition={{ duration: 0.2 }} className='relative flex items-start gap-4 rounded-2xl border border-slate-100 bg-white p-5 text-sm font-semibold text-slate-700 shadow-sm'>
                <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50'><CheckCircle2 className='h-5 w-5 text-emerald-500' /></span>
                <span className='pt-2'>{item}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className='relative isolate overflow-hidden bg-indigo-700 py-20 text-white sm:py-24'>
        <motion.div aria-hidden='true' className='absolute -right-20 -top-32 h-96 w-96 rounded-full bg-violet-400/30 blur-3xl' animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} />
        <div aria-hidden='true' className='absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.08),transparent_45%)]' />
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={revealViewport} transition={{ duration: 0.6 }} className='relative mx-auto flex max-w-6xl flex-col items-start justify-between gap-10 px-5 sm:px-8 lg:flex-row lg:items-center'>
          <div className='max-w-2xl'>
            <p className='text-xs font-bold uppercase tracking-widest text-indigo-200'>Tecnologia para apoiar. Pessoas para decidir.</p>
            <h2 className='sales-heading mt-3'>A IA organiza sinais relevantes. A decis&atilde;o continua humana.</h2>
          </div>
          <a href='#agendar' className='group inline-flex shrink-0 items-center gap-2 rounded-xl bg-amber-400 px-7 py-4 text-sm font-bold text-slate-950 shadow-xl shadow-indigo-950/20 transition-all duration-300 hover:-translate-y-1 hover:bg-amber-300 hover:shadow-2xl'>Quero ver na pr&aacute;tica <ArrowRight className='h-4 w-4 transition-transform duration-300 group-hover:translate-x-1' /></a>
        </motion.div>
      </section>
    </main>

    <footer className='border-t border-slate-200 bg-white'>
      <div className='mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-12'>
        <BrandLogo width={160} />
        <span>Gest&atilde;o de talentos com contexto, seguran&ccedil;a e decis&atilde;o humana.</span>
      </div>
    </footer>
  </div>
);
