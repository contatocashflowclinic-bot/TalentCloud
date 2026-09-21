import {
  PDI_GOAL_STATUSES,
  PDI_MAX_ACTION_ITEMS,
  PDI_MAX_GOALS,
  PDI_MAX_GOAL_HISTORY,
  PDI_MAX_ONE_ON_ONES,
  type CollaboratorDevelopment,
  type OneOnOneMeeting,
  type PDIGoal,
  type PDIGoalStatus
} from '../../src/types.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { newId } from '../ids.js';

/**
 * Business rules of the Development module (PDI goals and 1:1s). Everything here is pure: the repository loads the
 * record with its row locked, calls one of the patch builders below and writes the returned patch back.
 */
type Body = Record<string, unknown>;
type RecordPatch = Partial<CollaboratorDevelopment>;

const has = (body: Body, key: string) => body[key] !== undefined;

/** Today's calendar date (AAAA-MM-DD) in São Paulo, the timezone the whole product displays. */
export const todaySP = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// ---- Field validators ------------------------------------------------------------------
export function cleanText(value: unknown, label: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ValidationError(`${label}: texto inválido.`);
  const text = value.trim();
  if (text.length > max) throw new ValidationError(`${label} deve ter no máximo ${max} caracteres.`);
  return text;
}

export function requiredText(value: unknown, label: string, max: number): string {
  const text = cleanText(value, label, max);
  if (!text) throw new ValidationError(`Campo obrigatório: ${label}.`);
  return text;
}

/** A real calendar date, AAAA-MM-DD (rejects 2026-02-30 and the like). */
export function isoDay(value: unknown, label: string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)) return value;
  }
  throw new ValidationError(`${label}: informe uma data válida.`);
}

const isBlank = (value: unknown) => value === undefined || value === null || value === '';

// ---- PDI record (person) -----------------------------------------------------------------
export interface RecordRefs {
  departmentIds: ReadonlySet<string>;
  memberIds: ReadonlySet<string>;
}

const optionalRef = (value: unknown, ids: ReadonlySet<string>, notFound: string): string | null => {
  if (isBlank(value)) return null;
  if (typeof value !== 'string' || !ids.has(value)) throw new ValidationError(notFound);
  return value;
};

/** Header fields of a PDI record from a request body; `partial` (PATCH) reads only what was sent. */
export function parseRecordFields(body: Body, partial: boolean, refs: RecordRefs): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!partial || has(body, 'collaboratorName')) out.collaboratorName = requiredText(body.collaboratorName, 'Nome do colaborador', 120);
  if (!partial || has(body, 'jobTitle')) out.jobTitle = requiredText(body.jobTitle, 'Cargo', 120);
  if (!partial || has(body, 'hireDate')) out.hireDate = isoDay(body.hireDate, 'Data de admissão');
  if (has(body, 'departmentId')) out.departmentId = optionalRef(body.departmentId, refs.departmentIds, 'Departamento não encontrado nesta organização.');
  if (has(body, 'managerId')) out.managerId = optionalRef(body.managerId, refs.memberIds, 'Gestor não encontrado nesta organização.');
  if (has(body, 'nextReviewDate')) out.nextReviewDate = isBlank(body.nextReviewDate) ? '' : isoDay(body.nextReviewDate, 'Data do próximo 1:1');
  return out;
}

/** A PDI can be deleted only while it is empty, so goals and 1:1 history are never lost by accident. */
export function assertRecordRemovable(record: CollaboratorDevelopment): void {
  if (record.goals.length > 0 || record.oneOnOnes.length > 0) {
    throw new ValidationError('Este PDI já tem metas ou 1:1s registrados e não pode ser excluído.');
  }
}

// ---- Goals -------------------------------------------------------------------------------
/** A new goal starts "not started" at 0%; the deadline defaults to one quarter (90 days) from today. */
export function buildGoal(body: Body): PDIGoal {
  const description = cleanText(body.description, 'Descrição', 1000);
  return {
    id: newId('g'),
    title: requiredText(body.title, 'Título da meta', 200),
    competency: cleanText(body.competency, 'Competência', 80) || 'Geral',
    deadline: isBlank(body.deadline) ? addDays(todaySP(), 90) : isoDay(body.deadline, 'Prazo'),
    status: 'not_started',
    progressPercentage: 0,
    ...(description ? { description } : {}),
    createdAt: new Date().toISOString()
  };
}

