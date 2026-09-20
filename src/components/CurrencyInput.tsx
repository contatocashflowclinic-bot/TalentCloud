import React from 'react';
import { centsToBRLText, centsToReais, digitsToCents, reaisToCents } from '../utils/currencyUtils.js';

export interface CurrencyInputProps {
  /** Amount in reais (e.g. 1234.5), not cents. */
  value: number;
  onChange: (value: number) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

/** Money input with the standard Brazilian mask: typed digits fill in as cents from the right (e.g. "150000" -> R$ 1.500,00). */
export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  id,
  placeholder,
  disabled,
  required,
  className
}) => {
  const cents = reaisToCents(value);

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium select-none pointer-events-none">
        R$
      </span>
      <input
        type="text"
        inputMode="numeric"
        id={id}
        disabled={disabled}
        required={required}
        value={cents ? centsToBRLText(cents) : ''}
        placeholder={placeholder ?? '0,00'}
        onChange={(e) => onChange(centsToReais(digitsToCents(e.target.value)))}
        className={className ?? 'w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500'}
      />
    </div>
  );
};
