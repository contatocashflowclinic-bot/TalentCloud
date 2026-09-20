import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Briefcase,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  EllipsisVertical,
  FileText,
  LayoutGrid,
  Plus,
  UserPlus,
  UserRound,
  Users,
  Video,
  Zap
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useTenant } from '../../context/TenantContext.js';
import { canAccessModule } from '../../access.js';
import { MODULE_SECTIONS } from '../../moduleRegistry.js';
import { TenantApi } from '../../services/api.js';
import { AgendaEvent } from '../../types.js';
import { formatTimeSP } from '../../utils/dateUtils.js';
import { AgendaEventModal } from '../agenda/AgendaEventModal.js';
import { PendingItem, Priority, TodayItem, useWelcomeData } from './welcome/welcomeData.js';

type Icon = React.ComponentType<{ className?: string }>;

const GREETING_BY_HOUR = (hour: number) => (hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite');

/** Static class names (Tailwind only generates what it can see in the source). */
const XL_COLS: Record<number, string> = { 1: 'xl:grid-cols-1', 2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4' };

const AGENDA_PREVIEW = 5;
const PENDING_PREVIEW = 3;

const plainName = (name: string) => name.replace(/^\d+\.\s*/, '');

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
const Card: React.FC<React.ComponentPropsWithRef<'section'>> = ({ className = '', ...props }) => (
  <section className={`bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 ${className}`} {...props} />
);

const CardHeader: React.FC<{ icon: Icon; tile: string; title: string; action?: React.ReactNode }> = ({ icon: I, tile, title, action }) => (
  <div className="flex items-center justify-between gap-3 mb-4">
    <h2 className="flex items-center gap-3 text-lg font-bold text-slate-900">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 ${tile}`}>
        <I className="w-4 h-4" />
      </span>
      {title}
    </h2>
    {action}
  </div>
);

const SectionTitle: React.FC<{ icon: Icon; title: string }> = ({ icon: I, title }) => (
  <h2 className="flex items-center gap-2.5 text-lg font-bold text-slate-900 mb-3.5">
    <I className="w-5 h-5 text-indigo-500" /> {title}
  </h2>
);

const LinkButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button onClick={onClick} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 shrink-0">
    {children} <ArrowRight className="w-3.5 h-3.5" />
  </button>
);

/** ⋮ menu of a row; closes on outside click / Escape. */
const RowMenu: React.FC<{ actions: { label: string; onClick: () => void }[] }> = ({ actions }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        aria-label="Mais opções"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
      >
        <EllipsisVertical className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-20 min-w-[12rem] bg-white rounded-xl border border-slate-200 shadow-lg py-1">
          {actions.map(a => (
            <button
              key={a.label}
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); setOpen(false); a.onClick(); }}
              className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// KPI cards
// ---------------------------------------------------------------------------
type Tone = 'up' | 'down' | 'alert' | 'ok' | 'neutral';

interface Kpi {
  key: string;
  label: string;
  value: number;
  delta: string;
  tone: Tone;
  icon: Icon;
  tile: string;
  hint?: string;
  onClick: () => void;
}

const TONE_STYLE: Record<Tone, string> = {
  up: 'text-emerald-600',
  down: 'text-slate-500',
  alert: 'text-rose-600',
  ok: 'text-emerald-600',
  neutral: 'text-slate-500'
};

const KpiCard: React.FC<{ kpi: Kpi; loading: boolean }> = ({ kpi, loading }) => {
  const I = kpi.icon;
  return (
    <button
      onClick={kpi.onClick}
      title={kpi.hint}
      className="flex items-center gap-4 p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-indigo-200 hover:shadow-md text-left transition-all group"
    >
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${kpi.tile}`}>
        <I className="w-6 h-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-600">{kpi.label}</div>
        {loading ? (
          <div className="h-8 w-14 rounded-lg bg-slate-100 animate-pulse my-1" />
        ) : (
          <div className="text-3xl font-bold text-slate-900 leading-tight">{kpi.value}</div>
        )}
        <div className={`flex items-center gap-1 text-xs font-semibold h-4 ${TONE_STYLE[kpi.tone]}`}>
          {!loading && (
            <>
              {(kpi.tone === 'up' || kpi.tone === 'alert') && <ArrowUp className="w-3.5 h-3.5" />}
              {kpi.tone === 'down' && <ArrowDown className="w-3.5 h-3.5" />}
              {kpi.delta}
            </>
          )}
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-slate-400 shrink-0 group-hover:text-indigo-500 transition-colors" />
    </button>
  );
};

