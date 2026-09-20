import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

/**
 * Native <input type="date"/"datetime-local"> render their picker and typed value in the
 * BROWSER's own language, not the page's — on an English browser that means MM/DD/YYYY and
 * AM/PM regardless of pt-BR copy everywhere else. These components are plain masked text
 * inputs instead, so the format is always DD/MM/AAAA (and 24h HH:mm), independent of the
 * viewer's browser/OS locale. The value contract they emit is unchanged: '' or 'YYYY-MM-DD'
 * for DateInputBR, '' or 'YYYY-MM-DDTHH:mm' for DateTimeInputBR — the same strings a native
 * date/datetime-local input would have produced, so callers never need to change. A small
 * calendar popover (opened from the icon or by focusing the field) covers picking the date
 * with the mouse, same as the native picker did.
 */

const DEFAULT_CLS = 'w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500';
const onlyDigits = (s: string, max: number) => s.replace(/\D/g, '').slice(0, max);

const formatDateDigits = (d: string) => {
  const dd = d.slice(0, 2), mm = d.slice(2, 4), yyyy = d.slice(4, 8);
  return mm ? (yyyy ? `${dd}/${mm}/${yyyy}` : `${dd}/${mm}`) : dd;
};
const formatTimeDigits = (t: string) => {
  const hh = t.slice(0, 2), mm = t.slice(2, 4);
  return mm ? `${hh}:${mm}` : hh;
};

const isValidCalendarDate = (d: number, m: number, y: number) => {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};
const isValidClockTime = (h: number, min: number) => h >= 0 && h <= 23 && min >= 0 && min <= 59;

