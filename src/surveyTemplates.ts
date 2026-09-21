/**
 * Templates de pesquisa de clima: a biblioteca do sistema e as regras de cargo compartilhadas pelo servidor (que valida e
 * decide quem vê cada bloco) e pela tela (que sugere os cargos ao usar um template). Nada aqui toca banco, rede ou DOM.
 *
 * Toda pergunta de escala usa a régua de 0 a 10 (0 = discordo totalmente, 10 = concordo totalmente), então as afirmações
 * são escritas de forma positiva: quanto maior a nota, melhor.
 */
import {
  type CareerTrack, type PositionLevel, type SurveyBlock, type SurveyQuestion, type SurveyTemplate, type TargetHints
} from './types.js';

// ---- Cargo -----------------------------------------------------------------------------------
// O cargo de uma pessoa é sempre um Cargo cadastrado (módulo Cargos). Os templates nunca usam texto livre para
// escolher cargos: sugerem pelos atributos do próprio cadastro (nível e trilha de carreira).

/** Minúsculas, sem acento e com espaços simples (para comparar textos como opções de uma pergunta). */
export const normalizeText = (text: string | undefined | null): string =>
  (text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const CAREER_TRACK_LABEL: Record<CareerTrack, string> = {
  Y_TECNICO: 'Técnica',
  'GESTÃO': 'Gestão',
  OPERACIONAL: 'Operacional'
};

export const noHints = (): TargetHints => ({ levels: [], careerTracks: [] });
export const hasHints = (hints: TargetHints): boolean => hints.levels.length > 0 || hints.careerTracks.length > 0;

/** "Nível: Gerência, Diretoria · Trilha: Técnica" — como um template diz a quem o bloco se dirige. */
export function describeHints(hints: TargetHints): string {
  const parts = [
    hints.levels.length > 0 ? `Nível: ${hints.levels.join(', ')}` : '',
    hints.careerTracks.length > 0 ? `Trilha: ${hints.careerTracks.map(t => CAREER_TRACK_LABEL[t]).join(', ')}` : ''
  ].filter(Boolean);
  return parts.join(' · ');
}

/**
 * Dos Cargos cadastrados, os que combinam com a sugestão do template: o nível está entre os níveis indicados E a trilha
 * está entre as trilhas indicadas (cada critério só conta quando foi indicado). Sem nenhuma sugestão, não sugere nada.
 */
export function suggestPositions<T extends { level: PositionLevel; careerTrack: CareerTrack }>(hints: TargetHints, positions: readonly T[]): T[] {
  if (!hasHints(hints)) return [];
  return positions.filter(p =>
    (hints.levels.length === 0 || hints.levels.includes(p.level)) &&
    (hints.careerTracks.length === 0 || hints.careerTracks.includes(p.careerTrack))
  );
}

export const templateQuestionCount = (blocks: readonly SurveyBlock[]): number => blocks.reduce((sum, b) => sum + b.questions.length, 0);

// ---- Biblioteca do sistema -------------------------------------------------------------------
const scale = (id: string, text: string): SurveyQuestion => ({ id, text, type: 'scale', required: true });
const choice = (id: string, text: string, options: string[]): SurveyQuestion => ({ id, text, type: 'choice', options, required: true });
const free = (id: string, text: string): SurveyQuestion => ({ id, text, type: 'text', required: false });

const everyone = (id: string, title: string, description: string, questions: SurveyQuestion[]): SurveyBlock =>
  ({ id, title, description, audience: 'all', positionIds: [], targetHints: noHints(), questions });

const forRoles = (id: string, title: string, description: string, hints: Partial<TargetHints>, questions: SurveyQuestion[]): SurveyBlock =>
  ({ id, title, description, audience: 'roles', positionIds: [], targetHints: { ...noHints(), ...hints }, questions });

const system = (id: string, name: string, focus: string, description: string, blocks: SurveyBlock[]): SurveyTemplate =>
  ({ id, name, focus, description, blocks, system: true });

/**
 * Biblioteca padrão. Todo template continua com o núcleo da pesquisa (recomendação/eNPS, cinco categorias e comentário):
 * os blocos abaixo são as perguntas estratégicas a mais. Um bloco "para cargos" só aparece para quem está vinculado a um dos Cargos
 * cadastrados escolhidos; as sugestões (nível e trilha do cadastro de Cargos) apenas indicam quais cargos marcar quando o template vira uma pesquisa.
 */
export const SYSTEM_TEMPLATES: readonly SurveyTemplate[] = [
  system('sys-clima-geral', 'Clima geral (padrão)', 'Toda a organização',
    'Só o núcleo: recomendação (eNPS), cinco categorias e um comentário. Serve para o pulso periódico, comparável entre pesquisas.',
    []),

  system('sys-lideranca', 'Liderança e gestão de pessoas', 'Liderança',
    'Como as pessoas enxergam a liderança direta e o que quem lidera precisa para conduzir bem o time.',
    [
      everyone('lid-todos', 'Sobre a sua liderança direta', 'Todos respondem sobre o gestor com quem trabalham no dia a dia.', [
        scale('lid-t1', 'Meu gestor deixa claro o que se espera do meu trabalho.'),
        scale('lid-t2', 'Recebo feedback do meu gestor com a frequência de que preciso para evoluir.'),
        scale('lid-t3', 'Confio nas decisões da liderança da minha área.'),
        scale('lid-t4', 'Meu gestor reconhece o meu trabalho.'),
        choice('lid-t5', 'Com que frequência você conversa individualmente (1:1) com seu gestor?',
          ['Toda semana', 'A cada 15 dias', 'Uma vez por mês', 'Raramente', 'Nunca'])
      ]),
      forRoles('lid-lideres', 'Para quem lidera pessoas', 'Só quem tem cargo de liderança vê estas perguntas.',
        { levels: ['Coordenação', 'Gerência', 'Diretoria'] }, [
          scale('lid-l1', 'Tenho autonomia e apoio da direção para tomar as decisões da minha equipe.'),
          scale('lid-l2', 'Sinto-me preparado(a) para conduzir conversas difíceis com o meu time.'),
          scale('lid-l3', 'Tenho tempo suficiente para desenvolver as pessoas do meu time.'),
          choice('lid-l4', 'Qual é o seu maior desafio como líder hoje?',
            ['Reter bons profissionais', 'Alinhar o time com a estratégia', 'Sobrecarga de trabalho', 'Falta de ferramentas ou orçamento', 'Conflitos na equipe', 'Outro']),
          free('lid-l5', 'O que a empresa poderia fazer para apoiar melhor a liderança?')
        ])
    ]),

  system('sys-tecnologia', 'Tecnologia e produto', 'Tecnologia',
    'Ferramentas, qualidade técnica, aprendizado e foco de quem desenvolve, testa e cuida dos produtos digitais.',
    [
      forRoles('tec-time', 'Ambiente de tecnologia', 'Perguntas para as pessoas de tecnologia e produto.',
        { careerTracks: ['Y_TECNICO'] }, [
          scale('tec-1', 'As ferramentas e a infraestrutura que uso me permitem trabalhar com qualidade.'),
          scale('tec-2', 'Tenho tempo para reduzir dívida técnica e melhorar a qualidade do que entrego.'),
          scale('tec-3', 'Tenho acesso a treinamentos e certificações para me manter atualizado(a).'),
          scale('tec-4', 'Os processos de entrega e de revisão de código funcionam bem.'),
          scale('tec-5', 'O meu trabalho técnico é valorizado pela liderança.'),
          choice('tec-6', 'Quanto do seu tempo vai para reuniões?', ['Menos de 10%', 'De 10% a 25%', 'De 25% a 50%', 'Mais de 50%']),
          free('tec-7', 'O que mais atrapalha a sua produtividade técnica hoje?')
        ])
    ]),

  system('sys-comercial', 'Comercial e vendas', 'Comercial',
    'Metas, remuneração variável, apoio ao time de vendas e a pressão por resultados.',
    [
      forRoles('com-time', 'Rotina comercial', 'Perguntas para quem trabalha com vendas e relacionamento comercial.',
        {}, [
          scale('com-1', 'As metas de vendas são desafiadoras e possíveis de atingir.'),
          scale('com-2', 'Recebo leads e materiais de boa qualidade para trabalhar.'),
          scale('com-3', 'A regra de comissionamento ou remuneração variável é clara e justa.'),
          scale('com-4', 'Conto com o apoio de marketing, pós-venda e operações quando preciso.'),
          scale('com-5', 'A cobrança por resultados é saudável no meu dia a dia.'),
          choice('com-6', 'Como você avalia o seu nível de estresse com as metas?', ['Baixo', 'Moderado', 'Alto', 'Muito alto']),
          free('com-7', 'O que ajudaria você a vender melhor?')
        ])
    ]),

  system('sys-atendimento', 'Atendimento e operações', 'Operações',
    'Segurança, escala, treinamento e carga de trabalho de quem está na linha de frente e na operação.',
    [
      forRoles('ope-time', 'Rotina operacional', 'Perguntas para quem atua no atendimento e na operação.',
        { careerTracks: ['OPERACIONAL'] }, [
          scale('ope-1', 'Tenho os materiais e equipamentos necessários para fazer o meu trabalho com segurança.'),
          scale('ope-2', 'A escala e a distribuição das tarefas são justas.'),
          scale('ope-3', 'Recebo o treinamento de que preciso para executar bem as minhas atividades.'),
          scale('ope-4', 'Sinto-me seguro(a), física e emocionalmente, no meu ambiente de trabalho.'),
          scale('ope-5', 'Tenho voz para sugerir melhorias nos processos.'),
          choice('ope-6', 'Como você avalia a sua carga de trabalho?', ['Leve', 'Adequada', 'Pesada', 'Excessiva']),
          free('ope-7', 'Qual mudança melhoraria mais o seu dia a dia?')
        ])
    ]),

  system('sys-saude', 'Saúde e assistência', 'Saúde',
    'Tempo de atendimento, apoio da equipe, escalas e sinais de esgotamento em equipes de saúde.',
    [
      forRoles('sau-time', 'Cuidado com pacientes', 'Perguntas para profissionais de saúde e assistência.',
        {}, [
          scale('sau-1', 'Tenho tempo adequado para cada paciente ou atendimento.'),
          scale('sau-2', 'Sinto-me apoiado(a) pela equipe multiprofissional.'),
          scale('sau-3', 'A escala de plantões e atendimentos me permite descansar e ter vida pessoal.'),
          scale('sau-4', 'Tenho protocolos e recursos para prestar um cuidado seguro.'),
          scale('sau-5', 'A empresa cuida da saúde emocional de quem cuida dos pacientes.'),
          choice('sau-6', 'Com que frequência você sente sinais de esgotamento (burnout)?', ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente']),
          free('sau-7', 'Que tipo de apoio você gostaria de receber?')
        ])
    ]),

  system('sys-onboarding', 'Primeiros 90 dias (integração)', 'Novos colaboradores',
    'Como foi a chegada: organização, clareza de papel, apoio e se a realidade correspondeu ao que foi prometido na seleção.',
    [
      everyone('onb-todos', 'Integração', 'Pense em como foram os seus primeiros 90 dias na empresa.', [
        scale('onb-1', 'As minhas primeiras semanas foram bem organizadas.'),
        scale('onb-2', 'Tive clareza do que se esperava de mim nos primeiros 90 dias.'),
        scale('onb-3', 'Recebi o apoio de um colega ou mentor sempre que precisei.'),
        scale('onb-4', 'O que me foi apresentado na seleção correspondeu à realidade do trabalho.'),
        scale('onb-5', 'Tive acesso rápido a sistemas, ferramentas e documentos.'),
        choice('onb-6', 'Em que momento você mais se sentiu perdido(a)?',
          ['Na primeira semana', 'No primeiro mês', 'No segundo mês', 'No terceiro mês', 'Não me senti perdido(a)']),
        free('onb-7', 'O que faltou para uma integração melhor?')
      ])
    ]),

  system('sys-hibrido', 'Trabalho híbrido e remoto', 'Toda a organização',
    'Produtividade, comunicação e equidade entre quem trabalha no escritório e à distância.',
    [
      everyone('hib-todos', 'Formato de trabalho', 'Sobre onde e como o trabalho acontece hoje.', [
        scale('hib-1', 'Consigo ser produtivo(a) no formato de trabalho atual.'),
        scale('hib-2', 'A comunicação com o meu time funciona bem, mesmo à distância.'),
        scale('hib-3', 'As regras de trabalho presencial e remoto são claras e justas.'),
        scale('hib-4', 'Tenho as mesmas oportunidades de crescimento, trabalhe eu de onde trabalhar.'),
        choice('hib-5', 'Qual formato você prefere?',
          ['100% presencial', 'Híbrido, 1 a 2 dias no escritório', 'Híbrido, 3 a 4 dias no escritório', '100% remoto']),
        free('hib-6', 'O que melhoraria o formato de trabalho da sua equipe?')
      ])
    ]),

  system('sys-cultura', 'Cultura, valores e propósito', 'Toda a organização',
    'Se as pessoas enxergam propósito, valores vividos na prática, segurança para opinar e inclusão.',
    [
      everyone('cul-todos', 'Cultura e propósito', 'Sobre como os valores da empresa aparecem no dia a dia.', [
        scale('cul-1', 'Consigo enxergar como o meu trabalho contribui para os objetivos da empresa.'),
        scale('cul-2', 'As pessoas agem de acordo com os valores que a empresa diz ter.'),
        scale('cul-3', 'Posso ser eu mesmo(a) no trabalho.'),
        scale('cul-4', 'A empresa promove diversidade e inclusão de verdade.'),
        scale('cul-5', 'Posso dar a minha opinião sem medo de represálias.'),
        free('cul-6', 'Em uma frase, o que torna esta empresa um bom lugar para trabalhar?')
      ])
    ])
];

export const findSystemTemplate = (id: string): SurveyTemplate | undefined => SYSTEM_TEMPLATES.find(t => t.id === id);