// ---------------------------------------------------------------------------
// Agenda de hoje / Pendências
// ---------------------------------------------------------------------------
const DOT_BY_KIND: Record<TodayItem['kind'], string> = {
  interview: 'bg-blue-500',
  meeting: 'bg-violet-500',
  task: 'bg-emerald-500'
};

const AgendaRow: React.FC<{ item: TodayItem; onOpen: () => void; menu: { label: string; onClick: () => void }[] }> = ({ item, onOpen, menu }) => (
  <div
    role="button"
    tabIndex={0}
    onClick={onOpen}
    onKeyDown={(e) => {
      if (e.target !== e.currentTarget) return; // ignore keys pressed on the inner link/menu
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
    }}
    className={`flex items-center gap-3.5 p-3 pr-2 rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-indigo-200 transition-colors cursor-pointer ${item.done ? 'opacity-60' : ''}`}
  >
    <div className="w-12 shrink-0 leading-tight">
      <div className="text-sm font-bold text-slate-900">{formatTimeSP(item.startsAt)}</div>
      {item.endsAt && <div className="text-xs text-slate-400">{formatTimeSP(item.endsAt)}</div>}
    </div>
    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT_BY_KIND[item.kind]}`} aria-hidden />
    <div className="min-w-0 flex-1">
      <div className={`text-sm font-bold text-slate-900 truncate ${item.done ? 'line-through' : ''}`}>{item.title}</div>
      {item.subtitle && <div className="text-xs text-slate-500 truncate">{item.subtitle}</div>}
    </div>
    {item.link && (
      <a
        href={item.link.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={`Abrir ${item.link.label}`}
        className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
      >
        <Video className="w-4 h-4" /> {item.link.label}
      </a>
    )}
    <RowMenu actions={menu} />
  </div>
);

const PENDING_KIND: Record<PendingItem['kind'], { icon: Icon; tile: string }> = {
  offer: { icon: FileText, tile: 'bg-rose-50 text-rose-500' },
  review: { icon: UserRound, tile: 'bg-amber-50 text-amber-500' },
  interview: { icon: CalendarDays, tile: 'bg-violet-50 text-violet-500' },
  task: { icon: ClipboardList, tile: 'bg-emerald-50 text-emerald-500' }
};

const PRIORITY_PILL: Record<Priority, { label: string; cls: string }> = {
  late: { label: 'Em atraso', cls: 'bg-rose-50 text-rose-600' },
  high: { label: 'Alta', cls: 'bg-amber-50 text-amber-700' },
  normal: { label: 'Normal', cls: 'bg-sky-50 text-sky-600' }
};

const PendingRow: React.FC<{ item: PendingItem; onOpen: () => void }> = ({ item, onOpen }) => {
  const kind = PENDING_KIND[item.kind];
  const I = kind.icon;
  const pill = PRIORITY_PILL[item.priority];
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-indigo-200 text-left transition-colors group"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${kind.tile}`}>
        <I className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-slate-900 truncate">{item.title}</div>
        <div className="text-xs text-slate-500 truncate">{item.detail}</div>
      </div>
      <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 ${pill.cls}`}>{pill.label}</span>
      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-indigo-500 transition-colors" />
    </button>
  );
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export const ModuleWelcome: React.FC<{ onNavigate: (moduleId: number) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { can, permissions } = useTenant();
  const { view, members, loading, reload } = useWelcomeData();
  const firstName = (user?.name || '').split(' ')[0];

  const [showAllPending, setShowAllPending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<AgendaEvent | null>(null);
  const pendingRef = useRef<HTMLElement>(null);

  const scrollToPending = () => pendingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const stats = view?.stats ?? {};
  const pending = view?.pending ?? [];
  const lateCount = view?.lateCount ?? 0;
  const today = view?.today ?? [];

  const kpis: Kpi[] = [];
  if (stats.openJobs) {
    const { total, thisWeek } = stats.openJobs;
    kpis.push({
      key: 'jobs', label: 'Vagas abertas', value: total, icon: Briefcase, tile: 'bg-blue-50 text-blue-600',
      delta: thisWeek > 0 ? `+${thisWeek} esta semana` : 'Nenhuma nova esta semana', tone: thisWeek > 0 ? 'up' : 'neutral',
      onClick: () => onNavigate(6)
    });
  }
  if (stats.newCandidates) {
    const { total, thisWeek } = stats.newCandidates;
    kpis.push({
      key: 'candidates', label: 'Novos candidatos', value: total, icon: Users, tile: 'bg-violet-50 text-violet-600',
      hint: 'Cadastrados nos últimos 30 dias',
      delta: thisWeek > 0 ? `+${thisWeek} esta semana` : 'Nenhum novo esta semana', tone: thisWeek > 0 ? 'up' : 'neutral',
      onClick: () => onNavigate(7)
    });
  }
  if (stats.interviewsToday) {
    const { today: n, yesterday } = stats.interviewsToday;
    const diff = n - yesterday;
    kpis.push({
      key: 'interviews', label: 'Entrevistas hoje', value: n, icon: CalendarDays, tile: 'bg-emerald-50 text-emerald-600',
      delta: diff > 0 ? `+${diff} vs. ontem` : diff < 0 ? `−${-diff} vs. ontem` : 'Igual a ontem',
      tone: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral',
      onClick: () => onNavigate(10)
    });
  }
  kpis.push({
    key: 'pending', label: 'Pendências', value: pending.length, icon: CircleAlert, tile: 'bg-amber-50 text-amber-500',
    delta: lateCount > 0 ? `+${lateCount} em atraso` : 'Nada em atraso', tone: lateCount > 0 ? 'alert' : 'ok',
    onClick: scrollToPending
  });

  const quickAccess = [
    { key: 'job', title: 'Criar vaga', desc: 'Publique uma nova oportunidade', icon: Briefcase, moduleId: 6, allowed: can('openings:create') },
    { key: 'user', title: 'Adicionar colaborador', desc: 'Inclua um novo talento', icon: UserPlus, moduleId: 2, allowed: can('users:create') },
    { key: 'interview', title: 'Agendar entrevista', desc: 'Programe um horário', icon: CalendarDays, moduleId: 10, allowed: can('interviews:create') },
    { key: 'indicators', title: 'Ver indicadores', desc: 'Acesse os dashboards', icon: BarChart3, moduleId: 15, allowed: can('indicators:view') }
  ].filter(q => q.allowed);

  const modules = MODULE_SECTIONS
    .flatMap(sec => sec.modules)
    .filter(m => m.id !== 1 && m.id !== 17 && canAccessModule(permissions, m.id));

  const visiblePending = showAllPending ? pending : pending.slice(0, PENDING_PREVIEW);
  const visibleToday = today.slice(0, AGENDA_PREVIEW);

  const menuFor = (item: TodayItem) =>
    item.event
      ? [
          { label: 'Abrir compromisso', onClick: () => setSelectedEvent(item.event!) },
          { label: 'Ver na Agenda Corporativa', onClick: () => onNavigate(17) }
        ]
      : [{ label: 'Abrir em Entrevistas', onClick: () => onNavigate(10) }];

  const deleteSelected = async () => {
    if (!selectedEvent) return;
    await TenantApi.deleteAgendaEvent(selectedEvent.id);
    setSelectedEvent(null);
    await reload();
  };

  return (
    <div className="space-y-6 max-w-[1500px]">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-500 text-white px-6 py-5 sm:px-8 sm:py-6 shadow-lg shadow-indigo-900/10 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {GREETING_BY_HOUR(new Date().getHours())}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-indigo-100 text-sm sm:text-base mt-1.5">Aqui está o que precisa da sua atenção hoje.</p>
        </div>
        <button
          onClick={scrollToPending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-indigo-700 text-sm font-semibold shadow-sm hover:bg-indigo-50 transition-colors shrink-0"
        >
          Ver pendências <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* KPIs */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${XL_COLS[kpis.length]}`}>
        {kpis.map(kpi => <KpiCard key={kpi.key} kpi={kpi} loading={loading} />)}
      </div>

      {/* Agenda de hoje + Pendências */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card>
          <CardHeader
            icon={CalendarDays}
            tile="bg-blue-600"
            title="Agenda de hoje"
            action={<LinkButton onClick={() => onNavigate(17)}>Ver agenda completa</LinkButton>}
          />
          {loading ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map(i => <div key={i} className="h-[66px] rounded-xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : today.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl">
              <p className="text-sm text-slate-500">Nada agendado para hoje.</p>
              <button
                onClick={() => setCreateOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
              >
                <Plus className="w-4 h-4" /> Novo compromisso
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleToday.map(item => (
                <AgendaRow
                  key={item.id}
                  item={item}
                  onOpen={() => (item.event ? setSelectedEvent(item.event) : onNavigate(10))}
                  menu={menuFor(item)}
                />
              ))}
              {today.length > AGENDA_PREVIEW && (
                <button onClick={() => onNavigate(17)} className="w-full pt-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                  + {today.length - AGENDA_PREVIEW} {today.length - AGENDA_PREVIEW === 1 ? 'compromisso' : 'compromissos'} hoje
                </button>
              )}
            </div>
          )}
        </Card>

        <Card ref={pendingRef} className="scroll-mt-24">
          <CardHeader
            icon={CircleAlert}
            tile="bg-amber-500"
            title="Pendências prioritárias"
            action={
              pending.length > PENDING_PREVIEW ? (
                <LinkButton onClick={() => setShowAllPending(v => !v)}>{showAllPending ? 'Ver menos' : 'Ver todas'}</LinkButton>
              ) : undefined
            }
          />
          {loading ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map(i => <div key={i} className="h-[66px] rounded-xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : pending.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl">
              <CircleCheck className="w-7 h-7 text-emerald-500 mx-auto" />
              <p className="text-sm text-slate-500 mt-2">Tudo em dia! Nenhuma pendência no momento.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visiblePending.map(item => (
                <PendingRow key={item.id} item={item} onOpen={() => onNavigate(item.moduleId)} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Acessos rápidos */}
      {quickAccess.length > 0 && (
        <section>
          <SectionTitle icon={Zap} title="Acessos rápidos" />
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${XL_COLS[quickAccess.length]}`}>
            {quickAccess.map(q => {
              const I = q.icon;
              return (
                <button
                  key={q.key}
                  onClick={() => onNavigate(q.moduleId)}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-indigo-200 hover:shadow-md text-left transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <I className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900 truncate">{q.title}</div>
                    <div className="text-xs text-slate-500 truncate">{q.desc}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-indigo-500 transition-colors" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Módulos */}
      {modules.length > 0 && (
        <section>
          <SectionTitle icon={LayoutGrid} title="Módulos" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {modules.map(mod => {
              const I = mod.icon;
              return (
                <button
                  key={mod.id}
                  onClick={() => onNavigate(mod.id)}
                  className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-indigo-200 hover:shadow-md text-left transition-all group"
                >
                  <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <I className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900 truncate">{plainName(mod.name)}</div>
                    <div className="text-xs text-slate-500 truncate">{mod.desc}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 group-hover:text-indigo-500 transition-colors" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {createOpen && (
        <AgendaEventModal mode="create" members={members} onClose={() => setCreateOpen(false)} onSaved={reload} />
      )}
      {selectedEvent && (
        <AgendaEventModal
          mode="edit"
          event={selectedEvent}
          members={members}
          onClose={() => setSelectedEvent(null)}
          onSaved={reload}
          onDelete={selectedEvent.createdById === user?.id ? deleteSelected : undefined}
        />
      )}
    </div>
  );
};
