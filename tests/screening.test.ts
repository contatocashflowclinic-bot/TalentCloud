import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  culturalFromPillars,
  computeOverall,
  requirementCounts,
  requirementScore,
  deriveFlags,
  effectiveStatus,
  nextStage,
  matchesFilter,
  rankRows,
  screeningAccess,
  SCREENING_PERMISSIONS,
  MIN_CULTURAL_COVERAGE,
  ANALYSIS_LEASE_MS,
  type PillarInput
} from '../src/screening.js';
import type { PipelineStage, RequirementCheck, ScreeningRow, ScreeningSummary } from '../src/types.js';

describe('culturalFromPillars: aderência cultural ponderada por peso e evidência', () => {
  test('sem pilares, não há cultura para calcular', () => {
    assert.deepEqual(culturalFromPillars([]), { score: null, coverage: 0 });
  });

  test('todos os pilares sem nenhuma evidência: "não verificável", nunca nota baixa', () => {
    const pillars: PillarInput[] = [
      { weight: 5, score: 90, confidence: 'none' },
      { weight: 3, score: 10, confidence: 'none' }
    ];
    assert.deepEqual(culturalFromPillars(pillars), { score: null, coverage: 0 });
  });

  test('só o pilar com evidência entra na conta; o peso do pilar sem evidência não conta na cobertura', () => {
    const pillars: PillarInput[] = [
      { weight: 5, score: 80, confidence: 'high' },
      { weight: 5, score: 20, confidence: 'none' }
    ];
    const { score, coverage } = culturalFromPillars(pillars);
    assert.equal(score, 80);
    assert.equal(coverage, 0.5);
  });

  test('evidência parcial pesa menos que evidência forte no cálculo da cobertura', () => {
    const pillars: PillarInput[] = [
      { weight: 5, score: 100, confidence: 'high' },
      { weight: 5, score: 100, confidence: 'low' }
    ];
    const { score, coverage } = culturalFromPillars(pillars);
    assert.equal(score, 100);
    assert.equal(coverage, 0.68);
  });

  test('pilar de peso maior pesa mais na média (mesmo nível de evidência)', () => {
    const pillars: PillarInput[] = [
      { weight: 5, score: 100, confidence: 'high' },
      { weight: 1, score: 0, confidence: 'high' }
    ];
    const { score } = culturalFromPillars(pillars);
    assert.ok(score !== null && score > 80, `esperava a média puxada para cima pelo peso maior, veio ${score}`);
  });
});

describe('computeOverall: nota geral = técnica + cultural, cultural pesada pela cobertura', () => {
  test('sem cultura verificável (null), a nota geral é a técnica pura', () => {
    assert.equal(computeOverall(72, null, 0), 72);
  });

  test('cobertura zero, mesmo com nota cultural presente, vale só a técnica', () => {
    assert.equal(computeOverall(72, 90, 0), 72);
  });

  test('cobertura total (1): pesa 60% técnica e 40% cultural', () => {
    assert.equal(computeOverall(80, 40, 1), 64);
  });

  test('cobertura parcial reduz o peso da cultural na fórmula (mais perto da técnica)', () => {
    const full = computeOverall(80, 20, 1);
    const half = computeOverall(80, 20, 0.5);
    assert.ok(half > full, `com metade da cobertura, a nota deveria ficar mais perto da técnica (${half} <= ${full})`);
  });

  test('a nota fica sempre entre 0 e 100', () => {
    assert.equal(computeOverall(150, 200, 1), 100);
    assert.equal(computeOverall(-10, -20, 1), 0);
  });
});

const req = (status: RequirementCheck['status']): RequirementCheck => ({ id: 'r', requirement: 'x', status, evidence: '' });

describe('requirementCounts e requirementScore', () => {
  test('conta cada status', () => {
    const counts = requirementCounts([req('met'), req('met'), req('partial'), req('not_met'), req('no_evidence')]);
    assert.deepEqual(counts, { total: 5, met: 2, partial: 1, notMet: 1, noEvidence: 1 });
  });

  test('sem requisitos, requirementScore é null (nada para comparar)', () => {
    assert.equal(requirementScore(requirementCounts([])), null);
  });

  test('atendido conta 1, parcial conta 0,5, o resto conta 0', () => {
    const score = requirementScore(requirementCounts([req('met'), req('met'), req('partial'), req('not_met')]));
    assert.equal(score, 63);
  });
});

const summaryOf = (over: Partial<ScreeningSummary>): ScreeningSummary => ({
  overallScore: 70,
  technicalScore: 70,
  culturalScore: 70,
  culturalCoverage: 1,
  requirements: { total: 4, met: 4, partial: 0, notMet: 0, noEvidence: 0 },
  documentQuality: 'good',
  instructionsInDocument: false,
  hiddenText: false,
  criteriaHash: 'h1',
  ...over
});

