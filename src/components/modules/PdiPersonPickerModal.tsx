import React, { useMemo, useState } from 'react';
import { X, Search, UserPlus } from 'lucide-react';
import { DevelopmentPerson } from '../../types.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';

interface Props {
  /** null while loading. */
  people: DevelopmentPerson[] | null;
  /** A person from the list, or null to register someone who is not in it. */
  onPick: (person: DevelopmentPerson | null) => void;
  onClose: () => void;
}

const ORIGIN_LABEL: Record<DevelopmentPerson['origin'], string> = {
  hire: 'Contratação',
  member: 'Usuário da organização'
};

/** First step of "Novo PDI": pick who the plan is for; the next form comes pre-filled with what the system already knows. */
export const PdiPersonPickerModal: React.FC<Props> = ({ people, onPick, onClose }) => {
  const [query, setQuery] = useState('');
  const backdrop = useBackdropClose(onClose);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people ?? []).filter(p => !q || `${p.name} ${p.jobTitle}`.toLowerCase().includes(q));
  }, [people, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Novo PDI</span>
            <h3 className="text-base font-bold text-slate-900">Para quem é o plano de desenvolvimento?</h3>
            <p className="text-xs text-slate-500">Escolha alguém da lista ou cadastre quem ainda não está no sistema.</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-xs overflow-y-auto min-h-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou cargo"
              aria-label="Buscar pessoa"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          {people === null ? (
            <p className="text-slate-400 py-4 text-center">Carregando…</p>
          ) : shown.length === 0 ? (
            <p className="text-slate-500 py-4 text-center">
              {people.length === 0 ? 'Todas as pessoas conhecidas já têm PDI.' : 'Ninguém encontrado com essa busca.'}
            </p>
          ) : (
            <div className="space-y-1.5">
              {shown.map(p => (
                <button
                  key={`${p.origin}-${p.id}`}
                  type="button"
                  onClick={() => onPick(p)}
                  className="w-full p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-left flex items-center justify-between gap-3 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900 truncate">{p.name}</span>
                    <span className="block text-slate-500 truncate">{p.jobTitle || 'Cargo não informado'}</span>
                  </span>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${p.origin === 'hire' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                    {ORIGIN_LABEL[p.origin]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onPick(null)}
            className="px-3 py-2 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold text-xs flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" /> Cadastrar quem não está na lista
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs">Cancelar</button>
        </div>
      </div>
    </div>
  );
};
