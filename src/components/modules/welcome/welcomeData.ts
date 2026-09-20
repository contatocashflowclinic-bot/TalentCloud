import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext.js';
import { useTenant } from '../../../context/TenantContext.js';
import { TenantApi } from '../../../services/api.js';
import {
  AgendaDirectoryMember,
  AgendaEvent,
  Candidate,
  InterviewSession,
  JobOffer,
  JobOpening,
  SelectionApplication
} from '../../../types.js';
import { formatDateSP, formatTimeSP, spDateKey } from '../../../utils/dateUtils.js';

const DAY_MS = 86_400_000;

export type Priority = 'late' | 'high' | 'normal';

/** Each list is `undefined` when the signed-in person cannot see that data (or it failed to load): the matching block is simply left out. */
export interface WelcomeSource {
  openings?: JobOpening[];
  candidates?: Candidate[];
  applications?: SelectionApplication[];
  interviews?: InterviewSession[];
  offers?: JobOffer[];
  events: AgendaEvent[];
}

export interface WelcomeStats {
  openJobs?: { total: number; thisWeek: number };
  newCandidates?: { total: number; thisWeek: number };
  interviewsToday?: { today: number; yesterday: number };
}

export interface TodayItem {
  id: string;
  kind: 'interview' | 'meeting' | 'task';
  title: string;
  subtitle: string;
  startsAt: string;
  endsAt?: string;
  done: boolean;
  link?: { url: string; label: string };
  /** Present for Agenda Corporativa items (opens the edit modal); interviews open their own module. */
  event?: AgendaEvent;
}

export interface PendingItem {
  id: string;
  kind: 'offer' | 'review' | 'interview' | 'task';
  title: string;
  detail: string;
  priority: Priority;
  moduleId: number;
}

export interface WelcomeView {
  stats: WelcomeStats;
  today: TodayItem[];
  pending: PendingItem[];
  lateCount: number;
}

const PRIORITY_RANK: Record<Priority, number> = { late: 0, high: 1, normal: 2 };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const isUrl = (value?: string) => !!value && /^https?:\/\//i.test(value.trim());

/** "Meet", "Teams", "Zoom" — or a generic "Link" — for a meeting URL. */
function linkLabel(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('meet.google')) return 'Meet';
  if (u.includes('teams.')) return 'Teams';
  if (u.includes('zoom.')) return 'Zoom';
  return 'Link';
}

const withinDays = (iso: string, days: number, now: number) => {
  const t = Date.parse(iso);
  return !Number.isNaN(t) && now - t <= days * DAY_MS && t <= now;
};