describe('deriveFlags: selos calculados na leitura, refletindo o DNA e o Cargo de agora', () => {
  const ctx = { culturalFitThreshold: 75, criteriaHash: 'h1' };

  test('sem summary (candidatura sem currículo), nenhum selo', () => {
    assert.deepEqual(deriveFlags(undefined, ctx), []);
  });

  test('cultura com cobertura abaixo do mínimo: "cultural_unverified", nunca "below_cultural_cut"', () => {
    const flags = deriveFlags(summaryOf({ culturalCoverage: MIN_CULTURAL_COVERAGE - 0.01 }), ctx);
    assert.ok(flags.includes('cultural_unverified'));
    assert.ok(!flags.includes('below_cultural_cut'));
  });

  test('cultura verificável e abaixo do corte do DNA: "below_cultural_cut"', () => {
    const flags = deriveFlags(summaryOf({ culturalScore: 60, culturalCoverage: 1 }), ctx);
    assert.deepEqual(flags, ['below_cultural_cut']);
  });

  test('cultura acima do corte, mas nota geral baixa por causa da técnica: "second_look"', () => {
    const flags = deriveFlags(summaryOf({ overallScore: 55, technicalScore: 45, culturalScore: 90, culturalCoverage: 1 }), ctx);
    assert.ok(flags.includes('second_look'));
  });

  test('cultura acima do corte, mas técnica baixa demais (sem base nenhuma): sem "second_look"', () => {
    const flags = deriveFlags(summaryOf({ overallScore: 55, technicalScore: 10, culturalScore: 90, culturalCoverage: 1 }), ctx);
    assert.ok(!flags.includes('second_look'));
  });

  test('requisito não atendido: "missing_requirements"', () => {
    const flags = deriveFlags(summaryOf({ requirements: { total: 4, met: 3, partial: 0, notMet: 1, noEvidence: 0 } }), ctx);
    assert.ok(flags.includes('missing_requirements'));
  });

  test('metade ou mais dos requisitos sem evidência: "incomplete_resume"', () => {
    const flags = deriveFlags(summaryOf({ requirements: { total: 4, met: 2, partial: 0, notMet: 0, noEvidence: 2 } }), ctx);
    assert.ok(flags.includes('incomplete_resume'));
  });

  test('texto suspeito no arquivo (instrução ou texto oculto): "injection_suspected"', () => {
    assert.ok(deriveFlags(summaryOf({ instructionsInDocument: true }), ctx).includes('injection_suspected'));
    assert.ok(deriveFlags(summaryOf({ hiddenText: true }), ctx).includes('injection_suspected'));
  });

  test('nota técnica muito destoante do que os requisitos mostram: "score_inconsistent"', () => {
    const flags = deriveFlags(
      summaryOf({ technicalScore: 90, requirements: { total: 4, met: 0, partial: 0, notMet: 4, noEvidence: 0 } }),
      ctx
    );
    assert.ok(flags.includes('score_inconsistent'));
  });

  test('critérios mudaram desde a leitura: "criteria_changed"', () => {
    const flags = deriveFlags(summaryOf({ criteriaHash: 'h1' }), { culturalFitThreshold: 75, criteriaHash: 'h2' });
    assert.ok(flags.includes('criteria_changed'));
  });

  test('DNA sem corte definido (null): nunca "below_cultural_cut"', () => {
    const flags = deriveFlags(
      summaryOf({ overallScore: 55, technicalScore: 45, culturalScore: 10, culturalCoverage: 1 }),
      { culturalFitThreshold: null, criteriaHash: 'h1' }
    );
    assert.ok(!flags.includes('below_cultural_cut'));
  });
});

describe('effectiveStatus: leitura abandonada volta a "guardado" sem precisar de cron', () => {
  const now = Date.parse('2026-09-22T12:00:00Z');

  test('status que não é "analyzing" não muda', () => {
    assert.equal(effectiveStatus({ status: 'analyzed' }, now), 'analyzed');
  });

  test('"analyzing" recente continua "analyzing"', () => {
    const since = new Date(now - 10_000).toISOString();
    assert.equal(effectiveStatus({ status: 'analyzing', analyzingSince: since }, now), 'analyzing');
  });

  test('"analyzing" além do prazo (a função morreu) volta a "uploaded"', () => {
    const since = new Date(now - ANALYSIS_LEASE_MS - 1).toISOString();
    assert.equal(effectiveStatus({ status: 'analyzing', analyzingSince: since }, now), 'uploaded');
  });

  test('"analyzing" sem data de início (dado corrompido) é tratado como abandonado', () => {
    assert.equal(effectiveStatus({ status: 'analyzing', analyzingSince: null }, now), 'uploaded');
  });
});

