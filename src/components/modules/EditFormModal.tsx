import React, { useState } from 'react';
import { X, Lock } from 'lucide-react';
import { centsToBRLText, digitsToCents, parseBRLText } from '../../utils/currencyUtils.js';
import { DateInputBR } from '../DateInputBR.js';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'email' | 'url' | 'number' | 'currency' | 'textarea' | 'select' | 'date' | 'list' | 'lines';
  options?: { value: string; label: string }[];
  required?: boolean;
  /** An emptied number/select becomes null (clears the value) instead of being left out. */
  nullable?: boolean;
  help?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  /** Takes half of the row on wide screens. */
  half?: boolean;
  /** Shown but protected: never sent, never editable. */
  readOnly?: boolean;
}

interface Props {
  title: string;
  subtitle?: string;
  fields: FieldDef[];
  /** Current values, in the same shape the API returns (arrays for list/lines). */
  initial: Record<string, unknown>;
  onSave: (changes: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  /** Highlighted message above the fields. */
  notice?: React.ReactNode;
  /** Extra button on the left of the footer (e.g. "Registrar correção"). */
  secondaryAction?: { label: string; onClick: () => void };
  /** Overrides the save button label. */
  saveLabel?: string;
}

const toText = (field: FieldDef, value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (field.type === 'currency') {
    const cents = Math.round(Number(value) * 100);
    return cents ? centsToBRLText(cents) : '';
  }
  if (field.type === 'list') return Array.isArray(value) ? value.join(', ') : String(value);
  if (field.type === 'lines') return Array.isArray(value) ? value.join('\n') : String(value);
  if (field.type === 'date') return String(value).slice(0, 10);
  return String(value);
};

const fromText = (field: FieldDef, text: string): unknown => {
  if (field.type === 'number') return text.trim() === '' ? (field.nullable ? null : undefined) : Number(text);
  if (field.type === 'currency') return text.trim() === '' ? (field.nullable ? null : undefined) : parseBRLText(text);
  if (field.type === 'list') return text.split(',').map(s => s.trim()).filter(Boolean);
  if (field.type === 'lines') return text.split('\n').map(s => s.trim()).filter(Boolean);
  if (field.type === 'select') return text === '' ? (field.nullable ? null : undefined) : text;
  return text.trim();
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500';

/** Generic edit form: sends ONLY the fields the user changed. */
export const EditFormModal: React.FC<Props> = ({ title, subtitle, fields, initial, onSave, onClose, notice, secondaryAction, saveLabel }) => {
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map(f => [f.key, toText(f, initial[f.key])]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const changes: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.readOnly) continue;
      const next = fromText(f, values[f.key]);
      if (next === undefined) continue;
      const before = f.type === 'text' || f.type === 'email' || f.type === 'url' || f.type === 'textarea' || f.type === 'date'
        ? toText(f, initial[f.key]).trim()
        : initial[f.key];
      if (!same(next, before)) changes[f.key] = next;
    }
    if (Object.keys(changes).length === 0) return onClose();
    try {
      setBusy(true);
      setError('');
      await onSave(changes);
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar as alterações.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Editar</span>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col min-h-0">
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5 text-xs overflow-y-auto">
            {notice && <div className="sm:col-span-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 leading-relaxed">{notice}</div>}
            {fields.map(f => (
              <div key={f.key} className={f.half ? '' : 'sm:col-span-2'}>
                <label className="block font-semibold text-slate-700 mb-1" htmlFor={`f-${f.key}`}>
                  {f.label}{f.required && !f.readOnly && <span className="text-rose-500"> *</span>}
                  {f.readOnly && <Lock className="inline w-3 h-3 ml-1 text-slate-400" aria-label="Protegido" />}
                </label>
                {f.type === 'textarea' || f.type === 'lines' ? (
                  <textarea
                    id={`f-${f.key}`}
                    rows={f.type === 'lines' ? 4 : 3}
                    required={f.required && !f.readOnly}
                    disabled={f.readOnly}
                    value={values[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    className={`${inputCls} ${f.readOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                  />
                ) : f.type === 'select' ? (
                  <select
                    id={`f-${f.key}`}
                    required={f.required}
                    value={values[f.key]}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    className={inputCls}
                  >
                    {!f.required && <option value="">— nenhum —</option>}
                    {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === 'currency' ? (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium select-none pointer-events-none">R$</span>
                    <input
                      id={`f-${f.key}`}
                      type="text"
                      inputMode="numeric"
                      required={f.required && !f.readOnly}
                      disabled={f.readOnly}
                      value={values[f.key]}
                      placeholder={f.placeholder ?? '0,00'}
                      onChange={(e) => {
                        const cents = digitsToCents(e.target.value);
                        setValues({ ...values, [f.key]: cents ? centsToBRLText(cents) : '' });
                      }}
                      className={`${inputCls} pl-9 ${f.readOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                    />
                  </div>
                ) : f.type === 'date' ? (
                  <DateInputBR
                    id={`f-${f.key}`}
                    required={f.required && !f.readOnly}
                    value={values[f.key]}
                    onChange={(v) => setValues({ ...values, [f.key]: v })}
                    className={`${inputCls} pl-9 ${f.readOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                  />
                ) : (
                  <input
                    id={`f-${f.key}`}
                    type={f.type === 'list' ? 'text' : f.type}
                    required={f.required && !f.readOnly}
                    disabled={f.readOnly}
                    min={f.min}
                    max={f.max}
                    value={values[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    className={`${inputCls} ${f.readOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                  />
                )}
                {(f.help || ((f.type === 'list' || f.type === 'lines') && !f.readOnly)) && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    {f.help ?? (f.type === 'list' ? 'Separe os itens por vírgula.' : 'Um item por linha.')}
                  </p>
                )}
              </div>
            ))}
          </div>

          {error && <div className="mx-5 mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}

          <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
            {secondaryAction && (
              <button type="button" onClick={secondaryAction.onClick} className="px-3 py-2 rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-50 font-semibold text-xs mr-auto">
                {secondaryAction.label}
              </button>
            )}
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs">Cancelar</button>
            <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs disabled:opacity-60">
              {busy ? 'Salvando…' : (saveLabel ?? 'Salvar alterações')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
