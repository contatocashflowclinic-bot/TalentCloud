import type React from 'react';
import {
  Home,
  CalendarClock,
  Users,
  Dna,
  Network,
  Briefcase,
  Layers,
  UserCheck,
  GitBranch,
  Sparkles,
  Calendar,
  FileCheck,
  Rocket,
  TrendingUp,
  HeartHandshake,
  UserCog,
  BarChart3,
  Globe
} from 'lucide-react';

export interface ModuleMeta {
  id: number;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  badge?: string;
}

export interface ModuleSection {
  title: string;
  modules: ModuleMeta[];
}

/** Single source of truth for the sidebar and for shortcuts elsewhere (e.g. the Welcome screen). */
export const MODULE_SECTIONS: ModuleSection[] = [
  {
    title: 'Início',
    modules: [
      { id: 1, name: 'Boas-vindas', icon: Home, desc: 'Sua página inicial' },
      { id: 17, name: 'Agenda Corporativa', icon: CalendarClock, desc: 'Reuniões e tarefas de toda a organização' }
    ]
  },
  {
    title: 'Governança & Fundamentos',
    modules: [
      { id: 2, name: 'Usuários e Permissões', icon: Users, desc: 'Perfis e Acessos' },
      { id: 3, name: 'DNA Organizacional', icon: Dna, desc: 'Cultura e Pilares' },
      { id: 4, name: 'Estrutura Organizacional', icon: Network, desc: 'Departamentos e Squads' },
      { id: 5, name: 'Cargos', icon: Briefcase, desc: 'Competências e Faixas' }
    ]
  },
  {
    title: 'Atração & Seleção',
    modules: [
      { id: 6, name: 'Vagas', icon: Layers, desc: 'Abertura e Pipeline' },
      { id: 16, name: 'Divulgação & Portal', icon: Globe, badge: 'Social', desc: 'Instagram, WhatsApp, LinkedIn' },
      { id: 7, name: 'Candidatos', icon: UserCheck, desc: 'Banco de Talentos Isolado' },
      { id: 8, name: 'Processo Seletivo', icon: GitBranch, desc: 'Kanban e Etapas' },
      { id: 9, name: 'Avaliação Assistida por IA', icon: Sparkles, desc: 'Apoio à Decisão & Explicabilidade' },
      { id: 10, name: 'Entrevistas', icon: Calendar, desc: 'Scorecards e Roteiro' }
    ]
  },
  {
    title: 'Ciclo do Colaborador',
    modules: [
      { id: 11, name: 'Proposta', icon: FileCheck, desc: 'Oferta e Aprovação' },
      { id: 12, name: 'Onboarding', icon: Rocket, desc: 'Checklist 30-60-90 dias' },
      { id: 18, name: 'RH / Colaboradores', icon: UserCog, desc: 'Base mestre e historico' },
      { id: 13, name: 'Desenvolvimento', icon: TrendingUp, desc: 'PDI e Reuniões 1:1' },
      { id: 14, name: 'Retenção', icon: HeartHandshake, desc: 'eNPS & Risco de Turnover' },
      { id: 15, name: 'Indicadores', icon: BarChart3, desc: 'People Analytics' }
    ]
  }
];

export const ALL_MODULES: ModuleMeta[] = MODULE_SECTIONS.flatMap(s => s.modules);
