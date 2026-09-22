import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildScreeningRequest, hashToSeed, parseResumeAnalysis, type ParseContext } from '../server/resumeAi.js';
import { culturalFromPillars, computeOverall } from '../src/screening.js';
import type { ScreeningCriteriaSnapshot } from '../src/types.js';

const criteria: ScreeningCriteriaSnapshot = {
  jobTitle: 'Engenheira(o) de Software Sênior',
  positionTitle: 'Engenheiro de Software',
  level: 'Sênior',
  requirements: ['TypeScript avançado', 'PostgreSQL', 'Liderança técnica'],
  pillars: [
    { id: 'p-resultado', name: 'Compromisso com o Resultado', weight: 5 },
    { id: 'p-equipe', name: 'Trabalho em Equipe', weight: 4 }
  ],
  culturalFitThreshold: 75
};

const baseCtx = (over: Partial<ParseContext> = {}): ParseContext => ({
  criteria,
  requirementIds: ['R1', 'R2', 'R3'],
  pillarIds: ['p-resultado', 'p-equipe'],
  promptVersion: 'triagem-v1',
  model: 'gemini-3.8-flash',
  criteriaHash: 'hash-abc',
  hiddenTextFromDocx: false,
  truncated: false,
  ...over
});

const validRaw = () =>
  JSON.stringify({
    documentQuality: 'good',
    qualityNote: '',
    instructionsInDocument: false,
    extraction: {
      name: 'Fulana de Tal',
      email: 'fulana@exemplo.com',
      phone: '',
      location: 'São Paulo, SP',
      linkedinUrl: '',
      currentRole: 'Engenheira de Software Pleno',
      yearsOfExperience: 6,
      education: 'Bacharelado em Ciência da Computação',
      skills: ['TypeScript', 'PostgreSQL', 'React'],
      languages: ['Português', 'Inglês'],
      summary: 'Seis anos construindo produtos web.'
    },
    requirements: [
      { id: 'R1', status: 'met', evidence: 'Cinco anos usando TypeScript em produção.' },
      { id: 'R2', status: 'met', evidence: 'PostgreSQL citado em três projetos.' },
      { id: 'R3', status: 'no_evidence', evidence: '' }
    ],
    pillars: [
      { id: 'p-resultado', score: 85, confidence: 'high', analysis: 'Cita metas batidas.', evidence: 'Aumentou conversão em 20%.' },
      { id: 'p-equipe', score: 70, confidence: 'medium', analysis: 'Menciona pares.', evidence: 'Revisou código do time.' }
    ],
    technicalScore: 82,
    strengths: ['Forte em TypeScript', 'Experiência com PostgreSQL'],
    gaps: ['Sem evidência de liderança técnica'],
    interviewQuestions: ['Conte sobre uma decisão técnica difícil que você liderou.'],
    explanation: 'Perfil técnico forte, com boa evidência cultural.'
  });

