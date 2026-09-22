import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  criteriaOf,
  criteriaHashOf,
  candidateFromAnalysis,
  namesCompatible,
  planDecision,
  screeningCriteriaInfo,
  buildScreeningBoard,
  RESUME_IMPORT_TAG,
  type BoardSource
} from '../server/tenant/screening.js';
import type { AIAssistedEvaluation, Candidate, JobPosition, OrganizationalDNA, PipelineStage, ResumeScreening, SelectionApplication } from '../src/types.js';

const position: Pick<JobPosition, 'title' | 'level' | 'technicalRequirements' | 'behavioralCompetencies'> = {
  title: 'Engenheiro de Software',
  level: 'Sênior',
  technicalRequirements: ['TypeScript', 'PostgreSQL'],
  behavioralCompetencies: ['Comunicação clara']
};

const dna: OrganizationalDNA = {
  tenantId: 't1',
  mission: 'x',
  vision: 'x',
  archetype: 'Inovador & Ágil',
  cultureSummary: 'x',
  coreValues: ['Transparência'],
  pillars: [
    { id: 'p1', name: 'Compromisso com o Resultado', description: '', weight: 5, expectedBehaviors: [], undesiredBehaviors: [] },
    { id: 'p2', name: 'Trabalho em Equipe', description: '', weight: 4, expectedBehaviors: [], undesiredBehaviors: [] }
  ],
  culturalFitThreshold: 75,
  updatedAt: ''
};

describe('criteriaOf e criteriaHashOf: a régua vem sempre do Cargo cadastrado e do DNA', () => {
  test('os requisitos são os técnicos seguidos dos comportamentais do Cargo, na ordem', () => {
    const criteria = criteriaOf({ title: 'Vaga X' }, position, dna);
    assert.deepEqual(criteria.requirements, ['TypeScript', 'PostgreSQL', 'Comunicação clara']);
    assert.equal(criteria.positionTitle, 'Engenheiro de Software');
    assert.equal(criteria.level, 'Sênior');
    assert.equal(criteria.culturalFitThreshold, 75);
    assert.deepEqual(criteria.pillars, [
      { id: 'p1', name: 'Compromisso com o Resultado', weight: 5 },
      { id: 'p2', name: 'Trabalho em Equipe', weight: 4 }
    ]);
  });

  test('o mesmo Cargo e DNA sempre dão o mesmo hash', () => {
    const a = criteriaHashOf(criteriaOf({ title: 'Vaga X' }, position, dna));
    const b = criteriaHashOf(criteriaOf({ title: 'Outra Vaga, mesmo Cargo' }, position, dna));
    assert.equal(a, b, 'o título da vaga é só um rótulo: não deveria mudar o hash da régua');
  });

  test('mudar um requisito do Cargo muda o hash (a tela deve avisar "critérios mudaram")', () => {
    const before = criteriaHashOf(criteriaOf({ title: 'Vaga X' }, position, dna));
    const edited = { ...position, technicalRequirements: [...position.technicalRequirements, 'Docker'] };
    const after = criteriaHashOf(criteriaOf({ title: 'Vaga X' }, edited, dna));
    assert.notEqual(before, after);
  });

  test('mudar o peso de um pilar do DNA muda o hash', () => {
    const before = criteriaHashOf(criteriaOf({ title: 'Vaga X' }, position, dna));
    const editedDna: OrganizationalDNA = { ...dna, pillars: [{ ...dna.pillars[0], weight: 1 }, dna.pillars[1]] };
    const after = criteriaHashOf(criteriaOf({ title: 'Vaga X' }, position, editedDna));
    assert.notEqual(before, after);
  });

  test('mudar o corte de aderência cultural muda o hash', () => {
    const before = criteriaHashOf(criteriaOf({ title: 'Vaga X' }, position, dna));
    const after = criteriaHashOf(criteriaOf({ title: 'Vaga X' }, position, { ...dna, culturalFitThreshold: 90 }));
    assert.notEqual(before, after);
  });
});