describe('nextStage: próxima etapa do funil pela ordem, não pela posição na lista', () => {
  const stages: PipelineStage[] = [
    { id: 'c', name: 'Entrevista', type: 'technical_assessment', order: 3, description: '' },
    { id: 'a', name: 'Triagem', type: 'screening', order: 1, description: '' },
    { id: 'b', name: 'Fit Cultural', type: 'cultural_fit', order: 2, description: '' }
  ];

  test('avança para a etapa de ordem seguinte, mesmo fora de ordem na lista', () => {
    assert.equal(nextStage(stages, 'a')?.id, 'b');
  });

  test('na última etapa, não há próxima', () => {
    assert.equal(nextStage(stages, 'c'), undefined);
  });

  test('etapa desconhecida não avança', () => {
    assert.equal(nextStage(stages, 'zzz'), undefined);
  });
});

const row = (over: Partial<ScreeningRow>): ScreeningRow => ({
  applicationId: 'app-1',
  candidateId: 'cand-1',
  candidateName: 'Fulana',
  currentRole: '',
  yearsOfExperience: 0,
  location: '',
  stageId: 'stg-1',
  applicationStatus: 'in_review',
  appliedAt: '2026-09-01T00:00:00Z',
  flags: [],
  ...over
});

describe('matchesFilter e rankRows: a lista da triagem', () => {
  test('arquivada aparece em "todas" (como no Kanban) e em "archived", mas não nos filtros por nota ou selo', () => {
    const archived = row({
      applicationStatus: 'rejected',
      evaluation: { id: 'e', overallFitScore: 90, technicalFitScore: 90, culturalFitScore: 90, evaluatedAt: '' }
    });
    assert.equal(matchesFilter(archived, 'archived'), true);
    assert.equal(matchesFilter(archived, 'all'), true);
    assert.equal(matchesFilter(archived, 'high'), false);
  });

  test('faixas de nota: alta (>= 80), média (60 a 79) e baixa (< 60)', () => {
    const high = row({ evaluation: { id: 'e', overallFitScore: 85, technicalFitScore: 0, culturalFitScore: 0, evaluatedAt: '' } });
    const medium = row({ evaluation: { id: 'e', overallFitScore: 65, technicalFitScore: 0, culturalFitScore: 0, evaluatedAt: '' } });
    const low = row({ evaluation: { id: 'e', overallFitScore: 40, technicalFitScore: 0, culturalFitScore: 0, evaluatedAt: '' } });
    assert.equal(matchesFilter(high, 'high'), true);
    assert.equal(matchesFilter(medium, 'medium'), true);
    assert.equal(matchesFilter(low, 'low'), true);
    assert.equal(matchesFilter(high, 'medium'), false);
  });

  test('selo "second_look" filtra por flag, não por nota', () => {
    const r = row({ flags: ['second_look'] });
    assert.equal(matchesFilter(r, 'second_look'), true);
  });

  test('rankRows: maior nota geral primeiro; sem avaliação vai para o fim, mais recente antes', () => {
    const a = row({ applicationId: 'a', evaluation: { id: 'e', overallFitScore: 60, technicalFitScore: 0, culturalFitScore: 0, evaluatedAt: '' } });
    const b = row({ applicationId: 'b', evaluation: { id: 'e', overallFitScore: 90, technicalFitScore: 0, culturalFitScore: 0, evaluatedAt: '' } });
    const c = row({ applicationId: 'c', appliedAt: '2026-09-05T00:00:00Z' });
    const d = row({ applicationId: 'd', appliedAt: '2026-09-02T00:00:00Z' });
    const ranked = rankRows([a, b, c, d]).map(r => r.applicationId);
    assert.deepEqual(ranked, ['b', 'a', 'c', 'd']);
  });
});

describe('screeningAccess: as mesmas permissões no servidor e na tela; sem IA, sem acesso', () => {
  test('com todas as permissões e IA ligada, acesso completo', () => {
    const all = [...SCREENING_PERMISSIONS.view, ...SCREENING_PERMISSIONS.upload, ...SCREENING_PERMISSIONS.decide];
    assert.deepEqual(screeningAccess(all, true), { canView: true, canUpload: true, canDecide: true });
  });

  test('organização sem o módulo de IA: sem acesso, mesmo com as permissões', () => {
    const all = [...SCREENING_PERMISSIONS.view, ...SCREENING_PERMISSIONS.upload, ...SCREENING_PERMISSIONS.decide];
    assert.deepEqual(screeningAccess(all, false), { canView: false, canUpload: false, canDecide: false });
  });

  test('Gestor da Vaga (vê e decide, mas não envia): falta a permissão de upload é suficiente para bloquear o envio', () => {
    const hiringManager = ['selection:view', 'candidates:view', 'ai_evaluation:view', 'selection:edit', 'ai_evaluation:edit'];
    const access = screeningAccess(hiringManager, true);
    assert.equal(access.canView, true);
    assert.equal(access.canDecide, true);
    assert.equal(access.canUpload, false);
  });

  test('faltando qualquer uma das permissões de visualização, não vê (são todas exigidas, não "qualquer uma")', () => {
    const almost = ['selection:view', 'candidates:view'];
    assert.equal(screeningAccess(almost, true).canView, false);
  });
});
