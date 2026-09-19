import React, { useState } from 'react';
import { KeyRound, Loader2, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { passwordPolicyError } from '../../access.js';

/**
 * Change-password dialog. `forced` (temporary password) cannot be dismissed:
 * the only other way out is signing out.
 */
export const ChangePasswordModal: React.FC<{ forced?: boolean; onClose?: () => void }> = ({ forced, onClose }) => {
  const { changePassword, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const policy = passwordPolicyError(next);
    if (policy) return setError(policy);
    if (next !== confirm) return setError('A confirmação não confere com a nova senha.');
    if (next === current) return setError('A nova senha deve ser diferente da atual.');

    setLoading(true);
    try {
      await changePassword(current, next);
      onClose?.();
    } catch (err: any) {
      setError(err.message || 'Não foi possível alterar a senha.');
    } finally {
      setLoading(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, auto: string) => (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input
        type="password"
        required
        autoComplete={auto}
        value={value}
        onChange={(e) => set(e.target.value)}
        className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-7 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {forced ? 'Defina sua nova senha' : 'Alterar senha'}
              </h2>
              <p className="text-xs text-slate-500">
                {forced
                  ? 'Você entrou com uma senha temporária. Escolha uma senha só sua para continuar.'
                  : 'Ao alterar, os outros dispositivos serão desconectados.'}
              </p>
            </div>
          </div>
          {!forced && onClose && (
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Fechar">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {field(forced ? 'Senha temporária' : 'Senha atual', current, setCurrent, 'current-password')}
        {field('Nova senha (mín. 8 caracteres, letras e números)', next, setNext, 'new-password')}
        {field('Confirmar nova senha', confirm, setConfirm, 'new-password')}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar nova senha
          </button>
          {forced && (
            <button
              type="button"
              onClick={() => void logout()}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium"
            >
              Sair
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
