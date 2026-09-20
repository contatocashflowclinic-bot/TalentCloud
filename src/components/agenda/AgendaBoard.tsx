import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Plus, Video, CheckSquare, Clock, MapPin, ArrowRight, Users2, CalendarDays, LayoutList } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useTenant } from '../../context/TenantContext.js';
import { TenantApi } from '../../services/api.js';
import { AgendaEvent, AgendaDirectoryMember } from '../../types.js';
import { formatLongDateSP, formatTimeSP } from '../../utils/dateUtils.js';
import { AgendaEventModal } from './AgendaEventModal.js';
import { AgendaCalendarMonth } from './AgendaCalendarMonth.js';

const STATUS_META: Record<AgendaEvent['status'], { label: string; badge: string }> = {
  scheduled: { label: 'Agendado', badge: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'Em andamento', badge: 'bg-amber-100 text-amber-700' },
  done: { label: 'Concluído', badge: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelado', badge: 'bg-slate-200 text-slate-500' }
};

const TYPE_META: Record<AgendaEvent['type'], { label: string; icon: React.ComponentType<{ className?: string }>; accent: string }> = {
  meeting: { label: 'Reunião', icon: Video, accent: 'from-indigo-500 to-blue-500' },
  task: { label: 'Tarefa', icon: CheckSquare, accent: 'from-emerald-500 to-teal-500' }
};

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'meeting', label: 'Reuniões' },
  { id: 'task', label: 'Tarefas' },
  { id: 'mine', label: 'Minhas' }
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

const Avatar: React.FC<{ name: string; className?: string }> = ({ name, className }) => (
  <div
    title={name}
    className={`shrink-0 rounded-full bg-indigo-100 text-indigo-700 border-2 border-white flex items-center justify-center font-bold uppercase ${className ?? 'w-6 h-6 text-[9px]'}`}
  >
    {initials(name)}
  </div>
);

/** "Hoje", "Amanhã" or the full date, in São Paulo time. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000);
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Amanhã';
  if (diffDays === -1) return 'Ontem';
  return formatLongDateSP(d);
}

/** Short "when" label for the side column, e.g. "Hoje · 14:30". */
const whenShort = (iso: string) => `${dayLabel(iso)} · ${formatTimeSP(iso)}`;

interface AgendaBoardProps {
  /** Condensed layout for embedding in the Welcome screen: fewer items, no day grouping, no filter tabs. */
  compact?: boolean;
  onOpenFull?: () => void;
}