describe('candidateFromAnalysis: candidato a partir da leitura, sem nenhum dado inventado', () => {
  test('campos não extraídos ficam em branco (nunca telefone, cargo ou resumo de mentirinha)', () => {
    const candidate = candidateFromAnalysis({
      name: 'Fulana de Tal',
      email: 'fulana@exemplo.com',
      phone: undefined,
      location: undefined,
      linkedinUrl: undefined,
      currentRole: undefined,
      yearsOfExperience: undefined,
      education: undefined,
      summary: undefined,
      skills: [],
      languages: []
    });
    assert.equal(candidate.phone, '');
    assert.equal(candidate.currentRole, '');
    assert.equal(candidate.education, '');
    assert.equal(candidate.resumeSummary, '');
    assert.equal(candidate.yearsOfExperience, 0);
    assert.equal(candidate.dataOrigin, 'rh');
    assert.deepEqual(candidate.tags, [RESUME_IMPORT_TAG]);
  });

  test('sem e-mail extraído, a função recusa (a candidatura deveria ter ficado em "precisa de dados" antes de chegar aqui)', () => {
    assert.throws(() =>
      candidateFromAnalysis({
        name: 'Fulana', email: undefined, phone: undefined, location: undefined, linkedinUrl: undefined,
        currentRole: undefined, yearsOfExperience: undefined, education: undefined, summary: undefined, skills: [], languages: []
      })
    );
  });
});

describe('namesCompatible: mesmo e-mail com nome muito diferente pede confirmação humana', () => {
  test('nomes iguais (ainda que com acento/maiúsculas diferentes) são compatíveis', () => {
    assert.equal(namesCompatible('MARIA DA SILVA', 'Maria da Silva'), true);
  });

  test('compartilham ao menos um nome ou sobrenome: compatível', () => {
    assert.equal(namesCompatible('Maria Oliveira Silva', 'Maria Silva'), true);
  });

  test('nomes sem nenhuma palavra em comum: incompatível (mesmo e-mail, pessoa provavelmente diferente)', () => {
    assert.equal(namesCompatible('João Pereira', 'Maria da Silva'), false);
  });

  test('sem nome extraído do currículo, não há o que comparar: compatível por padrão', () => {
    assert.equal(namesCompatible(undefined, 'Maria da Silva'), true);
  });
});

const stages: PipelineStage[] = [
  { id: 'stg-1', name: 'Triagem Inicial', type: 'screening', order: 1, description: '' },
  { id: 'stg-2', name: 'Fit Cultural com IA', type: 'cultural_fit', order: 2, description: '' },
  { id: 'stg-3', name: 'Proposta', type: 'proposal', order: 3, description: '' }
];

describe('planDecision: a IA nunca decide, só o RH — e nunca sobre uma candidatura que já mudou', () => {
  test('avançar move para a próxima etapa e não altera o status (mesmo padrão do Kanban hoje)', () => {
    const plan = planDecision({ action: 'advance', fromStageId: 'stg-1', currentStageId: 'stg-1', stages });
    assert.equal(plan.stageId, 'stg-2');
    assert.equal(plan.status, undefined);
  });

  test('não é possível avançar quem já está na última etapa', () => {
    assert.throws(() => planDecision({ action: 'advance', fromStageId: 'stg-3', currentStageId: 'stg-3', stages }));
  });

  test('manter em espera muda o status, sem mexer na etapa', () => {
    const plan = planDecision({ action: 'hold', fromStageId: 'stg-1', currentStageId: 'stg-1', stages });
    assert.equal(plan.status, 'hold');
    assert.equal(plan.stageId, undefined);
  });

  test('arquivar exige um motivo', () => {
    assert.throws(() => planDecision({ action: 'archive', fromStageId: 'stg-1', currentStageId: 'stg-1', stages, reason: '   ' }));
  });

  test('arquivar com motivo registra o status "rejected" e o motivo na nota', () => {
    const plan = planDecision({ action: 'archive', fromStageId: 'stg-1', currentStageId: 'stg-1', stages, reason: 'Perfil fora do requisito técnico' });
    assert.equal(plan.status, 'rejected');
    assert.ok(plan.note.includes('Perfil fora do requisito técnico'));
  });

  test('candidatura que já mudou de etapa (outra pessoa agiu antes) é recusada, evitando decisão em cima de dado velho', () => {
    assert.throws(() => planDecision({ action: 'advance', fromStageId: 'stg-1', currentStageId: 'stg-2', stages }));
  });
});

