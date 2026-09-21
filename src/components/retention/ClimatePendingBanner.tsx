import React, { useEffect, useState } from 'react';
import { ClipboardList, ArrowRight } from 'lucide-react';
import { TenantApi } from '../../services/api.js';
import { CLIMATE_ANSWERED_EVENT } from './SurveyAnswerPanel.js';

interface Props {
  tenantId?: string;
  onOpen: () => void;
}

/** "Você tem uma pesquisa aberta": aviso em destaque para quem ainda não respondeu. Some sozinho depois da resposta. */
export const ClimatePendingBanner: React.FC<Props> = ({ tenantId, onOpen }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      TenantApi.getPendingSurveys()
        .then(list => { if (alive) setCount(list.filter(s => !s.answered).length); })
        .catch(() => { if (alive) setCount(0); });
    };
    load();
    window.addEventListener(CLIMATE_ANSWERED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(CLIMATE_ANSWERED_EVENT, load);
    };
  }, [tenantId]);

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full mb-5 p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-left flex items-center justify-between gap-3 transition-colors"
    >
      <span className="flex items-center gap-3 min-w-0">
        <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0"><ClipboardList className="w-4 h-4" /></span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-indigo-900">
            {count === 1 ? 'Você tem uma pesquisa de clima aberta' : `Você tem ${count} pesquisas de clima abertas`}
          </span>
          <span className="block text-xs text-indigo-700">Leva poucos minutos e a sua resposta é anônima.</span>
        </span>
      </span>
      <span className="text-xs font-semibold text-indigo-700 flex items-center gap-1 shrink-0">Responder <ArrowRight className="w-3.5 h-3.5" /></span>
    </button>
  );
};
