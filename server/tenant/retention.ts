import {
  ALERT_MAX_ACTIONS,
  ALERT_MAX_HISTORY,
  ALERT_MAX_SIGNALS,
  ALERT_STATUSES,
  type AlertHistoryEntry,
  type AlertStatus,
  type RiskLevel,
  type TurnoverRiskAlert
} from '../../src/types.js';
import { ALERT_STATUS_LABEL, RISK_LEVELS, isActiveAlert } from '../../src/retention.js';
import { ValidationError } from '../errors.js';
import { newId } from '../ids.js';
import { cleanText, requiredText } from './development.js';

/**
 * Business rules of the turnover alerts (Retention module). Everything here is pure: the repository loads the alert
 * with its row locked, calls one of the builders below and writes the returned patch back. A patch value of `null`
 * clears the column.
 */
type Body = Record<string, unknown>;
export type AlertPatch = Record<string, unknown>;

const has = (body: Body, key: string) => body[key] !== undefined;
const isBlank = (value: unknown) => value === undefined || value === null || value === '';

export interface AlertRefs {
  departments: readonly { id: string; name: string }[];
  members: readonly { id: string; name: string }[];
}

const entry = (at: string, by: string, kind: AlertHistoryEntry['kind'], text: string): AlertHistoryEntry => ({ at, by, kind, text });
const capHistory = (history: AlertHistoryEntry[]) => history.slice(-ALERT_MAX_HISTORY);

/** A list from an array or a text (one item per line; without line breaks, separated by comma). */
function listOf(value: unknown, label: string, max: number, itemMax: number): string[] {
  if (value === undefined || value === null) return [];
  let raw: unknown[];
  if (Array.isArray(value)) raw = value;
  else if (typeof value === 'string') raw = value.includes('\n') ? value.split('\n') : value.split(',');
  else throw new ValidationError(`${label}: formato inválido.`);
  const items = raw.map(item => cleanText(item, label, itemMax)).filter(Boolean);
  if (items.length > max) throw new ValidationError(`${label}: informe no máximo ${max} itens.`);
  return items;
}

const sameList = (a: readonly string[] | undefined, b: readonly string[]) => JSON.stringify(a ?? []) === JSON.stringify(b);

/** Alert fields from a request body; `partial` (PATCH) reads only what was sent. */
export function parseAlertFields(body: Body, partial: boolean, refs: AlertRefs): AlertPatch {
  const out: AlertPatch = {};
  if (!partial || has(body, 'collaboratorName')) out.collaboratorName = requiredText(body.collaboratorName, 'Nome do colaborador', 120);

  if (!partial || has(body, 'riskLevel')) {
    const level = isBlank(body.riskLevel) ? 'Médio' : body.riskLevel;
    if (!RISK_LEVELS.includes(level as RiskLevel)) throw new ValidationError('Nível de risco inválido. Use Baixo, Médio ou Alto.');
    out.riskLevel = level;
  }

  if (has(body, 'departmentId') && !isBlank(body.departmentId)) {
    const department = refs.departments.find(d => d.id === body.departmentId);
    if (!department) throw new ValidationError('Departamento não encontrado nesta organização.');
    out.departmentId = department.id;
    out.department = department.name;
  } else if (has(body, 'departmentId')) {
    out.departmentId = null;
    out.department = cleanText(body.department, 'Departamento', 80) || 'Geral';
  } else if (has(body, 'department')) {
    out.department = cleanText(body.department, 'Departamento', 80) || 'Geral';
  } else if (!partial) {
    out.department = 'Geral';
  }

  if (has(body, 'ownerId')) {
    if (isBlank(body.ownerId)) out.ownerId = null;
    else if (typeof body.ownerId !== 'string' || !refs.members.some(m => m.id === body.ownerId)) {
      throw new ValidationError('Responsável não encontrado nesta organização.');
    }
    else out.ownerId = body.ownerId;
  }

  if (!partial || has(body, 'earlyWarningSignals')) out.earlyWarningSignals = listOf(body.earlyWarningSignals, 'Sinais de alerta', ALERT_MAX_SIGNALS, 300);
  if (!partial || has(body, 'suggestedActions')) out.suggestedActions = listOf(body.suggestedActions, 'Ações sugeridas', ALERT_MAX_ACTIONS, 300);
  return out;
}

/** A brand-new alert: open, with the "created" entry as the first line of its history. */
export function buildAlert(collaboratorId: string, fields: AlertPatch, by: string): AlertPatch {
  const at = new Date().toISOString();
  const risk = (fields.riskLevel as string | undefined) ?? 'Médio';
  return {
    id: newId('alt'),
    collaboratorId,
    riskLevel: 'Médio',
    department: 'Geral',
    earlyWarningSignals: [],
    suggestedActions: [],
    ...fields,
    status: 'open',
    history: [entry(at, by, 'created', `Alerta aberto com risco ${risk}.`)],
    createdAt: at,
    createdBy: by,
    updatedAt: at
  };
}

