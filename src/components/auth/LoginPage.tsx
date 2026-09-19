import React, { useState } from 'react';
import { Building2, Lock, Mail, Globe, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenant, setTenant] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('org') || '';
    } catch {
      return '';
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password, tenant.trim().toLowerCase() || undefined);
    } catch (err: any) {
      setError(err.message || 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-indigo-900/40">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white tracking-tight">TalentCloud</div>
            <div className="text-xs text-indigo-300">SaaS de Ciclo de Gestão de Talentos</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-2xl p-7 space-y-4">
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

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              Organização <span className="font-normal text-slate-400">(opcional; use se tiver acesso a mais de uma)</span>
            </span>
            <div className="relative mt-1">
              <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                autoCapitalize="none"
                spellCheck={false}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                placeholder="ex.: techcorp"
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
        </form>

        <p className="text-center text-[11px] text-indigo-300/80 mt-5">
          Procurando vagas? Use o link do portal de carreiras da empresa.
        </p>
      </div>
    </div>
  );
};
