import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { AgendaEvent } from '../../types.js';
import { formatTimeSP, spDateKey } from '../../utils/dateUtils.js';
import { EventCard } from './AgendaEventCard.js';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const TYPE_CHIP: Record<AgendaEvent['type'], string> = {
  meeting: 'bg-indigo-100 text-indigo-700',
  task: 'bg-emerald-100 text-emerald-700'
};

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parseDateKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (key: string, n: number): string => {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return keyOf(d.getFullYear(), d.getMonth(), d.getDate());
};
const addMonths = (key: string, n: number): string => {
  const d = parseDateKey(key);
  d.setMonth(d.getMonth() + n, 1); // day 1 first, so e.g. 31 Jan + 1 month never overflows into March
  return keyOf(d.getFullYear(), d.getMonth(), d.getDate());
};
const startOfWeek = (key: string): string => addDays(key, -parseDateKey(key).getDay());

interface Cell {
  key: string;
  day: number;
  inMonth: boolean;
}

function buildMonthGrid(year: number, month: number): Cell[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const start = new Date(year, month, 1 - firstWeekday);
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ key: keyOf(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return cells;
}

type Granularity = 'month' | 'week' | 'day';

const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: 'month', label: 'Mês' },
  { id: 'week', label: 'Semana' },
  { id: 'day', label: 'Dia' }
];

interface Props {
  events: AgendaEvent[];
  memberName: (id: string) => string;
  canManage: (event: AgendaEvent) => boolean;
  onSelectEvent: (event: AgendaEvent) => void;
  onCreateOnDate: (dateKey: string) => void;
  onDeleteEvent: (event: AgendaEvent) => void;
}