function dateDigitsToISO(digits: string): string {
  if (digits.length !== 8) return '';
  const d = Number(digits.slice(0, 2));
  const m = Number(digits.slice(2, 4));
  const y = Number(digits.slice(4, 8));
  return isValidCalendarDate(d, m, y) ? `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}` : '';
}
function isoDateToDigits(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}${m[2]}${m[1]}` : '';
}
function timeDigitsValid(digits: string): boolean {
  if (digits.length !== 4) return false;
  return isValidClockTime(Number(digits.slice(0, 2)), Number(digits.slice(2, 4)));
}
function isoTimeToDigits(hhmm: string | undefined): string {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm ?? '');
  return m ? `${m[1]}${m[2]}` : '';
}

const errCls = (invalid: boolean) => (invalid ? 'border-rose-300 focus:border-rose-400 text-rose-700' : 'border-slate-200 focus:border-indigo-500');

// ---------------------------------------------------------------------------
// Mini calendar popover — pick-a-date only, no events (see AgendaCalendarMonth
// for the full month-grid view with compromissos).
// ---------------------------------------------------------------------------
const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
const pad2 = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const todayKey = () => {
  const t = new Date();
  return keyOf(t.getFullYear(), t.getMonth(), t.getDate());
};

function buildMiniGrid(year: number, month: number) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const start = new Date(year, month, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { key: keyOf(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: d.getMonth() === month };
  });
}

const MiniCalendar: React.FC<{ selectedKey?: string; onSelect: (key: string) => void }> = ({ selectedKey, onSelect }) => {
  const [cursor, setCursor] = useState(() => {
    const [y, m] = (selectedKey || todayKey()).split('-').map(Number);
    return { year: y, month: m - 1 };
  });
  const cells = useMemo(() => buildMiniGrid(cursor.year, cursor.month), [cursor]);
  const shiftMonth = (delta: number) =>
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  const tKey = todayKey();

  return (
    <div className="w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-3" onMouseDown={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-slate-900 capitalize">
          {MONTH_LABELS[cursor.month]} {cursor.year}
        </span>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Mês anterior" className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Próximo mês" className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i} className="text-center text-[10px] font-bold text-slate-400">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((cell) => {
          const isToday = cell.key === tKey;
          const isSelected = cell.key === selectedKey;
          return (
            <button
              type="button"
              key={cell.key}
              onClick={() => onSelect(cell.key)}
              className={`w-8 h-8 mx-auto rounded-full text-xs font-semibold flex items-center justify-center transition-colors ${
                isSelected
                  ? 'bg-indigo-600 text-white'
                  : isToday
                    ? 'text-indigo-600 font-bold'
                    : cell.inMonth
                      ? 'text-slate-700 hover:bg-slate-100'
                      : 'text-slate-300 hover:bg-slate-50'
              }`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Text field for one date, with the calendar icon (or focusing it) opening a pick-a-date popover. */
const DateDigitsField: React.FC<{
  digits: string;
  setDigits: (d: string) => void;
  onCommit: (iso: string) => void;
  id?: string;
  required?: boolean;
  className?: string;
}> = ({ digits, setDigits, onCommit, id, required, className }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const invalid = digits.length === 8 && !dateDigitsToISO(digits);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setOpen((o) => !o)}
        aria-label="Abrir calendário"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
      >
        <Calendar className="w-4 h-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        id={id}
        required={required}
        placeholder="DD/MM/AAAA"
        maxLength={10}
        value={formatDateDigits(digits)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        onChange={(e) => {
          const d = onlyDigits(e.target.value, 8);
          setDigits(d);
          onCommit(dateDigitsToISO(d));
        }}
        className={`${className ?? DEFAULT_CLS} ${errCls(invalid)}`}
      />
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1.5">
          <MiniCalendar
            selectedKey={dateDigitsToISO(digits) || undefined}
            onSelect={(key) => {
              setDigits(isoDateToDigits(key));
              onCommit(key);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
};

interface DateInputBRProps {
  /** '' or 'YYYY-MM-DD'. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  required?: boolean;
  className?: string;
}

/** Date-only field, always displayed and typed as DD/MM/AAAA, with a calendar popover to pick it visually. */
export const DateInputBR: React.FC<DateInputBRProps> = ({ value, onChange, id, required, className }) => {
  const [digits, setDigits] = useState(() => isoDateToDigits(value));
  useEffect(() => setDigits(isoDateToDigits(value)), [value]);

  return <DateDigitsField digits={digits} setDigits={setDigits} onCommit={onChange} id={id} required={required} className={className} />;
};

interface DateTimeInputBRProps {
  /** '' or 'YYYY-MM-DDTHH:mm'. */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

/** Date + time field, always displayed and typed as DD/MM/AAAA and 24h HH:mm — two joined inputs. */
export const DateTimeInputBR: React.FC<DateTimeInputBRProps> = ({ value, onChange, required }) => {
  const [datePart, timePart] = value ? value.split('T') : ['', ''];
  const [dateDigits, setDateDigits] = useState(() => isoDateToDigits(datePart));
  const [timeDigits, setTimeDigits] = useState(() => isoTimeToDigits(timePart));

  useEffect(() => {
    const [d, t] = value ? value.split('T') : ['', ''];
    setDateDigits(isoDateToDigits(d));
    setTimeDigits(isoTimeToDigits(t));
  }, [value]);

  const emit = (dateIso: string, tDigits: string) => {
    if (dateIso && timeDigitsValid(tDigits)) onChange(`${dateIso}T${tDigits.slice(0, 2)}:${tDigits.slice(2, 4)}`);
    else onChange('');
  };

  const timeInvalid = timeDigits.length === 4 && !timeDigitsValid(timeDigits);

  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <DateDigitsField digits={dateDigits} setDigits={setDateDigits} onCommit={(iso) => emit(iso, timeDigits)} required={required} />
      </div>
      <div className="relative w-[110px] shrink-0">
        <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          inputMode="numeric"
          required={required}
          placeholder="HH:MM"
          maxLength={5}
          value={formatTimeDigits(timeDigits)}
          onChange={(e) => {
            const t = onlyDigits(e.target.value, 4);
            setTimeDigits(t);
            emit(dateDigitsToISO(dateDigits), t);
          }}
          className={`${DEFAULT_CLS} ${errCls(timeInvalid)}`}
        />
      </div>
    </div>
  );
};
