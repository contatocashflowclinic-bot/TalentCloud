import { PLAN_ROUTINES } from '../../src/access.js';
import { Tenant } from '../../src/types.js';

export const INITIAL_TENANTS: Omit<Tenant, 'dbConfig'>[] = [
  {
    id: 'tenant-techcorp',
    name: 'TechCorp Inovações Digitais',
    slug: 'techcorp',
    tradingName: 'TechCorp Inovações',
    document: '48.912.834/0001-92',
    contactEmail: 'rh@techcorp.io',
    status: 'active',
    plan: 'Enterprise',
    enabledRoutines: PLAN_ROUTINES['Enterprise'],
    createdAt: '2026-01-15T10:00:00Z',
    features: {
      aiEvaluationEnabled: true,
      onboardingChecklistEnabled: true,
      retentionPredictorEnabled: true,
      advancedIndicatorsEnabled: true
    }
  },
  {
    id: 'tenant-varejobr',
    name: 'Varejo Brasil S.A.',
    slug: 'varejobr',
    tradingName: 'Varejo Brasil',
    document: '12.345.678/0001-23',
    contactEmail: 'gente@varejobrasil.com.br',
    status: 'active',
    plan: 'Scale',
    enabledRoutines: PLAN_ROUTINES['Scale'],
    createdAt: '2026-02-01T14:30:00Z',
    features: {
      aiEvaluationEnabled: true,
      onboardingChecklistEnabled: true,
      retentionPredictorEnabled: false,
      advancedIndicatorsEnabled: true
    }
  },
  {
    id: 'tenant-biosaude',
    name: 'BioSaúde Diagnósticos e Pesquisa',
    slug: 'biosaude',
    tradingName: 'BioSaúde Labs',
    document: '98.765.432/0001-09',
    contactEmail: 'talentos@biosaude.med.br',
    status: 'active',
    plan: 'Enterprise',
    enabledRoutines: PLAN_ROUTINES['Enterprise'],
    createdAt: '2026-02-18T09:15:00Z',
    features: {
      aiEvaluationEnabled: true,
      onboardingChecklistEnabled: true,
      retentionPredictorEnabled: true,
      advancedIndicatorsEnabled: true
    }
  }
];

