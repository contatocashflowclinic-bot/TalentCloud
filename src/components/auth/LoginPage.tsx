import React, { useState } from 'react';
import { Lock, Mail, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { BrandLogo } from '../BrandLogo.js';
import { useAuth } from '../../context/AuthContext.js';

/** Deep links from an organization's own portal can pin the login to that org (?org=slug). */
function orgSlugFromUrl(): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get('org')?.trim().toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password, orgSlugFromUrl());
    } catch (err: any) {
      setError(err.message || 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-2xl p-7 space-y-4">
          <div className="flex justify-center pb-1">
            <BrandLogo width={300} className="max-w-full h-auto" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Entrar</h1>
            <p className="text-xs text-slate-500 mt-0.5">Acesse com o e-mail e a senha da sua conta.</p>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">E-mail</span>
            <div className="relative mt-1">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                placeholder="voce@empresa.com"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Senha</span>
            <div className="relative mt-1">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                placeholder="••••••••"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <a
            href='/'
            className='flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'
          >
            <ArrowLeft className='h-4 w-4' />
            Ir para o site
          </a>
        </form>

        <p className="text-center text-[11px] text-indigo-300/80 mt-5">
          Procurando vagas? Use o link do portal de carreiras da empresa.
        </p>
      </div>
    </div>
  );
};
