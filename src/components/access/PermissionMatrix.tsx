import React from 'react';
import { ACTION_LABELS, PermissionAction, ROUTINES, permissionKey } from '../../access.js';

const COLUMNS: PermissionAction[] = ['view', 'create', 'edit', 'delete'];

/**
 * Routine × action grid. Checking create/edit/delete also checks "Visualizar"; clearing "Visualizar"
 * clears the rest of the row (the server applies the same rule).
 * `limit` (permissions the current user holds) disables what they cannot hand out.
 */
export const PermissionMatrix: React.FC<{
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  limit?: readonly string[];
  /** Permissions coming from the profile, marked to make individual exceptions visible. */
  baseline?: readonly string[];
}> = ({ value, onChange, disabled, limit, baseline }) => {
  const selected = new Set(value);

  const toggle = (routine: string, action: PermissionAction, actions: PermissionAction[]) => {
    const next = new Set(selected);
    const key = permissionKey(routine, action);
    if (next.has(key)) {
      next.delete(key);
      if (action === 'view') actions.forEach(a => next.delete(permissionKey(routine, a)));
    } else {
      next.add(key);
      next.add(permissionKey(routine, 'view'));
    }
    onChange([...next]);
  };

  const toggleRoutine = (routine: string, actions: PermissionAction[]) => {
    const keys = actions.map(a => permissionKey(routine, a)).filter(k => !limit || limit.includes(k));
    const all = keys.every(k => selected.has(k));
    const next = new Set(selected);
    keys.forEach(k => (all ? next.delete(k) : next.add(k)));
    onChange([...next]);
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Rotina</th>
            {COLUMNS.map(c => (
              <th key={c} className="px-2 py-2 text-center font-semibold">{ACTION_LABELS[c]}</th>
            ))}
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ROUTINES.map(r => (
            <tr key={r.key} className="hover:bg-slate-50/60">
              <td className="px-3 py-2">
                <div className="font-semibold text-slate-800">{r.label}</div>
                <div className="text-[11px] text-slate-400 leading-tight">{r.description}</div>
              </td>
              {COLUMNS.map(a => {
                if (!r.actions.includes(a)) return <td key={a} className="px-2 py-2 text-center text-slate-200">—</td>;
                const key = permissionKey(r.key, a);
                const blocked = disabled || (!!limit && !limit.includes(key));
                const differs = baseline ? baseline.includes(key) !== selected.has(key) : false;
                return (
                  <td key={a} className={`px-2 py-2 text-center ${differs ? 'bg-amber-50' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      disabled={blocked}
                      onChange={() => toggle(r.key, a, r.actions)}
                      aria-label={`${r.label}: ${ACTION_LABELS[a]}`}
                      title={differs ? 'Diferente do perfil (exceção individual)' : undefined}
                      className="w-4 h-4 accent-indigo-600 disabled:opacity-40"
                    />
                  </td>
                );
              })}
              <td className="px-2 py-2 text-right">
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => toggleRoutine(r.key, r.actions)}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Tudo
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