export function getTechCorpSeedData() {
  return {
    dna: {
      tenantId: 'tenant-techcorp',
      mission: 'Acelerar a transformação digital através de tecnologia com rigor de engenharia e foco humano.',
      vision: 'Ser o ecossistema tecnológico mais admirado por retenção e desenvolvimento de talentos.',
      archetype: 'Inovador & Ágil' as const,
      cultureSummary: 'Engenharia de alto nível, mentalidade de dono, colaboração sem intermediários e aprendizado contínuo.',
      coreValues: ['Excelência Técnica', 'Ownership & Autonomia', 'Transparência de Decisões', 'Segurança Psicológica'],
      pillars: [
        {
          id: 'p1',
          name: 'Excelência Técnica & Arquitetural',
          description: 'Apreciação por código limpo, sistemas resilientes e decisões orientadas a dados.',
          weight: 5,
          expectedBehaviors: ['Defende boas práticas com clareza', 'Considera escalabilidade e manutenibilidade', 'Faz code reviews construtivos'],
          undesiredBehaviors: ['Gera débitos técnicos crônicos sem documentar', 'Resiste a testes automatizados']
        },
        {
          id: 'p2',
          name: 'Ownership & Protagonismo',
          description: 'Agir como dono do produto, liderando soluções desde a concepção até a produção.',
          weight: 5,
          expectedBehaviors: ['Assume responsabilidade fim-a-fim', 'Antecipa riscos de entrega', 'Busca feedback ativamente'],
          undesiredBehaviors: ['Espera ordens para atuar em gargalos', 'Aponta problemas sem sugerir alternativas']
        },
        {
          id: 'p3',
          name: 'Colaboração & Compartilhamento',
          description: 'Compartilhar aprendizados e elevar o nível da equipe.',
          weight: 4,
          expectedBehaviors: ['Mentora pares com paciência', 'Documenta decisões de arquitetura', 'Estimula inclusão no time'],
          undesiredBehaviors: ['Mantém feudos de conhecimento', 'Comunicação ríspida em feedbacks']
        }
      ],
      culturalFitThreshold: 80,
      updatedAt: '2026-03-01T12:00:00Z'
    },
    users: [
      {
        id: 'tc-usr-1',
        tenantId: 'tenant-techcorp',
        name: 'Camila Albuquerque',
        email: 'camila.albuquerque@techcorp.io',
        profileId: 'admin',
        jobTitle: 'Head de People & Cultura',
        active: true,
        lastLoginAt: '2026-03-18T16:45:00Z',
      },
      {
        id: 'tc-usr-2',
        tenantId: 'tenant-techcorp',
        name: 'Mariana Silva',
        email: 'mariana.silva@techcorp.io',
        profileId: 'recruiter',
        jobTitle: 'Tech Recruiter Senior',
        active: true,
        lastLoginAt: '2026-03-18T17:15:00Z',
      },
      {
        id: 'tc-usr-3',
        tenantId: 'tenant-techcorp',
        name: 'Rodrigo Fontes',
        email: 'rodrigo.fontes@techcorp.io',
        profileId: 'hiring_manager',
        jobTitle: 'Gerente de Engenharia',
        departmentId: 'dep-tc-eng',
        active: true,
        lastLoginAt: '2026-03-18T14:30:00Z',
      },
      {
        id: 'tc-usr-4',
        tenantId: 'tenant-techcorp',
        name: 'Lucas Nogueira',
        email: 'lucas.nogueira@techcorp.io',
        profileId: 'interviewer',
        jobTitle: 'Staff Software Architect',
        departmentId: 'dep-tc-eng',
        active: true,
        lastLoginAt: '2026-03-17T11:00:00Z',
      }
    ],
    departments: [
      {
        id: 'dep-tc-eng',
        name: 'Engenharia de Software',
        code: 'ENG',
        managerId: 'tc-usr-3',
        costCenter: 'CC-4010',
        headcountTarget: 45,
        currentHeadcount: 38
      },
      {
        id: 'dep-tc-prod',
        name: 'Produto & Design',
        code: 'PRD',
        managerId: 'tc-usr-1',
        costCenter: 'CC-4020',
        headcountTarget: 18,
        currentHeadcount: 15
      },
      {
        id: 'dep-tc-ai',
        name: 'Inteligência Artificial & Dados',
        code: 'DATA_AI',
        managerId: 'tc-usr-3',
        costCenter: 'CC-4030',
        headcountTarget: 12,
        currentHeadcount: 9
      },
      {
        id: 'dep-tc-people',
        name: 'Gente & Gestão',
        code: 'PEOPLE',
        managerId: 'tc-usr-1',
        costCenter: 'CC-1010',
        headcountTarget: 8,
        currentHeadcount: 7
      }
    ],
    positions: [
      {
        id: 'pos-tc-1',
        title: 'Tech Lead / Arquiteto Fullstack',
        departmentId: 'dep-tc-eng',
        level: 'Especialista',
        description: 'Liderança técnica de squad ágil, desenho de microsserviços e governança de arquitetura distribuída.',
        technicalRequirements: ['TypeScript', 'Node.js / Express', 'React 19', 'PostgreSQL / Multi-tenancy', 'Docker / Kubernetes', 'Mensageria Kafka / RabbitMQ'],
        behavioralCompetencies: ['Comunicação executiva', 'Mentoria de desenvolvedores', 'Foco em resolução ágil de problemas', 'Capacidade analítica'],
        minSalary: 18000,
        maxSalary: 23000,
        currency: 'BRL',
        careerTrack: 'Y_TECNICO',
        status: 'active'
      },
      {
        id: 'pos-tc-2',
        title: 'Engenheiro de IA & LLM Ops',
        departmentId: 'dep-tc-ai',
        level: 'Sênior',
        description: 'Desenvolvimento e orquestração de soluções com Gemini API, RAG, embeddings e observabilidade de IA.',
        technicalRequirements: ['Python / TypeScript', 'Gemini Models & Vertex AI', 'Vector DBs (pgvector / Pinecone)', 'LangChain / GenAI SDK', 'Docker'],
        behavioralCompetencies: ['Curiosidade investigativa', 'Ética no uso de IA', 'Autonomia com entregas complexas'],
        minSalary: 16000,
        maxSalary: 21000,
        currency: 'BRL',
        careerTrack: 'Y_TECNICO',
        status: 'active'
      },
      {
        id: 'pos-tc-3',
        title: 'Product Designer (Design System & UX)',
        departmentId: 'dep-tc-prod',
        level: 'Pleno',
        description: 'Concepção de fluxos complexos B2B, discovery contínuo e manutenção de Design System escalável.',
        technicalRequirements: ['Figma avançado', 'Design Tokens & Tailwind', 'Testes de usabilidade', 'Métricas de produto (HEART / SUS)'],
        behavioralCompetencies: ['Empatia pelo usuário final', 'Negociação de escopo com devs', 'Atenção aos detalhes'],
        minSalary: 9500,
        maxSalary: 13000,
        currency: 'BRL',
        careerTrack: 'OPERACIONAL',
        status: 'active'
      }
    ],
    openings: [
      {
        id: 'job-tc-101',
        positionId: 'pos-tc-1',
        title: 'Tech Lead Fullstack (Multi-Tenant Platform)',
        departmentId: 'dep-tc-eng',
        hiringManagerId: 'tc-usr-3',
        recruiterId: 'tc-usr-2',
        status: 'open' as const,
        openingsCount: 2,
        filledCount: 0,
        workModel: 'Remoto' as const,
        location: 'Brasil (Qualquer cidade)',
        slaDays: 30,
        openedAt: '2026-03-01T09:00:00Z',
        targetFillDate: '2026-03-31T23:59:59Z',
        salaryOfferedMin: 19000,
        salaryOfferedMax: 22500,
        stages: [
          { id: 'stg-1', name: 'Triagem Curricular', type: 'screening' as const, order: 1, description: 'Análise de aderência técnica e requisitos obrigatórios' },
          { id: 'stg-2', name: 'Fit Cultural com IA', type: 'cultural_fit' as const, order: 2, description: 'Avaliação assistida de aderência ao DNA TechCorp' },
          { id: 'stg-3', name: 'Desafio & Entrevista Técnica', type: 'technical_assessment' as const, order: 3, description: 'Live coding e discussão arquitetural com Staff Engineer' },
          { id: 'stg-4', name: 'Alinhamento com Gestor', type: 'manager_interview' as const, order: 4, description: 'Expectativas de liderança de squad e cultura de entrega' },
          { id: 'stg-5', name: 'Proposta & Contratação', type: 'proposal' as const, order: 5, description: 'Envio formal de oferta salarial e benefícios' }
        ]
      },
      {
        id: 'job-tc-102',
        positionId: 'pos-tc-2',
        title: 'Senior AI Engineer - Gemini & RAG',
        departmentId: 'dep-tc-ai',
        hiringManagerId: 'tc-usr-3',
        recruiterId: 'tc-usr-2',
        status: 'in_progress' as const,
        openingsCount: 1,
        filledCount: 0,
        workModel: 'Híbrido' as const,
        location: 'São Paulo, SP',
        slaDays: 40,
        openedAt: '2026-03-05T10:00:00Z',
        targetFillDate: '2026-04-15T23:59:59Z',
        salaryOfferedMin: 17000,
        salaryOfferedMax: 21000,
        stages: [
          { id: 'stg-1', name: 'Triagem Inicial', type: 'screening' as const, order: 1, description: 'Triagem de portfólio e histórico de LLMs' },
          { id: 'stg-2', name: 'Entrevista de Competências', type: 'cultural_fit' as const, order: 2, description: 'Avaliação de ética de IA e aprendizado contínuo' },
          { id: 'stg-3', name: 'Case Prático de IA', type: 'technical_assessment' as const, order: 3, description: 'Apresentação de arquitetura de RAG escalável' },
          { id: 'stg-4', name: 'Entrevista Final', type: 'manager_interview' as const, order: 4, description: 'Fit de liderança técnica' },
          { id: 'stg-5', name: 'Oferta', type: 'proposal' as const, order: 5, description: 'Fechamento' }
        ]
      }
    ],
    candidates: [
      {
        id: 'cand-tc-01',
        name: 'Gabriel Ribeiro de Rezende',
        email: 'gabriel.rezende@devmail.com',
        phone: '+55 11 98765-4321',
        location: 'Campinas, SP (Disponível Remoto)',
        linkedinUrl: 'https://linkedin.com/in/gabriel-rezende-tech',
        currentRole: 'Senior Fullstack Engineer na CloudStack',
        yearsOfExperience: 8,
        education: 'Bacharelado em Ciência da Computação - UNICAMP',
        resumeSummary: '8 anos de experiência sólida em arquiteturas SaaS multi-tenant, Node.js/TypeScript de alta performance, microsserviços resilientes, PostgreSQL particionado e liderança técnica de squads de 6 engenheiros. Apaixonado por código limpo, automação de CI/CD e mentoria de desenvolvedores júnior e pleno.',
        skills: ['TypeScript', 'Node.js', 'React', 'PostgreSQL', 'Multi-tenancy', 'Docker', 'Kubernetes', 'Clean Architecture', 'Redis'],
        languages: ['Português (Nativo)', 'Inglês (Avançado/Fluente)'],
        registeredAt: '2026-03-10T14:20:00Z',
        tags: ['Top Talent', 'Experiência Multi-tenant', 'Liderança']
      },
      {
        id: 'cand-tc-02',
        name: 'Juliana Beatriz Mendonça',
        email: 'juliana.mendonca@clouddev.io',
        phone: '+55 21 99123-8877',
        location: 'Rio de Janeiro, RJ (Remoto)',
        linkedinUrl: 'https://linkedin.com/in/juliana-mendonca-eng',
        currentRole: 'Staff Software Engineer na PayFintech',
        yearsOfExperience: 9,
        education: 'Engenharia da Computação - UFRJ',
        resumeSummary: 'Especialista em microsserviços distribuídos e mensageria assíncrona. Experiência em empresas de tecnologia de rápido crescimento, liderando iniciativas de refatoração para multi-tenancy e redução de latência em 40%. Conhecida por forte colaboração e cultura de ownership.',
        skills: ['TypeScript', 'Go', 'Node.js', 'PostgreSQL', 'Kafka', 'AWS', 'Multi-tenant DBs', 'GraphQL'],
        languages: ['Português (Nativo)', 'Inglês (Fluente)'],
        registeredAt: '2026-03-12T11:05:00Z',
        tags: ['Sênior', 'Fintech Background', 'Alta Resiliência']
      },
      {
        id: 'cand-tc-03',
        name: 'Lucas Prado Silveira',
        email: 'lucas.prado@aimodel.org',
        phone: '+55 31 98456-1122',
        location: 'Belo Horizonte, MG',
        linkedinUrl: 'https://linkedin.com/in/lucas-prado-ai',
        currentRole: 'Machine Learning Engineer na DataCore',
        yearsOfExperience: 5,
        education: 'Mestrado em Inteligência Artificial - UFMG',
        resumeSummary: 'Foco em Large Language Models, integração com Google Gemini e Vertex AI, pipelines de embeddings e vector stores. Publicou artigos em conferências de PLN e criou ferramentas de observabilidade de agentes inteligentes.',
        skills: ['Python', 'TypeScript', 'Gemini API', 'Vertex AI', 'pgvector', 'Docker', 'FastAPI'],
        languages: ['Português (Nativo)', 'Inglês (Avançado)'],
        registeredAt: '2026-03-14T08:30:00Z',
        tags: ['Especialista LLM', 'Gemini Pro', 'RAG']
      }
    ],
    applications: [
      {
        id: 'app-tc-1',
        jobOpeningId: 'job-tc-101',
        candidateId: 'cand-tc-01',
        currentStageId: 'stg-2', // Fit Cultural com IA
        status: 'in_review' as const,
        appliedAt: '2026-03-10T14:30:00Z',
        notes: ['Currículo excelente para a arquitetura multi-tenant planejada.', 'Passou na triagem com 98% de correspondência técnica.'],
        aiEvaluationId: 'eval-tc-01'
      },
      {
        id: 'app-tc-2',
        jobOpeningId: 'job-tc-101',
        candidateId: 'cand-tc-02',
        currentStageId: 'stg-3', // Desafio Técnico
        status: 'advancing' as const,
        appliedAt: '2026-03-12T11:15:00Z',
        notes: ['Entrevista de fit cultural concluída com nota máxima pelo RH.'],
        aiEvaluationId: 'eval-tc-02'
      },
      {
        id: 'app-tc-3',
        jobOpeningId: 'job-tc-102',
        candidateId: 'cand-tc-03',
        currentStageId: 'stg-2',
        status: 'in_review' as const,
        appliedAt: '2026-03-14T09:00:00Z',
        notes: ['Perfil muito forte para o laboratório de IA e pipelines de RAG.']
      }
    ],
    aiEvaluations: [
      {
        id: 'eval-tc-01',
        candidateId: 'cand-tc-01',
        jobOpeningId: 'job-tc-101',
        evaluatedAt: '2026-03-11T10:15:00Z',
        overallFitScore: 92,
        technicalFitScore: 95,
        culturalFitScore: 89,
        detailedExplanation: 'O candidato demonstra profunda aderência técnica aos requisitos da vaga de Tech Lead Fullstack, destacando-se por experiência prática prévia em arquiteturas multi-tenant com PostgreSQL e liderança técnica de squads ágeis. Sob a ótica do DNA Cultural TechCorp, apresenta alto protagonismo (ownership) e valorização por excelência arquitetural.',
        keyStrengths: [
          'Domínio prático comprovado em separação de dados e isolamento multi-tenant',
          'Experiência consolidada em mentoria de desenvolvedores e code reviews rigorosos',
          'Excelente fluência em TypeScript e ecossistema Node moderno'
        ],
        potentialGaps: [
          'Pouca menção direta a processos de contratação de pessoas no histórico resumido, embora tenha atuado em liderança técnica de squads'
        ],
        suggestedInterviewQuestions: [
          'Como você lidou no passado com o particionamento ou isolamento de banco de dados para garantir que dados de um cliente nunca vazassem para outro?',
          'Na TechCorp temos o pilar de "Ownership & Protagonismo". Conte uma ocasião onde um incidente crítico de produção ocorreu e você assumiu a condução até a estabilização.',
          'Como você orienta um desenvolvedor pleno que entrega código funcional mas sem os padrões de manutenibilidade esperados?'
        ],
        pillarScores: [
          { pillarName: 'Excelência Técnica & Arquitetural', score: 96, analysis: 'Evidenciada pela trajetória em engenharia limpa, microsserviços e bancos particionados.' },
          { pillarName: 'Ownership & Protagonismo', score: 91, analysis: 'Demonstra histórico de condução de projetos do início ao fim com responsabilidade direta.' },
          { pillarName: 'Colaboração & Compartilhamento', score: 88, analysis: 'Atuação constante em code reviews e mentoria de novos membros da equipe.' }
        ],
        humanReviewerDecision: 'APPROVED' as const,
        humanNotes: 'IA recomendou avanço imediato para entrevista técnica com Staff Engineer. Perguntas sugeridas serão incorporadas ao roteiro.',
        reviewedBy: 'tc-usr-2',
        reviewedAt: '2026-03-11T14:00:00Z'
      }
    ],
    interviews: [
      {
        id: 'int-tc-01',
        jobOpeningId: 'job-tc-101',
        candidateId: 'cand-tc-01',
        stageName: 'Fit Cultural com IA & RH',
        scheduledFor: '2026-03-19T14:00:00Z',
        interviewerIds: ['tc-usr-2'],
        durationMinutes: 45,
        meetLink: 'https://meet.google.com/tch-fit-eval',
        status: 'scheduled' as const,
        structuredScript: [
          'Apresentação mútua e alinhamento de princípios da TechCorp',
          'Validação dos pontos levantados na avaliação de IA',
          'Perguntas comportamentais sobre autonomia e resolução de conflitos'
        ],
        scorecard: [
          { competency: 'Alinhamento ao DNA Cultural', score: 5, notes: 'Demonstra forte identificação com nossos pilares.' },
          { competency: 'Comunicação e Clareza', score: 5, notes: 'Articulação lógica exemplar.' },
          { competency: 'Maturidade de Carreira', score: 4, notes: 'Objetivos alinhados com o momento da empresa.' }
        ]
      }
    ],
    offers: [
      {
        id: 'off-tc-01',
        jobOpeningId: 'job-tc-101',
        candidateId: 'cand-tc-02',
        baseSalary: 21500,
        benefits: ['Plano de Saúde Bradesco Top Nacional', 'Vale Refeição/Alimentação R$ 1.800/mês', 'Auxílio Home Office R$ 450/mês', 'Gympass Platinum', 'Programa de Stock Options após 1 ano'],
        startDate: '2026-04-06',
        contractType: 'CLT' as const,
        status: 'approved' as const,
        approverId: 'tc-usr-3',
        notes: 'Oferta aprovada pela diretoria de engenharia e RH.'
      }
    ],
    onboardings: [
      {
        id: 'onb-tc-01',
        candidateId: 'cand-tc-prev-01',
        candidateName: 'Beatriz Vasconcelos',
        jobTitle: 'Senior Frontend Engineer',
        departmentId: 'dep-tc-eng',
        mentorId: 'tc-usr-4',
        hireDate: '2026-03-02',
        status: 'in_progress' as const,
        checklists: [
          { id: 'c1', title: 'Assinatura digital do contrato e documentação admissional', category: 'Documentação' as const, dueDateDay: 1, status: 'completed' as const, assignedToRole: 'RH' },
          { id: 'c2', title: 'Provisionamento de notebook, chaves SSH e acessos aos clusters', category: 'TI & Acessos' as const, dueDateDay: 1, status: 'completed' as const, assignedToRole: 'TI' },
          { id: 'c3', title: 'Imersão no DNA Organizacional e reunião com o Buddy', category: 'Cultura & Boas-Vindas' as const, dueDateDay: 3, status: 'completed' as const, assignedToRole: 'Buddy' },
          { id: 'c4', title: 'Primeiro commit em produção no ambiente de homologação', category: 'Treinamento Técnico' as const, dueDateDay: 14, status: 'in_progress' as const, assignedToRole: 'Gestor' },
          { id: 'c5', title: 'Check-in de 30 dias com o Hiring Manager', category: 'Cultura & Boas-Vindas' as const, dueDateDay: 30, status: 'pending' as const, assignedToRole: 'Gestor' }
        ],
        milestones30DaysDone: false,
        milestones60DaysDone: false,
        milestones90DaysDone: false,
        notes: 'Integração técnica avançando com excelente feedback do padrinho Lucas.'
      }
    ],
    developmentRecords: [
      {
        id: 'dev-tc-01',
        collaboratorId: 'colab-tc-1',
        collaboratorName: 'Beatriz Vasconcelos',
        jobTitle: 'Senior Frontend Engineer',
        departmentId: 'dep-tc-eng',
        managerId: 'tc-usr-3',
        hireDate: '2026-03-02',
        goals: [
          { id: 'g1', title: 'Dominar o ecossistema de microfrontends e testes de acessibilidade', competency: 'Excelência Técnica', deadline: '2026-06-30', status: 'in_progress' as const, progressPercentage: 65 },
          { id: 'g2', title: 'Conduzir 2 workshops internos sobre otimização de Core Web Vitals', competency: 'Colaboração & Compartilhamento', deadline: '2026-08-30', status: 'not_started' as const, progressPercentage: 0 }
        ],
        oneOnOnes: [
          { id: '1on1-1', date: '2026-03-16', keyTakeaways: 'Beatriz está muito motivada com o projeto e elogiou a receptividade do time.', actionItems: ['Configurar monitoramento de métricas no dashboard'] }
        ],
        lastReviewDate: '2026-03-16',
        nextReviewDate: '2026-04-02'
      }
    ],
    climateSurveys: [
      {
        id: 'cs-tc-1',
        period: '2026-Q1',
        enpsScore: 9,
        sentiment: 'positive' as const,
        categoryRatings: { lideranca: 9.2, cultura: 9.5, crescimento: 8.8, remuneracao: 8.5, ambiente: 9.4 },
        anonymousComment: 'A autonomia dada aos times de engenharia e a clareza dos objetivos são os maiores diferenciais da TechCorp.'
      },
      {
        id: 'cs-tc-2',
        period: '2026-Q1',
        enpsScore: 10,
        sentiment: 'positive' as const,
        categoryRatings: { lideranca: 9.8, cultura: 9.6, crescimento: 9.2, remuneracao: 9.0, ambiente: 9.7 },
        anonymousComment: 'Processo de contratação foi super transparente e o onboarding com buddy me acolheu desde o dia zero.'
      }
    ],
    turnoverAlerts: [
      {
        id: 'alt-tc-01',
        collaboratorId: 'colab-tc-warn-01',
        collaboratorName: 'Marcos Vinicius (Dev Pleno)',
        department: 'Engenharia de Software',
        riskLevel: 'Médio' as const,
        earlyWarningSignals: [
          'Completou 18 meses sem revisão de trilha de carreira técnica',
          'Queda de 20% na frequência de participação em 1:1s nos últimos 45 dias'
        ],
        suggestedActions: [
          'Agendar conversa de carreira proativa com Rodrigo (Gestor)',
          'Revisar metas do PDI e avaliar plano de promoção para nível Sênior'
        ],
        lastActionTaken: 'Reunião de alinhamento de PDI pré-agendada para quinta-feira.',
        status: 'monitoring' as const,
        history: [
          { at: '2026-03-12T13:00:00.000Z', by: 'Sistema', kind: 'created' as const, text: 'Alerta aberto com risco Médio.' },
          { at: '2026-03-13T14:30:00.000Z', by: 'Rodrigo (Gestor)', kind: 'action' as const, text: 'Reunião de alinhamento de PDI pré-agendada para quinta-feira.' },
          { at: '2026-03-13T14:30:00.000Z', by: 'Rodrigo (Gestor)', kind: 'status' as const, text: 'Situação: Aberto → Em acompanhamento.' }
        ],
        createdAt: '2026-03-12T13:00:00.000Z',
        createdBy: 'Sistema',
        updatedAt: '2026-03-13T14:30:00.000Z'
      }
    ],
    indicators: {
      tenantId: 'tenant-techcorp',
      period: '2026-Q1',
      timeToHireDays: 22,
      costPerHire: 3450,
      earlyTurnover90DaysRate: 2.1,
      averageCulturalFit: 88.4,
      openPositionsCount: 3,
      totalHiresThisQuarter: 9,
      retentionRate12Months: 96.5,
      candidateNPS: 92,
      recruitmentFunnel: {
        applied: 184,
        screened: 82,
        interviewed: 34,
        offered: 11,
        hired: 9
      }
    }
  };
}

