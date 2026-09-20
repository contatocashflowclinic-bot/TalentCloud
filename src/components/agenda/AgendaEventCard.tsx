import React from 'react';
import { CheckSquare, Clock, MapPin, Pencil, Trash2, Video } from 'lucide-react';
import { AgendaEvent } from '../../types.js';
import { formatLongDateSP, formatTimeSP } from '../../utils/dateUtils.js';

export const STATUS_META: Record<AgendaEvent['status'], { label: string; badge: string }> = {
  scheduled: { label: 'Agendado', badge: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'Em andamento', badge: 'bg-amber-100 text-amber-700' },
  done: { label: 'Concluído', badge: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelado', badge: 'bg-slate-200 text-slate-500' }
};

export const TYPE_META: Record<AgendaEvent['type'], { label: string; icon: React.ComponentType<{ className?: string }>; accent: string }> = {
  meeting: { label: 'Reunião', icon: Video, accent: 'from-indigo-500 to-blue-500' },
  task: { label: 'Tarefa', icon: CheckSquare, accent: 'from-emerald-500 to-teal-500' }
};

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

export const Avatar: React.FC<{ name: string; className?: string }> = ({ name, className }) => (
  <div
    title={name}
    className={`shrink-0 rounded-full bg-indigo-100 text-indigo-700 border-2 border-white flex items-center justify-center font-bold uppercase ${className ?? 'w-6 h-6 text-[9px]'}`}
  >
    {initials(name)}
  </div>
);

/** "Hoje", "Amanhã" or the full date, in São Paulo time. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000);
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Amanhã';
  if (diffDays === -1) return 'Ontem';
  return formatLongDateSP(d);
}

/** Short "when" label, e.g. "Hoje · 14:30". */
export const whenShort = (iso: string) => `${dayLabel(iso)} · ${formatTimeSP(iso)}`;

/** One compromisso card — edit/delete shortcuts only show when `canManage` (the signed-in person created it). */
export const EventCard: React.FC<{
  event: AgendaEvent;
  memberName: (id: string) => string;
  canManage: boolean;
  onClick: () => void;
  onDelete: () => void;
}> = ({ event, memberName, canManage, onClick, onDelete }) => {
  const type = TYPE_META[event.type];
  const status = STATUS_META[event.status];
  const Icon = type.icon;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="w-full text-left p-4 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all flex items-start gap-3.5 cursor-pointer"
    >
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${type.accent} text-white flex items-center justify-center shrink-0`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-bold text-slate-900 truncate">{event.title}</h4>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${status.badge}`}>{status.label}</span>
            {canManage && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onClick(); }}
                  title="Editar"
                  aria-label="Editar compromisso"
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-indigo-600 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  title="Excluir"
                  aria-label="Excluir compromisso"
                  className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
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
    </div>
  );
};
