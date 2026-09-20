import type { IntegrationTemplate, OnboardingChecklistItem } from '../../src/types.js';
import { newId } from '../ids.js';

type Def = Omit<IntegrationTemplate, 'id' | 'active'>;

/**
 * Starter catalog created once per organization; RH edits it afterwards.
 * Documents and account/equipment provisioning before day 1 live in the Admission folder, not here.
 */
export const DEFAULT_INTEGRATION_TEMPLATES: Def[] = [
  { name: 'Boas-vindas e apresentação ao time', category: 'Cultura & Boas-Vindas', responsible: 'Gestor', dueDay: 1 },
  { name: 'Configuração das ferramentas do dia a dia', category: 'TI & Acessos', responsible: 'TI', dueDay: 2 },
  { name: 'Imersão no DNA Organizacional e reunião com o Buddy', category: 'Cultura & Boas-Vindas', responsible: 'Buddy', dueDay: 3 },
  { name: 'Treinamentos obrigatórios (segurança da informação e compliance)', category: 'Treinamento Técnico', responsible: 'RH', dueDay: 7 },
  { name: 'Primeira entrega prática acompanhada pelo gestor', category: 'Treinamento Técnico', responsible: 'Gestor', dueDay: 14 },
  { name: 'Check-in de 30 dias com o Hiring Manager', category: 'Cultura & Boas-Vindas', responsible: 'Gestor', dueDay: 30 },
  { name: 'Check-in de 60 dias com o Hiring Manager', category: 'Cultura & Boas-Vindas', responsible: 'Gestor', dueDay: 60 },
  { name: 'Avaliação de experiência de 90 dias', category: 'Cultura & Boas-Vindas', responsible: 'Gestor', dueDay: 90 }
];

export const buildChecklistItems = (templates: IntegrationTemplate[]): OnboardingChecklistItem[] =>
  [...templates]
    .sort((a, b) => a.dueDay - b.dueDay)
    .map(t => ({
      id: newId('chk'),
      templateId: t.id,
      title: t.name,
      category: t.category,
      dueDateDay: t.dueDay,
      status: 'pending' as const,
      assignedToRole: t.responsible
    }));