export function getVarejoBrSeedData() {
  return {
    dna: {
      tenantId: 'tenant-varejobr',
      mission: 'Conectar o consumidor brasileiro às melhores ofertas com agilidade logística e atendimento caloroso.',
      vision: 'Ser a varejista omnichannel mais eficiente e humana do país.',
      archetype: 'Orientado a Resultados' as const,
      cultureSummary: 'Paixão pelo cliente, foco em resultados ágeis, simplicidade e valorização das pessoas na ponta.',
      coreValues: ['Cliente em Primeiro Lugar', 'Foco no Resultado', 'Simplicidade Ágil', 'Resiliência Operacional'],
      pillars: [
        {
          id: 'p1',
          name: 'Obsessão pelo Cliente',
          description: 'Resolver a dor do cliente com rapidez e empatia genuína.',
          weight: 5,
          expectedBehaviors: ['Coloca o cliente no centro', 'Atende com cordialidade', 'Ouve reclamações como oportunidades'],
          undesiredBehaviors: ['Burocratiza soluções', 'Trata clientes com indiferença']
        },
        {
          id: 'p2',
          name: 'Entrega & Energia Operacional',
          description: 'Fazer acontecer mesmo em picos de demanda com foco em metas.',
          weight: 4,
          expectedBehaviors: ['Bate metas com sustentabilidade', 'Mantém alto ritmo em datas comemorativas', 'Otimiza custos'],
          undesiredBehaviors: ['Desiste diante de metas desafiadoras', 'Desperdiça recursos da loja']
        }
      ],
      culturalFitThreshold: 70,
      updatedAt: '2026-03-01T10:00:00Z'
    },
    users: [
      {
        id: 'vb-usr-1',
        tenantId: 'tenant-varejobr',
        name: 'Roberto Viana',
        email: 'roberto.viana@varejobrasil.com.br',
        profileId: 'admin',
        jobTitle: 'Diretor de Gente e Cultura',
        active: true,
        lastLoginAt: '2026-03-18T15:00:00Z',
      }
    ],
    departments: [
      { id: 'dep-vb-1', name: 'Operações de Lojas', code: 'LOJAS', managerId: 'vb-usr-1', costCenter: 'CC-7001', headcountTarget: 250, currentHeadcount: 235 },
      { id: 'dep-vb-2', name: 'Logística & Supply Chain', code: 'LOG', managerId: 'vb-usr-1', costCenter: 'CC-7002', headcountTarget: 120, currentHeadcount: 112 }
    ],
    positions: [
      {
        id: 'pos-vb-1',
        title: 'Gerente Regional de Vendas e Operações',
        departmentId: 'dep-vb-1',
        level: 'Gerência',
        description: 'Gestão de 15 lojas físicas, liderança de equipes e cumprimento de metas de vendas.',
        technicalRequirements: ['Gestão de KPIs de Varejo (DRE, Markup, Ticket Médio)', 'Liderança de equipes numerosas', 'Logística de abastecimento'],
        behavioralCompetencies: ['Liderança inspiradora', 'Negociação assertiva', 'Resiliência a pressão de metas'],
        minSalary: 12000,
        maxSalary: 16500,
        currency: 'BRL',
        careerTrack: 'GESTÃO',
        status: 'active'
      }
    ],
    openings: [
      {
        id: 'job-vb-201',
        positionId: 'pos-vb-1',
        title: 'Gerente Regional de Varejo - Lojas Sul',
        departmentId: 'dep-vb-1',
        hiringManagerId: 'vb-usr-1',
        recruiterId: 'vb-usr-1',
        status: 'open' as const,
        openingsCount: 1,
        filledCount: 0,
        workModel: 'Presencial' as const,
        location: 'Curitiba, PR e Região',
        slaDays: 25,
        openedAt: '2026-03-08T08:00:00Z',
        targetFillDate: '2026-04-02T23:59:59Z',
        salaryOfferedMin: 13000,
        salaryOfferedMax: 15500,
        stages: [
          { id: 'stg-1', name: 'Triagem e Experiência em Varejo', type: 'screening' as const, order: 1, description: 'Validação de vivência em grandes redes' },
          { id: 'stg-2', name: 'Fit com DNA Varejo Brasil', type: 'cultural_fit' as const, order: 2, description: 'Avaliação de energia e foco no cliente' },
          { id: 'stg-3', name: 'Painel de Casos Comerciais', type: 'technical_assessment' as const, order: 3, description: 'Simulação de DRE e plano de vendas' },
          { id: 'stg-4', name: 'Proposta Final', type: 'proposal' as const, order: 4, description: 'Apresentação de remuneração fixa e variável' }
        ]
      }
    ],
    candidates: [
      {
        id: 'cand-vb-01',
        name: 'Carlos Eduardo Barreto',
        email: 'carlos.barreto@varejomail.com',
        phone: '+55 41 98877-6655',
        location: 'Curitiba, PR',
        currentRole: 'Gerente Geral de Loja na Rede Sul Varejo',
        yearsOfExperience: 11,
        education: 'Administração de Empresas - FAE',
        resumeSummary: '11 anos no varejo físico e eletroeletrônicos. Liderou operações com faturamento mensal superior a R$ 4 milhões e equipes de 45 colaboradores. Reconhecido por bater metas consecutivas em Black Friday e Natal com baixíssimo índice de turnover de equipe.',
        skills: ['Gestão de Loja', 'Gestão de Pessoas', 'DRE Comercial', 'Controle de Perdas', 'Treinamento de Equipes'],
        languages: ['Português (Nativo)'],
        registeredAt: '2026-03-12T10:00:00Z',
        tags: ['Forte Liderança', 'Perfil Comercial', 'Baixo Turnover']
      }
    ],
    applications: [
      {
        id: 'app-vb-1',
        jobOpeningId: 'job-vb-201',
        candidateId: 'cand-vb-01',
        currentStageId: 'stg-2',
        status: 'in_review' as const,
        appliedAt: '2026-03-12T10:30:00Z',
        notes: ['Excelente trajetória no varejo sulista.']
      }
    ],
    aiEvaluations: [],
    interviews: [],
    offers: [],
    onboardings: [],
    developmentRecords: [],
    climateSurveys: [],
    turnoverAlerts: [],
    indicators: {
      tenantId: 'tenant-varejobr',
      period: '2026-Q1',
      timeToHireDays: 19,
      costPerHire: 1900,
      earlyTurnover90DaysRate: 7.2,
      averageCulturalFit: 79.0,
      openPositionsCount: 14,
      totalHiresThisQuarter: 48,
      retentionRate12Months: 88.0,
      candidateNPS: 84,
      recruitmentFunnel: {
        applied: 380,
        screened: 190,
        interviewed: 95,
        offered: 52,
        hired: 48
      }
    }
  };
}

