import type { PDIGoal, PDIGoalStatus } from '../types.js';

export const GOAL_STATUS: Record<PDIGoalStatus, { label: string; badge: string; bar: string }> = {
  not_started: { label: 'Não iniciada', badge: 'bg-slate-100 text-slate-600', bar: 'bg-slate-300' },
  in_progress: { label: 'Em andamento', badge: 'bg-indigo-100 text-indigo-800', bar: 'bg-indigo-600' },
  achieved: { label: 'Atingida', badge: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500' },
  cancelled: { label: 'Cancelada', badge: 'bg-slate-100 text-slate-500', bar: 'bg-slate-300' }
};

/** Order used to list goals: still open first (nearest deadline first), then achieved, then cancelled. */
const GOAL_ORDER: Record<PDIGoalStatus, number> = { in_progress: 0, not_started: 0, achieved: 1, cancelled: 2 };

export const isOpenGoal = (goal: PDIGoal) => goal.status === 'not_started' || goal.status === 'in_progress';

export const isGoalOverdue = (goal: PDIGoal, today: string) => isOpenGoal(goal) && goal.deadline < today;

/** Same rule as the server: only a goal nobody worked on is deleted; anything else is cancelled to keep its history. */
export const canDeleteGoal = (goal: PDIGoal) => goal.status === 'not_started' && !(goal.history?.length);

export const sortGoals = (goals: PDIGoal[]): PDIGoal[] =>
  [...goals].sort((a, b) => GOAL_ORDER[a.status] - GOAL_ORDER[b.status] || a.deadline.localeCompare(b.deadline));

/** Average progress of the goals that still count (cancelled ones are left out); null when there is none. */
export function overallProgress(goals: PDIGoal[]): number | null {
  const counted = goals.filter(g => g.status !== 'cancelled');
  if (counted.length === 0) return null;
  return Math.round(counted.reduce((sum, g) => sum + g.progressPercentage, 0) / counted.length);
}

/** Time of the "next 1:1" appointment in the Agenda when none is chosen (same default as the server). */
export const DEFAULT_MEETING_TIME = '09:00';

/** Half-hour slots from 07:00 to 20:00; a time that is already scheduled outside the grid (e.g. 10:15) is kept as an option. */
export function meetingTimeOptions(current?: string): { value: string; label: string }[] {
  const times: string[] = [];
  for (let minutes = 7 * 60; minutes <= 20 * 60; minutes += 30) {
    times.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
  }
  if (current && !times.includes(current)) times.push(current);
  return times.sort().map(t => ({ value: t, label: t }));
}

/** Default deadline of a new goal: one quarter (90 days) from the given calendar day (AAAA-MM-DD). */
export function quarterFrom(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 90);
  return d.toISOString().split('T')[0];
}

/** PDI a que pertence um compromisso da Agenda criado para o próximo 1:1 (id `agd-pdi~<pdi>~<sufixo>`). */
export const recordIdOfMeeting = (eventId: string): string => eventId.split('~')[1] ?? '';
