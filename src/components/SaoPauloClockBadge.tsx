import React, { useState, useEffect } from 'react';
import { Clock, MapPin } from 'lucide-react';
import { formatTimeSP, formatDateSP, SAO_PAULO_TIMEZONE } from '../utils/dateUtils.js';

export const SaoPauloClockBadge: React.FC = () => {
  const [time, setTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = formatTimeSP(time, true);
  const dateString = formatDateSP(time);

  return (
    <div
      className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs transition-colors cursor-default"
      title={`Horário Oficial de Brasília / São Paulo - SP (${SAO_PAULO_TIMEZONE})\nData: ${dateString}\nHora: ${timeString}`}
    >
      <div className="flex items-center gap-1.5 text-slate-500">
        <Clock className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
        <span className="font-semibold text-slate-700 font-mono tracking-tight">{timeString}</span>
      </div>
      <div className="h-3 w-px bg-slate-300"></div>
      <div className="flex items-center gap-1 text-[11px] text-indigo-700 font-medium bg-indigo-50 px-1.5 py-0.5 rounded-md">
        <MapPin className="w-3 h-3 text-indigo-600" />
        <span>São Paulo (SP)</span>
      </div>
    </div>
  );
};