function assertActive(alert: TurnoverRiskAlert, what: string): void {
  if (!isActiveAlert(alert.status)) throw new ValidationError(`Este alerta está encerrado (${ALERT_STATUS_LABEL[alert.status]}). Reabra-o para ${what}.`);
}

/** Edits an active alert. Level and owner changes are logged in its history. Nothing changed = nothing written. */
export function editAlert(alert: TurnoverRiskAlert, body: Body, refs: AlertRefs, by: string): AlertPatch {
  assertActive(alert, 'editá-lo');
  const fields = parseAlertFields(body, true, refs);
  const at = new Date().toISOString();
  const history = [...alert.history];

  if (fields.riskLevel !== undefined && fields.riskLevel !== alert.riskLevel) {
    history.push(entry(at, by, 'risk', `Nível de risco alterado de ${alert.riskLevel} para ${fields.riskLevel}.`));
  }
  if (fields.ownerId !== undefined && (fields.ownerId ?? null) !== (alert.ownerId ?? null)) {
    const owner = refs.members.find(m => m.id === fields.ownerId);
    history.push(entry(at, by, 'owner', owner ? `Responsável definido: ${owner.name}.` : 'Responsável removido.'));
  }
  const listChanged =
    (fields.earlyWarningSignals !== undefined && !sameList(alert.earlyWarningSignals, fields.earlyWarningSignals as string[])) ||
    (fields.suggestedActions !== undefined && !sameList(alert.suggestedActions, fields.suggestedActions as string[]));
  if (listChanged) history.push(entry(at, by, 'edit', 'Sinais de alerta ou ações sugeridas atualizados.'));

  const dataChanged = Object.entries(fields).some(([key, value]) => JSON.stringify(value ?? null) !== JSON.stringify((alert as unknown as Record<string, unknown>)[key] ?? null));
  if (!dataChanged) return {};
  return { ...fields, history: capHistory(history), updatedAt: at };
}

/** Registers an action taken. The first action on an "open" alert moves it to "in monitoring". */
export function registerAction(alert: TurnoverRiskAlert, body: Body, by: string): AlertPatch {
  assertActive(alert, 'registrar ações');
  const action = requiredText(body.action, 'Ação realizada', 500);
  const at = new Date().toISOString();
  const history = [...alert.history, entry(at, by, 'action', action)];
  const patch: AlertPatch = { lastActionTaken: action, updatedAt: at };
  if (alert.status === 'open') {
    patch.status = 'monitoring';
    history.push(entry(at, by, 'status', `Situação: ${ALERT_STATUS_LABEL.open} → ${ALERT_STATUS_LABEL.monitoring}.`));
  }
  return { ...patch, history: capHistory(history) };
}

const REASON_REQUIRED: Partial<Record<AlertStatus, string>> = {
  dismissed: 'Informe por que o alerta está sendo descartado.',
  left: 'Informe o motivo da saída do colaborador.'
};

/**
 * Status changes. An active alert (open / in monitoring) can go to any other status; a closed one (resolved, dismissed,
 * colaborador saiu) can only be reopened. Closing keeps the note; reopening clears the closing data.
 */
export function changeAlertStatus(alert: TurnoverRiskAlert, body: Body, by: string): AlertPatch {
  const next = body.status as AlertStatus;
  if (!ALERT_STATUSES.includes(next)) throw new ValidationError('Situação do alerta inválida.');
  if (next === alert.status) throw new ValidationError(`O alerta já está em "${ALERT_STATUS_LABEL[next]}".`);
  if (!isActiveAlert(alert.status) && next !== 'open') throw new ValidationError('Um alerta encerrado só pode ser reaberto.');

  const note = cleanText(body.note, 'Observação', 500);
  if (REASON_REQUIRED[next] && !note) throw new ValidationError(REASON_REQUIRED[next]!);

  const at = new Date().toISOString();
  const text = `Situação: ${ALERT_STATUS_LABEL[alert.status]} → ${ALERT_STATUS_LABEL[next]}.${note ? ` ${note}` : ''}`;
  const closing = !isActiveAlert(next);
  return {
    status: next,
    resolvedAt: closing ? at : null,
    resolutionNote: closing && note ? note : null,
    history: capHistory([...alert.history, entry(at, by, 'status', text)]),
    updatedAt: at
  };
}

/** Only an alert nobody worked on can be deleted; anything with history is closed instead, keeping the trail. */
export function assertAlertRemovable(alert: TurnoverRiskAlert): void {
  if (alert.status !== 'open' || alert.history.some(h => h.kind !== 'created')) {
    throw new ValidationError('Este alerta já teve andamento. Encerre-o (Resolvido ou Descartado) em vez de excluir, para manter o histórico.');
  }
}

export const normName = (name: string) => name.trim().toLowerCase();