/** Calendar with Mês/Semana/Dia views — the familiar clinic/office scheduling layouts, today always highlighted. */
export const AgendaCalendar: React.FC<Props> = ({ events, memberName, canManage, onSelectEvent, onCreateOnDate, onDeleteEvent }) => {
  const todayKey = spDateKey(new Date());
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [anchor, setAnchor] = useState(todayKey);
  const [openDay, setOpenDay] = useState<string | null>(todayKey);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    for (const ev of events) {
      const key = spDateKey(ev.startsAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    for (const list of map.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return map;
  }, [events]);

  const goToday = () => {
    setAnchor(todayKey);
    setOpenDay(todayKey);
  };
  const shift = (dir: 1 | -1) =>
    setAnchor(prev => {
      if (granularity === 'month') return addMonths(prev, dir);
      if (granularity === 'week') return addDays(prev, dir * 7);
      return addDays(prev, dir);
    });

  const anchorDate = parseDateKey(anchor);
  const title = useMemo(() => {
    if (granularity === 'month') return `${MONTH_LABELS[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`;
    if (granularity === 'day') {
      return anchorDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    const start = parseDateKey(startOfWeek(anchor));
    const end = parseDateKey(addDays(startOfWeek(anchor), 6));
    const startStr = start.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
    const endStr = end.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${startStr} – ${endStr}`;
  }, [granularity, anchor]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900 capitalize">{title}</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
            {GRANULARITIES.map(g => (
              <button
                key={g.id}
                onClick={() => setGranularity(g.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  granularity === g.id ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={goToday} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors">
              Hoje
            </button>
            <button onClick={() => shift(-1)} aria-label="Anterior" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => shift(1)} aria-label="Próximo" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {granularity === 'month' && (
        <MonthView
          anchor={anchor}
          todayKey={todayKey}
          openDay={openDay}
          eventsByDay={eventsByDay}
          memberName={memberName}
          canManage={canManage}
          onOpenDay={setOpenDay}
          onSelectEvent={onSelectEvent}
          onCreateOnDate={onCreateOnDate}
          onDeleteEvent={onDeleteEvent}
        />
      )}

      {granularity === 'week' && (
        <WeekView
          anchor={anchor}
          todayKey={todayKey}
          eventsByDay={eventsByDay}
          onSelectEvent={onSelectEvent}
          onDrillIntoDay={(key) => { setAnchor(key); setGranularity('day'); }}
          onCreateOnDate={onCreateOnDate}
        />
      )}

      {granularity === 'day' && (
        <DayView
          anchor={anchor}
          events={eventsByDay.get(anchor) ?? []}
          memberName={memberName}
          canManage={canManage}
          onSelectEvent={onSelectEvent}
          onCreateOnDate={onCreateOnDate}
          onDeleteEvent={onDeleteEvent}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Mês: the classic grid, with a day panel below for whichever day is open.
// ---------------------------------------------------------------------------------------------
const MonthView: React.FC<{
  anchor: string;
  todayKey: string;
  openDay: string | null;
  eventsByDay: Map<string, AgendaEvent[]>;
  memberName: (id: string) => string;
  canManage: (event: AgendaEvent) => boolean;
  onOpenDay: (key: string) => void;
  onSelectEvent: (event: AgendaEvent) => void;
  onCreateOnDate: (dateKey: string) => void;
  onDeleteEvent: (event: AgendaEvent) => void;
}> = ({ anchor, todayKey, openDay, eventsByDay, memberName, canManage, onOpenDay, onSelectEvent, onCreateOnDate, onDeleteEvent }) => {
  const anchorDate = parseDateKey(anchor);
  const cells = useMemo(() => buildMonthGrid(anchorDate.getFullYear(), anchorDate.getMonth()), [anchor]);
  const openDayEvents = openDay ? (eventsByDay.get(openDay) ?? []) : [];
  const openDayLabel = openDay
    ? parseDateKey(openDay).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  /** Empty day: one click goes straight to scheduling. A day with compromissos still opens the panel below,
   * so overflowing days ("+N mais") stay reachable — its own "Novo compromisso" button covers adding another. */
  const handleDayClick = (key: string) => {
    onOpenDay(key);
    if (!(eventsByDay.get(key) ?? []).length) onCreateOnDate(key);
  };

  return (
    <>
      <div className="grid grid-cols-7 border-b border-slate-100">
        {WEEKDAY_LABELS.map(w => (
          <div key={w} className="py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const dayEvents = eventsByDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          const isSelected = cell.key === openDay;
          return (
            <div
              key={cell.key}
              role="button"
              tabIndex={0}
              onClick={() => handleDayClick(cell.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDayClick(cell.key); } }}
              className={`min-h-[76px] sm:min-h-[92px] p-1.5 border-b border-r border-slate-100 flex flex-col items-start gap-1 text-left transition-colors cursor-pointer ${
                idx % 7 === 6 ? 'border-r-0' : ''
              } ${isSelected ? 'bg-indigo-50/70' : cell.inMonth ? 'hover:bg-slate-50' : 'bg-slate-50/50'}`}
            >
              <span
                className={`w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-bold ${
                  isToday ? 'bg-indigo-600 text-white' : cell.inMonth ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                {cell.day}
              </span>
              <div className="w-full space-y-0.5">
                {dayEvents.slice(0, 2).map(ev => (
                  <button
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onSelectEvent(ev); }}
                    title={ev.title}
                    className={`w-full text-left px-1.5 py-0.5 rounded text-[9px] font-semibold truncate transition-opacity hover:opacity-80 ${TYPE_CHIP[ev.type]}`}
                  >
                    {ev.title}
                  </button>
                ))}
                {dayEvents.length > 2 && <div className="text-[9px] text-slate-400 pl-1">+{dayEvents.length - 2} mais</div>}
              </div>
            </div>
          );
        })}
      </div>

      {openDay && (
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-700 capitalize">{openDayLabel}</h4>
            <button
              onClick={() => onCreateOnDate(openDay)}
              className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
            >
              <Plus className="w-3.5 h-3.5" /> Novo compromisso
            </button>
          </div>
          {openDayEvents.length === 0 ? (
            <p className="text-[11px] text-slate-400">Nenhum compromisso neste dia.</p>
          ) : (
            <div className="space-y-1.5">
              {openDayEvents.map(ev => (
                <div
                  key={ev.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectEvent(ev)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectEvent(ev); } }}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 text-left transition-colors cursor-pointer"
                >
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${TYPE_CHIP[ev.type]}`}>
                    {ev.type === 'meeting' ? 'Reunião' : 'Tarefa'}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 shrink-0">{formatTimeSP(ev.startsAt)}</span>
                  <span className="text-xs font-semibold text-slate-800 truncate">{ev.title}</span>
                  {ev.assigneeIds.length > 0 && (
                    <span className="ml-auto text-[10px] text-slate-400 truncate max-w-[120px]">
                      {ev.assigneeIds.map(memberName).join(', ')}
                    </span>
                  )}
                  {canManage(ev) && (
                    <div className="flex items-center gap-1 shrink-0 pl-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectEvent(ev); }}
                        title="Editar"
                        aria-label="Editar compromisso"
                        className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteEvent(ev); }}
                        title="Excluir"
                        aria-label="Excluir compromisso"
                        className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------------------------
// Semana: 7 columns, one per day, each listing its compromissos as small chips.
// ---------------------------------------------------------------------------------------------
const WeekView: React.FC<{
  anchor: string;
  todayKey: string;
  eventsByDay: Map<string, AgendaEvent[]>;
  onSelectEvent: (event: AgendaEvent) => void;
  onDrillIntoDay: (dateKey: string) => void;
  onCreateOnDate: (dateKey: string) => void;
}> = ({ anchor, todayKey, eventsByDay, onSelectEvent, onDrillIntoDay, onCreateOnDate }) => {
  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-slate-100">
        {weekDays.map(key => {
          const d = parseDateKey(key);
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              onClick={() => onDrillIntoDay(key)}
              className="py-2.5 text-center border-r last:border-r-0 border-slate-100 hover:bg-slate-50 transition-colors"
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{WEEKDAY_LABELS[d.getDay()]}</div>
              <div
                className={`mt-1 w-7 h-7 mx-auto rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isToday ? 'bg-indigo-600 text-white' : 'text-slate-700'
                }`}
              >
                {d.getDate()}
              </div>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-7 min-h-[280px]">
        {weekDays.map(key => {
          const dayEvents = eventsByDay.get(key) ?? [];
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => onCreateOnDate(key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCreateOnDate(key); } }}
              className="border-r last:border-r-0 border-slate-100 p-1.5 space-y-1 cursor-pointer hover:bg-slate-50/60 transition-colors"
            >
              {dayEvents.map(ev => (
                <button
                  key={ev.id}
                  onClick={(e) => { e.stopPropagation(); onSelectEvent(ev); }}
                  title={ev.title}
                  className={`w-full text-left px-1.5 py-1 rounded text-[10px] font-semibold truncate transition-opacity hover:opacity-80 ${TYPE_CHIP[ev.type]}`}
                >
                  <span className="font-mono opacity-70">{formatTimeSP(ev.startsAt)}</span> {ev.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Dia: full list of that day's compromissos, same rich card used in the Lista view.
// ---------------------------------------------------------------------------------------------
const DayView: React.FC<{
  anchor: string;
  events: AgendaEvent[];
  memberName: (id: string) => string;
  canManage: (event: AgendaEvent) => boolean;
  onSelectEvent: (event: AgendaEvent) => void;
  onCreateOnDate: (dateKey: string) => void;
  onDeleteEvent: (event: AgendaEvent) => void;
}> = ({ anchor, events, memberName, canManage, onSelectEvent, onCreateOnDate, onDeleteEvent }) => (
  <div className="p-4 space-y-2.5">
    <div className="flex items-center justify-end">
      <button
        onClick={() => onCreateOnDate(anchor)}
        className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
      >
        <Plus className="w-3.5 h-3.5" /> Novo compromisso
      </button>
    </div>
    {events.length === 0 ? (
      <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl">
        Nenhum compromisso neste dia.
      </div>
    ) : (
      events.map(ev => (
        <EventCard
          key={ev.id}
          event={ev}
          memberName={memberName}
          canManage={canManage(ev)}
          onClick={() => onSelectEvent(ev)}
          onDelete={() => onDeleteEvent(ev)}
        />
      ))
    )}
  </div>
);
