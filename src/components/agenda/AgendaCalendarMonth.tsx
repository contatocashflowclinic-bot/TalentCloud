import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { AgendaEvent } from '../../types.js';
import { formatTimeSP, spDateKey } from '../../utils/dateUtils.js';

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

interface Cell {
  key: string;
  day: number;
  inMonth: boolean;
}

function buildGrid(year: number, month: number): Cell[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const start = new Date(year, month, 1 - firstWeekday);
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ key: keyOf(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return cells;
}

interface Props {
  events: AgendaEvent[];
  memberName: (id: string) => string;
  onSelectEvent: (event: AgendaEvent) => void;
  onCreateOnDate: (dateKey: string) => void;
}

/** Month-grid calendar — the familiar clinic/office scheduling view, with today highlighted. */
export const AgendaCalendarMonth: React.FC<Props> = ({ events, memberName, onSelectEvent, onCreateOnDate }) => {
  const todayKey = spDateKey(new Date());
  const [cursor, setCursor] = useState(() => {
    const [y, m] = todayKey.split('-').map(Number);
    return { year: y, month: m - 1 };
  });
  const [openDay, setOpenDay] = useState<string | null>(todayKey);

  const cells = useMemo(() => buildGrid(cursor.year, cursor.month), [cursor]);

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
    const [y, m] = todayKey.split('-').map(Number);
    setCursor({ year: y, month: m - 1 });
    setOpenDay(todayKey);
  };
  const shiftMonth = (delta: number) =>
    setCursor(prev => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const openDayEvents = openDay ? (eventsByDay.get(openDay) ?? []) : [];
  const openDayLabel = openDay
    ? new Date(Number(openDay.slice(0, 4)), Number(openDay.slice(5, 7)) - 1, Number(openDay.slice(8, 10)))
        .toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900 capitalize">
          {MONTH_LABELS[cursor.month]} {cursor.year}
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={goToday} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors">
            Hoje
          </button>
          <button onClick={() => shiftMonth(-1)} aria-label="Mês anterior" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => shiftMonth(1)} aria-label="Próximo mês" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

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
            <button
              key={cell.key}
              onClick={() => setOpenDay(cell.key)}
              className={`min-h-[76px] sm:min-h-[92px] p-1.5 border-b border-r border-slate-100 flex flex-col items-start gap-1 text-left transition-colors ${
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
                  <div key={ev.id} className={`px-1.5 py-0.5 rounded text-[9px] font-semibold truncate ${TYPE_CHIP[ev.type]}`}>
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 2 && <div className="text-[9px] text-slate-400 pl-1">+{dayEvents.length - 2} mais</div>}
              </div>
            </button>
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
                <button
                  key={ev.id}
                  onClick={() => onSelectEvent(ev)}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 text-left transition-colors"
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
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