export function addGoal(record: CollaboratorDevelopment, goal: PDIGoal): RecordPatch {
  if (record.goals.length >= PDI_MAX_GOALS) {
    throw new ValidationError(`Este PDI já tem o máximo de ${PDI_MAX_GOALS} metas. Exclua ou conclua alguma antes de incluir outra.`);
  }
  return { goals: [...record.goals, goal] };
}

/**
 * Progress + status move together: 100% is "achieved", "achieved" is 100%, "not started" is 0%, and a cancelled goal
 * keeps its progress. Returns the updated goal; a check-in is logged whenever progress/status changed or a note came.
 */
function moveProgress(goal: PDIGoal, body: Body, by: string): PDIGoal {
  let progress = goal.progressPercentage;
  if (has(body, 'progressPercentage')) {
    const raw = body.progressPercentage;
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    if (!Number.isInteger(value) || value < 0 || value > 100) throw new ValidationError('O progresso deve ser um número inteiro de 0 a 100.');
    progress = value;
  }

  let status: PDIGoalStatus;
  if (has(body, 'status')) {
    if (!PDI_GOAL_STATUSES.includes(body.status as PDIGoalStatus)) throw new ValidationError('Status da meta inválido.');
    status = body.status as PDIGoalStatus;
  } else if (goal.status === 'cancelled') {
    throw new ValidationError('Esta meta foi cancelada. Reabra-a antes de atualizar o progresso.');
  } else if (progress === goal.progressPercentage) {
    status = goal.status;
  } else {
    status = progress >= 100 ? 'achieved' : progress > 0 ? 'in_progress' : 'not_started';
  }

  if (status === 'achieved') progress = 100;
  else if (status === 'not_started') progress = 0;
  else if (status === 'in_progress' && progress >= 100) {
    throw new ValidationError('Uma meta em andamento deve ter menos de 100%. Use o status "Atingida" para concluí-la.');
  }

  const note = cleanText(body.note, 'Observação', 500);
  const changed = progress !== goal.progressPercentage || status !== goal.status;
  if (!changed && !note) return goal;

  const at = new Date().toISOString();
  const next: PDIGoal = { ...goal, progressPercentage: progress, status };
  if (status === 'achieved') next.completedAt = goal.status === 'achieved' && goal.completedAt ? goal.completedAt : at;
  else delete next.completedAt;
  next.history = [
    ...(goal.history ?? []),
    { at, by, progressPercentage: progress, status, ...(note ? { note } : {}) }
  ].slice(-PDI_MAX_GOAL_HISTORY);
  return next;
}

/** Edits a goal's description and/or moves its progress. Only the fields present in the body are touched. */
export function changeGoal(goal: PDIGoal, body: Body, by: string): PDIGoal {
  let next: PDIGoal = { ...goal };
  if (has(body, 'title')) next.title = requiredText(body.title, 'Título da meta', 200);
  if (has(body, 'competency')) next.competency = cleanText(body.competency, 'Competência', 80) || 'Geral';
  if (has(body, 'deadline')) next.deadline = isoDay(body.deadline, 'Prazo');
  if (has(body, 'description')) {
    const description = cleanText(body.description, 'Descrição', 1000);
    if (description) next.description = description;
    else delete next.description;
  }
  if (has(body, 'progressPercentage') || has(body, 'status') || has(body, 'note')) next = moveProgress(next, body, by);
  return next;
}

export function updateGoal(record: CollaboratorDevelopment, goalId: string, body: Body, by: string): RecordPatch {
  const goal = record.goals.find(g => g.id === goalId);
  if (!goal) throw new NotFoundError('Meta não encontrada neste PDI.');
  const changed = changeGoal(goal, body, by);
  return { goals: record.goals.map(g => (g.id === goalId ? changed : g)) };
}

/** Only a goal nobody worked on can be deleted; anything with progress is cancelled instead, keeping its history. */
export function removeGoal(record: CollaboratorDevelopment, goalId: string): RecordPatch {
  const goal = record.goals.find(g => g.id === goalId);
  if (!goal) throw new NotFoundError('Meta não encontrada neste PDI.');
  if (goal.status !== 'not_started' || (goal.history?.length ?? 0) > 0) {
    throw new ValidationError('Esta meta já teve andamento. Cancele-a em vez de excluir, para manter o histórico.');
  }
  return { goals: record.goals.filter(g => g.id !== goalId) };
}

