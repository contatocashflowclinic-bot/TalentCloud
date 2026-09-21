import React, { useEffect, useMemo, useState } from 'react';
import { X, Link2 } from 'lucide-react';
import type { MembersApi, PositionRef, UnlinkedMember } from '../../services/api.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';

interface Props {
  api: MembersApi;
  onLinked: (count: number) => void;
  onClose: () => void;
}

/**
 * Links many people to REGISTERED Cargos at once. Each row is a list of the cargos of the Cargos module (never typed);
 * when the old title of a person matches exactly one cargo, that cargo comes pre-selected.
 */
export const LinkPositionsModal: React.FC<Props> = ({ api, onLinked, onClose }) => {
  const [members, setMembers] = useState<UnlinkedMember[] | null>(null);
  const [positions, setPositions] = useState<PositionRef[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const backdrop = useBackdropClose(onClose);

  useEffect(() => {
    api.listUnlinked?.()
      .then(data => {
        setMembers(data.members);
        setPositions(data.positions);
        setChoice(Object.fromEntries(data.members.filter(m => m.suggestedPositionId).map(m => [m.id, m.suggestedPositionId!])));
      })
      .catch(err => { setMembers([]); setError(err.message || 'Não foi possível carregar as pessoas.'); });
  }, [api]);

  const chosen = useMemo(() => Object.entries(choice).filter(([, positionId]) => positionId), [choice]);

  const save = async () => {
    try {
      setBusy(true);
      setError('');
      const count = await api.linkPositions!(chosen.map(([memberId, positionId]) => ({ memberId, positionId })));
      onLinked(count);
    } catch (err: any) {
      setError(err.message || 'Não foi possível vincular os cargos.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Cargos</span>
            <h3 className="text-base font-bold text-slate-900">Vincular cargos em lote</h3>
            <p className="text-xs text-slate-500">
              Escolha, para cada pessoa, um cargo do <strong>cadastro de Cargos</strong>. O cargo nunca é digitado. Quem ficar sem escolha continua sem cargo cadastrado.
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 overflow-y-auto min-h-0 text-xs space-y-3">
          {members === null ? (
            <p className="text-slate-400 py-6 text-center">Carregando…</p>
          ) : members.length === 0 ? (
            <p className="text-slate-500 py-6 text-center">{error || 'Todas as pessoas ativas já têm cargo cadastrado.'}</p>
          ) : positions.length === 0 ? (
            <p className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">Não há cargos ativos cadastrados. Cadastre os cargos no módulo <strong>Cargos</strong> e volte aqui.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
                  <tr><th className="px-3 py-2">Pessoa</th><th className="px-3 py-2">Cargo atual (rótulo antigo)</th><th className="px-3 py-2 w-64">Cargo cadastrado</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map(m => (
                    <tr key={m.id}>
                      <td className="px-3 py-2"><span className="block font-semibold text-slate-800">{m.name}</span><span className="block text-slate-400">{m.email}</span></td>
                      <td className="px-3 py-2 text-slate-600">{m.jobTitle}{m.suggestedPositionId && <span className="block text-emerald-700 text-[10px]">título igual a um cargo cadastrado</span>}</td>
                      <td className="px-3 py-2">
                        <select
                          value={choice[m.id] ?? ''}
                          aria-label={`Cargo de ${m.name}`}
                          onChange={(e) => setChoice(current => ({ ...current, [m.id]: e.target.value }))}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white focus:outline-hidden focus:border-indigo-500"
                        >
                          <option value="">— manter sem cargo —</option>
                          {positions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {error && members !== null && members.length > 0 && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">{error}</div>}
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs">Cancelar</button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || chosen.length === 0}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs disabled:opacity-50 flex items-center gap-1.5"
          >
            <Link2 className="w-3.5 h-3.5" /> {busy ? 'Vinculando…' : `Vincular ${chosen.length} ${chosen.length === 1 ? 'pessoa' : 'pessoas'}`}
          </button>
        </div>
      </div>
    </div>
  );
};