describe('parseResumeAnalysis: resposta do modelo -> leitura completa', () => {
  test('resposta bem formada produz uma leitura completa, com a nota geral calculada pela mesma fórmula de src/screening.ts', () => {
    const analysis = parseResumeAnalysis(validRaw(), baseCtx());
    assert.equal(analysis.technicalScore, 82);
    assert.equal(analysis.extraction.email, 'fulana@exemplo.com');
    assert.equal(analysis.requirements.length, 3);
    assert.equal(analysis.requirements[2].status, 'no_evidence');
    assert.equal(analysis.pillars.length, 2);

    const expectedCultural = culturalFromPillars([
      { weight: 5, score: 85, confidence: 'high' },
      { weight: 4, score: 70, confidence: 'medium' }
    ]);
    assert.equal(analysis.culturalScore, expectedCultural.score);
    assert.equal(analysis.culturalCoverage, expectedCultural.coverage);
    assert.equal(analysis.overallScore, computeOverall(82, expectedCultural.score, expectedCultural.coverage));
  });

  test('JSON malformado é rejeitado (o arquivo fica "não foi possível ler", nunca uma nota inventada)', () => {
    assert.throws(() => parseResumeAnalysis('{ isso não é json', baseCtx()));
  });

  test('objeto vazio é rejeitado', () => {
    assert.throws(() => parseResumeAnalysis('{}', baseCtx()));
  });

  test('sem a nota técnica (campo obrigatório), a leitura inteira falha', () => {
    const raw = JSON.parse(validRaw());
    delete raw.technicalScore;
    assert.throws(() => parseResumeAnalysis(JSON.stringify(raw), baseCtx()));
  });

  test('requisito que o modelo não respondeu vira "sem evidência", nunca é descartado (a lista sempre tem o tamanho dos critérios)', () => {
    const raw = JSON.parse(validRaw());
    raw.requirements = [{ id: 'R1', status: 'met', evidence: 'ok' }]; // só respondeu 1 de 3
    const analysis = parseResumeAnalysis(JSON.stringify(raw), baseCtx());
    assert.equal(analysis.requirements.length, 3);
    assert.equal(analysis.requirements[0].status, 'met');
    assert.equal(analysis.requirements[1].status, 'no_evidence');
    assert.equal(analysis.requirements[2].status, 'no_evidence');
  });

  test('status de requisito inválido (fora do enum) vira "sem evidência", não quebra a leitura inteira', () => {
    const raw = JSON.parse(validRaw());
    raw.requirements[0].status = 'aprovado'; // valor que o modelo não deveria mandar
    const analysis = parseResumeAnalysis(JSON.stringify(raw), baseCtx());
    assert.equal(analysis.requirements[0].status, 'no_evidence');
  });

  test('pilar sem confiança (ou com confiança inválida) recebe nota neutra 50, nunca uma nota baixa inventada', () => {
    const raw = JSON.parse(validRaw());
    raw.pillars = [{ id: 'p-resultado', score: 10, confidence: 'nenhuma-confianca-valida', analysis: 'x', evidence: 'x' }];
    const analysis = parseResumeAnalysis(JSON.stringify(raw), baseCtx());
    const resultado = analysis.pillars.find(p => p.id === 'p-resultado')!;
    assert.equal(resultado.confidence, 'none');
    assert.equal(resultado.score, 50);
    // o pilar "equipe", que o modelo nem respondeu, também está presente (nunca falta um pilar do DNA)
    assert.ok(analysis.pillars.some(p => p.id === 'p-equipe'));
    assert.equal(analysis.pillars.length, 2);
  });

  test('anos de experiência inválidos (negativo) não são gravados; anos válidos são preservados', () => {
    const raw = JSON.parse(validRaw());
    raw.extraction.yearsOfExperience = -1;
    const analysis = parseResumeAnalysis(JSON.stringify(raw), baseCtx());
    assert.equal(analysis.extraction.yearsOfExperience, undefined);
  });

  test('campo de texto vazio na extração vira "não informado" (undefined), nunca string vazia inventada', () => {
    const analysis = parseResumeAnalysis(validRaw(), baseCtx());
    assert.equal(analysis.extraction.phone, undefined);
    assert.equal(analysis.extraction.linkedinUrl, undefined);
  });

  test('instructionsInDocument só é true se o modelo mandar exatamente true (nunca "truthy" por acidente)', () => {
    const raw = JSON.parse(validRaw());
    raw.instructionsInDocument = 'sim';
    const analysis = parseResumeAnalysis(JSON.stringify(raw), baseCtx());
    assert.equal(analysis.instructionsInDocument, false);
  });

  test('hiddenText e truncated vêm do contexto (do leitor do Word), não da resposta do modelo', () => {
    const analysis = parseResumeAnalysis(validRaw(), baseCtx({ hiddenTextFromDocx: true, truncated: true }));
    assert.equal(analysis.hiddenText, true);
    assert.equal(analysis.truncated, true);
  });

  test('qualidade de documento fora do enum vira "partial" em vez de quebrar a leitura', () => {
    const raw = JSON.parse(validRaw());
    raw.documentQuality = 'excelente';
    const analysis = parseResumeAnalysis(JSON.stringify(raw), baseCtx());
    assert.equal(analysis.documentQuality, 'partial');
  });
});

describe('buildScreeningRequest: ids estáveis e o currículo nunca embutido no texto de critérios', () => {
  test('gera um id R1..Rn por requisito, na mesma ordem dos critérios', () => {
    const { requirementIds } = buildScreeningRequest(criteria, 'pdf', 'nonce1');
    assert.deepEqual(requirementIds, ['R1', 'R2', 'R3']);
  });

  test('os ids dos pilares são os do DNA (não R1..Rn)', () => {
    const { pillarIds } = buildScreeningRequest(criteria, 'pdf', 'nonce1');
    assert.deepEqual(pillarIds, ['p-resultado', 'p-equipe']);
  });

  test('o texto do pedido cita a vaga, o cargo, cada requisito e cada pilar', () => {
    const { promptText } = buildScreeningRequest(criteria, 'pdf', 'nonce1');
    assert.ok(promptText.includes(criteria.jobTitle));
    assert.ok(promptText.includes('TypeScript avançado'));
    assert.ok(promptText.includes('Trabalho em Equipe'));
  });

  test('para PDF, o texto do pedido não contém o currículo em si (ele vai em anexo, à parte)', () => {
    const { promptText } = buildScreeningRequest(criteria, 'pdf', 'nonce1');
    assert.ok(!promptText.includes('<<<CURRICULO_'));
  });

  test('para Word, o texto do pedido descreve os delimitadores (o currículo em si é adicionado depois, por analyzeResume)', () => {
    const { promptText } = buildScreeningRequest(criteria, 'docx', 'abc123');
    assert.ok(promptText.includes('CURRICULO_abc123_INICIO'));
  });
});

describe('hashToSeed: semente estável para o modelo, sem depender de rede', () => {
  test('a mesma entrada sempre dá a mesma semente', () => {
    assert.equal(hashToSeed('conteudo-do-arquivo-123'), hashToSeed('conteudo-do-arquivo-123'));
  });

  test('entradas diferentes tendem a dar sementes diferentes', () => {
    assert.notEqual(hashToSeed('arquivo-a'), hashToSeed('arquivo-b'));
  });

  test('a semente é sempre um inteiro não negativo (cabe no schema INTEGER)', () => {
    const seed = hashToSeed('qualquer-coisa');
    assert.ok(Number.isInteger(seed) && seed >= 0);
  });
});