export function getBioSaudeSeedData() {
  return {
    dna: {
      tenantId: 'tenant-biosaude',
      mission: 'Salvar vidas por meio da precisão diagnóstica, ciência de ponta e acolhimento humano aos pacientes.',
      vision: 'Ser o centro de diagnósticos clínicos mais confiável da América Latina.',
      archetype: 'Precisão & Segurança' as const,
      cultureSummary: 'Rigor científico absoluto, conformidade regulatória rigorosa (ANVISA/LGPD), ética e zelo pela vida.',
      coreValues: ['Rigor Científico', 'Ética Inegociável', 'Segurança do Paciente', 'Acolhimento Humano'],
      pillars: [
        {
          id: 'p1',
          name: 'Precisão e Atenção ao Detalhe',
          description: 'Zero tolerância a erros em laudos e protocolos laboratoriais.',
          weight: 5,
          expectedBehaviors: ['Segue POPs à risca', 'Dupla checagem de resultados críticos', 'Zela pela integridade das amostras'],
          undesiredBehaviors: ['Pula etapas protocolares', 'Trata dados médicos com desleixo']
        },
        {
          id: 'p2',
          name: 'Ética e Privacidade Médica',
          description: 'Sigilo estrito e respeito a todas as normas de dados biológicos e de saúde.',
          weight: 5,
          expectedBehaviors: ['Guarda sigilo absoluto de exames', 'Respeita consentimento do paciente'],
          undesiredBehaviors: ['Compartilha informações médicas em canais abertos']
        }
      ],
      culturalFitThreshold: 85,
      updatedAt: '2026-03-02T14:00:00Z'
    },
    users: [
      {
        id: 'bio-usr-1',
        tenantId: 'tenant-biosaude',
        name: 'Dra. Helena Drummond',
        email: 'helena.drummond@biosaude.med.br',
        profileId: 'admin',
        jobTitle: 'Diretora Médica & RH Científico',
        active: true,
        lastLoginAt: '2026-03-18T16:00:00Z',
      }
    ],
    departments: [
      { id: 'dep-bio-1', name: 'Genética & Biologia Molecular', code: 'GENETICA', managerId: 'bio-usr-1', costCenter: 'CC-8010', headcountTarget: 30, currentHeadcount: 27 },
      { id: 'dep-bio-2', name: 'Garantia da Qualidade & Compliance', code: 'QUALIDADE', managerId: 'bio-usr-1', costCenter: 'CC-8020', headcountTarget: 15, currentHeadcount: 14 }
    ],
    positions: [
      {
        id: 'pos-bio-1',
        title: 'Biomédico Geneticista Sênior (NGS)',
        departmentId: 'dep-bio-1',
        level: 'Sênior',
        description: 'Processamento de sequenciamento de nova geração (NGS), interpretação de variantes genéticas e validação de laudos moleculares.',
        technicalRequirements: ['Sequenciamento NGS Illumina', 'Bioinformática aplicada a variantes', 'Boas Práticas Laboratoriais (BPL/PALC)', 'CRBM ativo'],
        behavioralCompetencies: ['Concentração impecável', 'Comunicação precisa', 'Rigor analítico'],
        minSalary: 11000,
        maxSalary: 14500,
        currency: 'BRL',
        careerTrack: 'Y_TECNICO',
        status: 'active'
      }
    ],
    openings: [
      {
        id: 'job-bio-301',
        positionId: 'pos-bio-1',
        title: 'Biomédico Geneticista - Especialista NGS',
        departmentId: 'dep-bio-1',
        hiringManagerId: 'bio-usr-1',
        recruiterId: 'bio-usr-1',
        status: 'open' as const,
        openingsCount: 2,
        filledCount: 0,
        workModel: 'Presencial' as const,
        location: 'São Paulo, SP (Complexo Laboratorial)',
        slaDays: 45,
        openedAt: '2026-03-04T09:00:00Z',
        targetFillDate: '2026-04-20T23:59:59Z',
        salaryOfferedMin: 11500,
        salaryOfferedMax: 14000,
        stages: [
          { id: 'stg-1', name: 'Triagem Documental e Registro no CRBM', type: 'screening' as const, order: 1, description: 'Verificação de licença profissional e experiência em NGS' },
          { id: 'stg-2', name: 'Fit Cultural (Rigor & Ética BioSaúde)', type: 'cultural_fit' as const, order: 2, description: 'Avaliação assistida por IA de conformidade e tolerância a erros' },
          { id: 'stg-3', name: 'Prova Prática de Interpretação de Variantes', type: 'technical_assessment' as const, order: 3, description: 'Laudo teste às cegas de caso clínico simulado' },
          { id: 'stg-4', name: 'Entrevista Médica com Diretoria', type: 'manager_interview' as const, order: 4, description: 'Banca avaliadora' },
          { id: 'stg-5', name: 'Oferta e Exames Admissionais', type: 'proposal' as const, order: 5, description: 'Contratação' }
        ]
      }
    ],
    candidates: [
      {
        id: 'cand-bio-01',
        name: 'Dra. Fernanda Lins Albuquerque',
        email: 'fernanda.lins@biogen.com.br',
        phone: '+55 11 97654-3210',
        location: 'São Paulo, SP',
        currentRole: 'Biomédica Especialista no Lab Diagnóstica',
        yearsOfExperience: 7,
        education: 'Doutorado em Genética Humana - USP',
        resumeSummary: '7 anos dedicados a diagnóstico molecular avançado, com mais de 3.000 laudos NGS emitidos sem qualquer não-conformidade. Domínio de painéis oncológicos hereditários e doenças raras. Membro de comitês de ética e controle de qualidade PALC.',
        skills: ['NGS Illumina', 'Análise de Variantes ACMG', 'BPL', 'Bioinformática Básica', 'Controle de Qualidade'],
        languages: ['Português (Nativo)', 'Inglês (Científico Fluente)'],
        registeredAt: '2026-03-11T16:00:00Z',
        tags: ['Doutora USP', 'Laudos Impecáveis', 'CRBM Ativo']
      }
    ],
    applications: [
      {
        id: 'app-bio-1',
        jobOpeningId: 'job-bio-301',
        candidateId: 'cand-bio-01',
        currentStageId: 'stg-2',
        status: 'in_review' as const,
        appliedAt: '2026-03-11T16:30:00Z',
        notes: ['Currículo excepcional para o núcleo de oncologia diagnóstica.']
      }
    ],
    aiEvaluations: [],
    interviews: [],
    offers: [],
    onboardings: [],
    developmentRecords: [],
    climateSurveys: [],
    turnoverAlerts: [],
    indicators: {
      tenantId: 'tenant-biosaude',
      period: '2026-Q1',
      timeToHireDays: 32,
      costPerHire: 5200,
      earlyTurnover90DaysRate: 1.2,
      averageCulturalFit: 91.0,
      openPositionsCount: 4,
      totalHiresThisQuarter: 6,
      retentionRate12Months: 97.4,
      candidateNPS: 94,
      recruitmentFunnel: {
        applied: 78,
        screened: 40,
        interviewed: 18,
        offered: 7,
        hired: 6
      }
    }
  };
}