describe('screeningCriteriaInfo: por que a triagem não pode rodar, ou vai ficar menos precisa', () => {
  test('sem DNA, bloqueia', () => {
    const info = screeningCriteriaInfo(position, undefined, 'h1');
    assert.ok(info.blockers.some(b => b.includes('DNA')));
  });

  test('DNA sem pilares, bloqueia', () => {
    const info = screeningCriteriaInfo(position, { ...dna, pillars: [] }, 'h1');
    assert.ok(info.blockers.some(b => b.includes('pilares')));
  });

  test('sem Cargo vinculado, bloqueia', () => {
    const info = screeningCriteriaInfo(undefined, dna, 'h1');
    assert.ok(info.blockers.some(b => b.includes('Cargo')));
  });

  test('Cargo sem requisitos, não bloqueia mas avisa', () => {
    const info = screeningCriteriaInfo({ ...position, technicalRequirements: [], behavioralCompetencies: [] }, dna, 'h1');
    assert.equal(info.blockers.length, 0);
    assert.ok(info.warnings.length > 0);
  });

  test('tudo cadastrado: sem bloqueio nem aviso', () => {
    const info = screeningCriteriaInfo(position, dna, 'h1');
    assert.equal(info.blockers.length, 0);
    assert.equal(info.warnings.length, 0);
    assert.equal(info.requirementCount, 3);
    assert.equal(info.pillarCount, 2);
  });
});

