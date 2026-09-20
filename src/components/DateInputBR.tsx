import React, { useEffect, useState } from 'react';
import { Calendar, Clock } from 'lucide-react';

/**
 * Native <input type="date"/"datetime-local"> render their picker and typed value in the
 * BROWSER's own language, not the page's — on an English browser that means MM/DD/YYYY and
 * AM/PM regardless of pt-BR copy everywhere else. These components are plain masked text
 * inputs instead, so the format is always DD/MM/AAAA (and 24h HH:mm), independent of the
 * viewer's browser/OS locale. The value contract they emit is unchanged: '' or 'YYYY-MM-DD'
 * for DateInputBR, '' or 'YYYY-MM-DDTHH:mm' for DateTimeInputBR — the same strings a native
 * date/datetime-local input would have produced, so callers never need to change.
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

interface DateInputBRProps {
  /** '' or 'YYYY-MM-DD'. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  required?: boolean;
  className?: string;
}

/** Date-only field, always displayed and typed as DD/MM/AAAA. */
export const DateInputBR: React.FC<DateInputBRProps> = ({ value, onChange, id, required, className }) => {
  const [digits, setDigits] = useState(() => isoDateToDigits(value));
  useEffect(() => setDigits(isoDateToDigits(value)), [value]);
  const invalid = digits.length === 8 && !dateDigitsToISO(digits);

  return (
    <div className="relative">
      <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        inputMode="numeric"
        id={id}
        required={required}
        placeholder="DD/MM/AAAA"
        maxLength={10}
        value={formatDateDigits(digits)}
        onChange={(e) => {
          const d = onlyDigits(e.target.value, 8);
          setDigits(d);
          onChange(dateDigitsToISO(d));
        }}
        className={`${className ?? DEFAULT_CLS} ${errCls(invalid)}`}
      />
    </div>
  );
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

  const emit = (dDigits: string, tDigits: string) => {
    const iso = dateDigitsToISO(dDigits);
    if (iso && timeDigitsValid(tDigits)) onChange(`${iso}T${tDigits.slice(0, 2)}:${tDigits.slice(2, 4)}`);
    else onChange('');
  };

  const dateInvalid = dateDigits.length === 8 && !dateDigitsToISO(dateDigits);
  const timeInvalid = timeDigits.length === 4 && !timeDigitsValid(timeDigits);

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          inputMode="numeric"
          required={required}
          placeholder="DD/MM/AAAA"
          maxLength={10}
          value={formatDateDigits(dateDigits)}
          onChange={(e) => {
            const d = onlyDigits(e.target.value, 8);
            setDateDigits(d);
            emit(d, timeDigits);
          }}
          className={`${DEFAULT_CLS} ${errCls(dateInvalid)}`}
        />
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
            emit(dateDigits, t);
          }}
          className={`${DEFAULT_CLS} ${errCls(timeInvalid)}`}
        />
      </div>
    </div>
  );
};
