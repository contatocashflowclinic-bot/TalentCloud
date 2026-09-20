import React from 'react';

/** Card and chip shared by the candidate summary screens (Processo Seletivo and Banco de Talentos). */
export const Card: React.FC<{ icon: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  icon, title, action, children, className = ''
}) => (
  <section className={`rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3 ${className}`}>
    <div className="flex items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 font-bold text-slate-900 text-sm">
        <span className="text-indigo-600">{icon}</span> {title}
      </h4>
      {action}
    </div>
    {children}
  </section>
);

export const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium">{children}</span>
);