export function buildWelcomeView(
  source: WelcomeSource,
  ctx: { userId?: string; canEditOffers: boolean },
  nowDate: Date = new Date()
): WelcomeView {
  const now = nowDate.getTime();
  const todayKey = spDateKey(nowDate);
  const yesterdayKey = spDateKey(now - DAY_MS);
  const tomorrowKey = spDateKey(now + DAY_MS);

  const { openings, candidates, applications, interviews, offers, events } = source;
  const jobTitle = (id: string) => openings?.find(o => o.id === id)?.title;
  const candidateName = (id: string) => candidates?.find(c => c.id === id)?.name;

  // ---- KPI cards -------------------------------------------------------
  const stats: WelcomeStats = {};
  if (openings) {
    const open = openings.filter(o => o.status === 'open' || o.status === 'in_progress');
    stats.openJobs = { total: open.length, thisWeek: open.filter(o => withinDays(o.openedAt, 7, now)).length };
  }
  if (candidates) {
    const recent = candidates.filter(c => !c.archived && withinDays(c.registeredAt, 30, now));
    stats.newCandidates = { total: recent.length, thisWeek: recent.filter(c => withinDays(c.registeredAt, 7, now)).length };
  }
  if (interviews) {
    const on = (key: string) => interviews.filter(i => i.status !== 'cancelled' && spDateKey(i.scheduledFor) === key).length;
    stats.interviewsToday = { today: on(todayKey), yesterday: on(yesterdayKey) };
  }

  // ---- Agenda de hoje --------------------------------------------------
  const today: TodayItem[] = [];
  for (const ev of events) {
    if (ev.status === 'cancelled' || spDateKey(ev.startsAt) !== todayKey) continue;
    const people = ev.assigneeIds.length;
    const place = ev.location && !isUrl(ev.location) ? ev.location : null;
    const subtitle = [
      ev.type === 'meeting' ? 'Reunião' : 'Tarefa',
      place,
      people > 0 ? plural(people, ev.type === 'meeting' ? 'participante' : 'responsável', ev.type === 'meeting' ? 'participantes' : 'responsáveis') : null
    ].filter(Boolean).join(' • ');
    today.push({
      id: `ev-${ev.id}`,
      kind: ev.type,
      title: ev.title,
      subtitle,
      startsAt: ev.startsAt,
      endsAt: ev.endsAt,
      done: ev.status === 'done',
      link: isUrl(ev.location) ? { url: ev.location!.trim(), label: linkLabel(ev.location!) } : undefined,
      event: ev
    });
  }
  for (const it of interviews ?? []) {
    if (it.status === 'cancelled' || spDateKey(it.scheduledFor) !== todayKey) continue;
    const name = candidateName(it.candidateId);
    today.push({
      id: `int-${it.id}`,
      kind: 'interview',
      title: name ? `Entrevista com ${name}` : 'Entrevista',
      subtitle: [jobTitle(it.jobOpeningId), it.stageName].filter(Boolean).join(' • '),
      startsAt: it.scheduledFor,
      endsAt: new Date(Date.parse(it.scheduledFor) + it.durationMinutes * 60_000).toISOString(),
      done: it.status === 'completed',
      link: it.meetLink ? { url: it.meetLink, label: linkLabel(it.meetLink) } : undefined
    });
  }
  today.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  // ---- Pendências prioritárias ----------------------------------------
  const pending: PendingItem[] = [];

  if (offers && ctx.canEditOffers) {
    for (const o of offers.filter(x => x.status === 'pending_approval')) {
      const name = candidateName(o.candidateId);
      const job = jobTitle(o.jobOpeningId);
      pending.push({
        id: `offer-${o.id}`,
        kind: 'offer',
        title: name ? `Aprovar proposta de ${name}` : 'Aprovar proposta',
        detail: [job, `início em ${formatDateSP(o.startDate)}`].filter(Boolean).join(' • '),
        priority: o.startDate < todayKey ? 'late' : o.approverId === ctx.userId ? 'high' : 'normal',
        moduleId: 11
      });
    }
  }

  if (applications) {
    const byJob = new Map<string, SelectionApplication[]>();
    for (const a of applications.filter(x => x.status === 'in_review')) {
      const job = openings?.find(o => o.id === a.jobOpeningId);
      if (openings && (!job || (job.status !== 'open' && job.status !== 'in_progress'))) continue;
      byJob.set(a.jobOpeningId, [...(byJob.get(a.jobOpeningId) ?? []), a]);
    }
    for (const [jobId, list] of byJob) {
      const oldest = Math.min(...list.map(a => Date.parse(a.appliedAt)).filter(t => !Number.isNaN(t)));
      pending.push({
        id: `review-${jobId}`,
        kind: 'review',
        title: `Avaliar candidatos da vaga de ${jobTitle(jobId) ?? 'sua seleção'}`,
        detail: `${plural(list.length, 'candidato aguardando', 'candidatos aguardando')} avaliação`,
        priority: now - oldest > 7 * DAY_MS ? 'late' : list.length >= 5 ? 'high' : 'normal',
        moduleId: 8
      });
    }
  }

  if (interviews) {
    const finished = interviews.filter(
      i => i.status === 'scheduled' && Date.parse(i.scheduledFor) + i.durationMinutes * 60_000 < now
    );
    if (finished.length > 0) {
      pending.push({
        id: 'interviews-scorecard',
        kind: 'interview',
        title: 'Registrar o resultado das entrevistas realizadas',
        detail: `${plural(finished.length, 'entrevista aguardando', 'entrevistas aguardando')} scorecard`,
        priority: 'late',
        moduleId: 10
      });
    }
    const tomorrow = interviews.filter(i => i.status === 'scheduled' && spDateKey(i.scheduledFor) === tomorrowKey);
    if (tomorrow.length > 0) {
      pending.push({
        id: 'interviews-tomorrow',
        kind: 'interview',
        title: 'Preparar as entrevistas de amanhã',
        detail: `${plural(tomorrow.length, 'entrevista agendada', 'entrevistas agendadas')} para amanhã`,
        priority: 'normal',
        moduleId: 10
      });
    }
  }

  for (const ev of events) {
    if (ev.type !== 'task' || (ev.status !== 'scheduled' && ev.status !== 'in_progress')) continue;
    const mine = ev.assigneeIds.length > 0 ? ev.assigneeIds.includes(ctx.userId ?? '') : ev.createdById === ctx.userId;
    if (!mine) continue;
    const dueKey = spDateKey(ev.startsAt);
    if (dueKey > todayKey) continue;
    const late = dueKey < todayKey;
    pending.push({
      id: `task-${ev.id}`,
      kind: 'task',
      title: ev.title,
      detail: late ? `Tarefa • venceu em ${formatDateSP(ev.startsAt)}` : `Tarefa • vence hoje às ${formatTimeSP(ev.startsAt)}`,
      priority: late ? 'late' : 'high',
      moduleId: 17
    });
  }

  pending.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  return { stats, today, pending, lateCount: pending.filter(p => p.priority === 'late').length };
}

/** Loads only what the signed-in person is allowed to see, then derives the Welcome screen's view of it. */
export function useWelcomeData() {
  const { activeTenant, can, permissions } = useTenant();
  const { user } = useAuth();
  const [source, setSource] = useState<WelcomeSource | null>(null);
  const [members, setMembers] = useState<AgendaDirectoryMember[]>([]);
  const [loading, setLoading] = useState(true);
  const latestRequest = useRef(0);
  const permissionsKey = permissions.join('|');

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    /** One failing endpoint must not blank the whole screen: it just drops its own block. */
    const safely = async <T,>(allowed: boolean, fetcher: () => Promise<T>): Promise<T | undefined> => {
      if (!allowed) return undefined;
      try {
        return await fetcher();
      } catch (err) {
        console.error('Welcome: failed to load a data source:', err);
        return undefined;
      }
    };

    const [openings, candidates, applications, interviews, offers, events, directory] = await Promise.all([
      safely(can('openings:view'), TenantApi.getOpenings),
      safely(can('candidates:view'), TenantApi.getCandidates),
      safely(can('selection:view'), TenantApi.getApplications),
      safely(can('interviews:view'), TenantApi.getInterviews),
      safely(can('offers:view'), TenantApi.getOffers),
      safely(true, TenantApi.getAgendaEvents),
      safely(true, TenantApi.getAgendaDirectory)
    ]);

    if (request !== latestRequest.current) return; // a newer load (e.g. tenant switch) superseded this one
    setSource({ openings, candidates, applications, interviews, offers, events: events ?? [] });
    setMembers(directory ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenant?.id, permissionsKey]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const view = useMemo(
    () => (source ? buildWelcomeView(source, { userId: user?.id, canEditOffers: can('offers:edit') }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, user?.id, permissionsKey]
  );

  return { view, members, loading, reload: load };
}