describe('buildScreeningBoard: candidaturas, candidatos, avaliações e arquivos viram uma lista ranqueada', () => {
  const job = { id: 'job-1', title: 'Vaga X', status: 'open', stages };
  const criteria = screeningCriteriaInfo(position, dna, 'hash-atual');

  const candidate = (id: string, name: string): Candidate => ({
    id, name, email: `${id}@exemplo.com`, phone: '', location: '', currentRole: 'Dev', yearsOfExperience: 3,
    education: '', resumeSummary: '', skills: [], languages: [], registeredAt: '', tags: [], dataOrigin: 'rh', archived: false
  });
  const application = (id: string, candidateId: string, over: Partial<SelectionApplication> = {}): SelectionApplication => ({
    id, jobOpeningId: 'job-1', candidateId, currentStageId: 'stg-1', status: 'in_review', appliedAt: '2026-09-01T00:00:00Z', notes: [], ...over
  });
  const evaluation = (candidateId: string, over: Partial<AIAssistedEvaluation> = {}): AIAssistedEvaluation => ({
    id: `ev-${candidateId}`, candidateId, jobOpeningId: 'job-1', evaluatedAt: '2026-09-02T00:00:00Z',
    overallFitScore: 80, technicalFitScore: 80, culturalFitScore: 80, detailedExplanation: '', keyStrengths: [],
    potentialGaps: [], suggestedInterviewQuestions: [], pillarScores: [], source: 'gemini', ...over
  });
  const screening = (id: string, applicationId: string | undefined, over: Partial<ResumeScreening> = {}): ResumeScreening => ({
    id, jobOpeningId: 'job-1', applicationId, fileName: 'curriculo.pdf', mime: 'application/pdf', sizeBytes: 1000,
    contentHash: 'a'.repeat(64), storagePath: 'x', status: 'analyzed', attempts: 1, inputTokens: 0, outputTokens: 0,
    uploadedById: 'u1', uploadedByName: 'RH', uploadedAt: '2026-09-01T00:00:00Z', ...over
  });

  test('candidatura sem currículo recebe a flag "no_resume"', () => {
    const src: BoardSource = {
      job, criteria, applications: [application('app-1', 'c1')], candidates: [candidate('c1', 'Fulana')], evaluations: [], screenings: []
    };
    const board = buildScreeningBoard(src);
    assert.equal(board.rows.length, 1);
    assert.ok(board.rows[0].flags.includes('no_resume'));
    assert.equal(board.rows[0].file, undefined);
  });

  test('avaliação heurística (estimativa local) nunca entra no ranking', () => {
    const src: BoardSource = {
      job, criteria, applications: [application('app-1', 'c1')], candidates: [candidate('c1', 'Fulana')],
      evaluations: [evaluation('c1', { source: 'heuristic' })], screenings: []
    };
    const board = buildScreeningBoard(src);
    assert.equal(board.rows[0].evaluation, undefined);
  });

  test('avaliação de outra vaga não aparece', () => {
    const src: BoardSource = {
      job, criteria, applications: [application('app-1', 'c1')], candidates: [candidate('c1', 'Fulana')],
      evaluations: [evaluation('c1', { jobOpeningId: 'outra-vaga' })], screenings: []
    };
    const board = buildScreeningBoard(src);
    assert.equal(board.rows[0].evaluation, undefined);
  });

  test('a mais recente é a primeira da lista de avaliações (mesma ordem que o repositório já devolve, seq desc)', () => {
    const src: BoardSource = {
      job, criteria, applications: [application('app-1', 'c1')], candidates: [candidate('c1', 'Fulana')],
      evaluations: [evaluation('c1', { id: 'ev-nova', overallFitScore: 90 }), evaluation('c1', { id: 'ev-velha', overallFitScore: 40 })],
      screenings: []
    };
    const board = buildScreeningBoard(src);
    assert.equal(board.rows[0].evaluation?.id, 'ev-nova');
  });

  test('arquivo sem candidatura (ainda não virou candidato) vai para "pending", não para "rows"', () => {
    const src: BoardSource = {
      job, criteria, applications: [], candidates: [], evaluations: [],
      screenings: [screening('s1', undefined, { status: 'analyzing', analyzingSince: new Date().toISOString() })]
    };
    const board = buildScreeningBoard(src);
    assert.equal(board.rows.length, 0);
    assert.equal(board.pending.length, 1);
    assert.equal(board.pending[0].status, 'analyzing');
  });

  test('lista ranqueada pela nota geral (reaproveita rankRows de src/screening.ts)', () => {
    const src: BoardSource = {
      job, criteria,
      applications: [application('app-1', 'c1'), application('app-2', 'c2')],
      candidates: [candidate('c1', 'Baixa Nota'), candidate('c2', 'Alta Nota')],
      evaluations: [evaluation('c1', { overallFitScore: 40 }), evaluation('c2', { overallFitScore: 95 })],
      screenings: [screening('s1', 'app-1'), screening('s2', 'app-2')]
    };
    const board = buildScreeningBoard(src);
    assert.equal(board.rows[0].candidateName, 'Alta Nota');
  });

  test('vaga preenchida ou cancelada fica marcada como fechada', () => {
    const src: BoardSource = { job: { ...job, status: 'filled' }, criteria, applications: [], candidates: [], evaluations: [], screenings: [] };
    assert.equal(buildScreeningBoard(src).jobClosed, true);
  });

  test('duas leituras da mesma candidatura (uma reanálise, ou duas leituras que caíram no mesmo candidato): a linha usa o arquivo mais novo, nunca o mais antigo', () => {
    // s1 é mais antiga e "ruim" (seq menor, listada por último quando a busca vem seq desc — como o repositório devolve);
    // s2 é mais nova e "boa". Se o código pegasse a mais antiga por engano, os selos e o resumo mostrados estariam errados.
    const old = screening('s1-antiga', 'app-1', {
      summary: { overallScore: 40, technicalScore: 40, culturalScore: null, culturalCoverage: 0, requirements: { total: 3, met: 0, partial: 0, notMet: 0, noEvidence: 3 }, documentQuality: 'partial', instructionsInDocument: false, hiddenText: false, criteriaHash: 'hash-atual' }
    });
    const fresh = screening('s2-nova', 'app-1', {
      summary: { overallScore: 90, technicalScore: 90, culturalScore: 90, culturalCoverage: 1, requirements: { total: 3, met: 3, partial: 0, notMet: 0, noEvidence: 0 }, documentQuality: 'good', instructionsInDocument: false, hiddenText: false, criteriaHash: 'hash-atual' }
    });
    // src.screenings chega ordenada seq desc (mais nova primeiro), como o repositório devolve.
    const src: BoardSource = {
      job, criteria: { ...criteria, criteriaHash: 'hash-atual' },
      applications: [application('app-1', 'c1')], candidates: [candidate('c1', 'Fulana')], evaluations: [],
      screenings: [fresh, old]
    };
    const board = buildScreeningBoard(src);
    assert.equal(board.rows[0].file?.id, 's2-nova');
    assert.equal(board.rows[0].file?.summary?.overallScore, 90);
    assert.ok(!board.rows[0].flags.includes('incomplete_resume'), `selos deveriam refletir a leitura nova: ${board.rows[0].flags}`);
  });
});