// ---- 1:1 meetings --------------------------------------------------------------------------
function actionItemsOf(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split('\n') : null;
  if (!raw) throw new ValidationError('Ações combinadas: formato inválido.');
  const items = raw.map(item => cleanText(item, 'Ação combinada', 300)).filter(Boolean);
  if (items.length > PDI_MAX_ACTION_ITEMS) throw new ValidationError(`Informe no máximo ${PDI_MAX_ACTION_ITEMS} ações combinadas por 1:1.`);
  return items;
}

/** A 1:1 is a record of a conversation that already happened; the next one is scheduled through `nextMeetingDate`. */
function meetingDate(value: unknown): string {
  const date = isoDay(value, 'Data do 1:1');
  if (date > todaySP()) throw new ValidationError('A data do 1:1 não pode estar no futuro. Para agendar o próximo, use "Próximo 1:1".');
  return date;
}

function nextMeetingOf(body: Body, date: string): string | undefined {
  if (isBlank(body.nextMeetingDate)) return undefined;
  const next = isoDay(body.nextMeetingDate, 'Data do próximo 1:1');
  if (next <= date) throw new ValidationError('O próximo 1:1 deve ser em uma data posterior a este 1:1.');
  return next;
}

/**
 * `lastReviewDate` always follows the newest 1:1. A scheduled "next 1:1" that has already happened (on or before the
 * newest 1:1) is cleared, so the screen never shows a stale appointment.
 */
function withMeetings(record: CollaboratorDevelopment, meetings: OneOnOneMeeting[], nextMeetingDate?: string): RecordPatch {
  const lastReviewDate = meetings.reduce((max, m) => (m.date > max ? m.date : max), '');
  let nextReviewDate = nextMeetingDate ?? record.nextReviewDate ?? '';
  if (nextReviewDate && nextReviewDate <= lastReviewDate) nextReviewDate = '';
  return { oneOnOnes: meetings, lastReviewDate, nextReviewDate };
}

export function addMeeting(record: CollaboratorDevelopment, body: Body, by: string): { patch: RecordPatch; meeting: OneOnOneMeeting } {
  if (record.oneOnOnes.length >= PDI_MAX_ONE_ON_ONES) {
    throw new ValidationError(`Este PDI já tem o máximo de ${PDI_MAX_ONE_ON_ONES} 1:1s registrados.`);
  }
  const date = meetingDate(body.date);
  const meeting: OneOnOneMeeting = {
    id: newId('1on1'),
    date,
    keyTakeaways: requiredText(body.keyTakeaways, 'Principais pontos', 4000),
    actionItems: actionItemsOf(body.actionItems),
    registeredBy: by
  };
  return { meeting, patch: withMeetings(record, [...record.oneOnOnes, meeting], nextMeetingOf(body, date)) };
}

export function editMeeting(record: CollaboratorDevelopment, meetingId: string, body: Body): RecordPatch {
  const current = record.oneOnOnes.find(m => m.id === meetingId);
  if (!current) throw new NotFoundError('1:1 não encontrado neste PDI.');
  const date = has(body, 'date') ? meetingDate(body.date) : current.date;
  const meeting: OneOnOneMeeting = {
    ...current,
    date,
    keyTakeaways: has(body, 'keyTakeaways') ? requiredText(body.keyTakeaways, 'Principais pontos', 4000) : current.keyTakeaways,
    actionItems: has(body, 'actionItems') ? actionItemsOf(body.actionItems) : current.actionItems
  };
  return withMeetings(record, record.oneOnOnes.map(m => (m.id === meetingId ? meeting : m)), nextMeetingOf(body, date));
}

export function removeMeeting(record: CollaboratorDevelopment, meetingId: string): RecordPatch {
  if (!record.oneOnOnes.some(m => m.id === meetingId)) throw new NotFoundError('1:1 não encontrado neste PDI.');
  return withMeetings(record, record.oneOnOnes.filter(m => m.id !== meetingId));
}
