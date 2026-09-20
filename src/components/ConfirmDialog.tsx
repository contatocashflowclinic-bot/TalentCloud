import React from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { useBackdropClose } from '../hooks/useBackdropClose.js';

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  /** Omit (or pass null) for a single-button "alert" style, e.g. reporting an error. */
  cancelLabel?: string | null;
  tone?: 'danger' | 'default';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** System-styled replacement for window.confirm()/alert() — same modal shell as the rest of the app. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel
}) => {
  const backdrop = useBackdropClose(onCancel);
  const danger = tone === 'danger';
  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div className="bg-white rounded-2xl w-full max-w-sm border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 flex items-start gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${danger ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
            <Icon className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0 pt-0.5">
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <div className="text-xs text-slate-500 mt-1 leading-relaxed">{message}</div>
          </div>
        </div>
        <div className="px-5 pb-5 pt-1 flex items-center justify-end gap-2">
          {cancelLabel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs disabled:opacity-60"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 rounded-xl text-white font-semibold text-xs disabled:opacity-60 transition-colors ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {busy ? 'Aguarde…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