/** Shared corporate agenda: every organization member sees the same board, no permission gate. */
export const AgendaBoard: React.FC<AgendaBoardProps> = ({ compact = false, onOpenFull }) => {
  const { activeTenant } = useTenant();
  const { user } = useAuth();
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [members, setMembers] = useState<AgendaDirectoryMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterId>('all');
  const [view, setView] = useState<'calendar' | 'list'>(compact ? 'list' : 'calendar');
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<AgendaEvent | null>(null);

  const openCreateOn = (dateKey: string) => {
    setCreateDate(dateKey);
    setCreateOpen(true);
  };

  const load = async () => {
    try {
      setLoading(true);
      const [ev, mem] = await Promise.all([TenantApi.getAgendaEvents(), TenantApi.getAgendaDirectory()]);
      setEvents(ev);
      setMembers(mem);
    } catch (err) {
      console.error('Failed to load agenda:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeTenant?.id]);

  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? 'Colaborador';

  const upcoming = useMemo(
    () =>
      events
        .filter(e => e.status !== 'done' && e.status !== 'cancelled')
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [events]
  );

  const visible = useMemo(() => {
    const base = compact ? upcoming : [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return base.filter(e => {
      if (filter === 'meeting' || filter === 'task') return e.type === filter;
      if (filter === 'mine') return e.assigneeIds.includes(user?.id ?? '') || e.createdById === user?.id;
      return true;
    });
  }, [events, upcoming, filter, compact, user?.id]);

  const grouped = useMemo(() => {
    const out: { label: string; items: AgendaEvent[] }[] = [];
    for (const ev of visible) {
      const label = dayLabel(ev.startsAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(ev);
      else out.push({ label, items: [ev] });
    }
    return out;
  }, [visible]);

  const byCollaborator = useMemo(
    () =>
      members
        .map(m => ({ member: m, items: upcoming.filter(e => e.assigneeIds.includes(m.id)) }))
        .filter(g => g.items.length > 0)
        .sort((a, b) => a.items[0].startsAt.localeCompare(b.items[0].startsAt))
        .slice(0, compact ? 4 : undefined),
    [members, upcoming, compact]
  );

  const displayList = compact ? visible.slice(0, 6) : visible;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center shadow-sm shadow-indigo-200">
              <CalendarClock className="w-4 h-4" />
            </span>
            Agenda Corporativa
          </h2>
          {!compact && (
            <p className="text-xs text-slate-500 mt-1 ml-[42px]">
              Reuniões e tarefas organizadas em um só lugar, visível para toda a organização.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {compact && onOpenFull && (
            <button onClick={onOpenFull} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Ver agenda completa <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => { setCreateDate(undefined); setCreateOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo compromisso
          </button>
        </div>
      </div>

      {!compact && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  filter === f.id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
            <button
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                view === 'calendar' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Calendário
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                view === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" /> Lista
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-4">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs animate-pulse">Carregando a agenda...</div>
          ) : !compact && view === 'calendar' ? (
            <AgendaCalendarMonth events={visible} memberName={memberName} onSelectEvent={setSelected} onCreateOnDate={openCreateOn} />
          ) : displayList.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl">
              Nenhum compromisso {filter === 'mine' ? 'atribuído a você' : 'por aqui'}. Clique em "Novo compromisso" para agendar.
            </div>
          ) : compact ? (
            <div className="space-y-2.5">
              {displayList.map(ev => (
                <EventCard key={ev.id} event={ev} memberName={memberName} onClick={() => setSelected(ev)} />
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(group => (
                <div key={group.label} className="space-y-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-0.5">{group.label}</div>
                  {group.items.map(ev => (
                    <EventCard key={ev.id} event={ev} memberName={memberName} onClick={() => setSelected(ev)} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-0.5">
            <Users2 className="w-3.5 h-3.5" /> Próximos por colaborador
          </div>
          {loading ? null : byCollaborator.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-[11px] border border-dashed border-slate-200 rounded-2xl">
              Ninguém com compromissos futuros atribuídos ainda.
            </div>
          ) : (
            byCollaborator.map(({ member, items }) => (
              <div key={member.id} className="p-3.5 rounded-2xl bg-white border border-slate-200">
                <div className="flex items-center gap-2.5">
                  <Avatar name={member.name} className="w-8 h-8 text-[10px]" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">{member.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{member.jobTitle}</div>
                  </div>
                  <span className="ml-auto text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5 shrink-0">
                    {items.length}
                  </span>
                </div>
                <div className="mt-2.5 space-y-1.5 border-l-2 border-slate-100 ml-4 pl-3">
                  {items.slice(0, 3).map(it => (
                    <button key={it.id} onClick={() => setSelected(it)} className="block w-full text-left group">
                      <div className="text-[11px] font-medium text-slate-700 group-hover:text-indigo-600 truncate transition-colors">{it.title}</div>
                      <div className="text-[10px] text-slate-400">{whenShort(it.startsAt)}</div>
                    </button>
                  ))}
                  {items.length > 3 && (
                    <div className="text-[10px] font-semibold text-indigo-500">+{items.length - 3} mais</div>
                  )}
                </div>
              </div>
            ))
          )}
        </aside>
      </div>

      {createOpen && (
        <AgendaEventModal
          mode="create"
          initialDate={createDate}
          members={members}
          onClose={() => { setCreateOpen(false); setCreateDate(undefined); }}
          onSaved={load}
        />
      )}
      {selected && (
        <AgendaEventModal mode="edit" event={selected} members={members} onClose={() => setSelected(null)} onSaved={load} />
      )}
    </div>
  );
};

const EventCard: React.FC<{ event: AgendaEvent; memberName: (id: string) => string; onClick: () => void }> = ({
  event,
  memberName,
  onClick
}) => {
  const type = TYPE_META[event.type];
  const status = STATUS_META[event.status];
  const Icon = type.icon;
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all flex items-start gap-3.5"
    >
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${type.accent} text-white flex items-center justify-center shrink-0`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-bold text-slate-900 truncate">{event.title}</h4>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${status.badge}`}>{status.label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {whenShort(event.startsAt)}
          </span>
          {event.location && (
            <span className="flex items-center gap-1 truncate max-w-[180px]">
              <MapPin className="w-3 h-3" /> {event.location}
            </span>
          )}
        </div>
        {event.assigneeIds.length > 0 && (
          <div className="flex items-center -space-x-1.5 pt-0.5">
            {event.assigneeIds.slice(0, 4).map(id => (
              <Avatar key={id} name={memberName(id)} />
            ))}
            {event.assigneeIds.length > 4 && (
              <span className="text-[10px] text-slate-400 pl-2.5">+{event.assigneeIds.length - 4}</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
};
