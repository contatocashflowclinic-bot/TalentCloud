import React from 'react';
import { AgendaBoard } from '../agenda/AgendaBoard.js';

export const ModuleAgenda: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Agenda Corporativa</span>
        <h1 className="text-xl font-bold text-slate-900 mt-1">Reuniões e Tarefas da Organização</h1>
        <p className="text-xs text-slate-500">
          Espaço comum a todos os colaboradores: agende compromissos, atribua tarefas e registre o que foi alinhado.
        </p>
      </div>
      <AgendaBoard />
    </div>
  );
};
