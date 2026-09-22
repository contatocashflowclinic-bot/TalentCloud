import { GoogleGenAI, Type } from '@google/genai';
import {
  AIAssistedEvaluation,
  Candidate,
  JobOpening,
  JobPosition,
  OrganizationalDNA
} from '../src/types.js';
import type { AiSkipReason } from './aiCost.js';
import { isProduction } from './runtime.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

/** Model in use: the one chosen in the Conta Mãe panel, else GEMINI_MODEL, else the default. */
export const resolveModel = (panelModel?: string): string => panelModel || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

export const isGeminiConfigured = (): boolean => Boolean(process.env.GEMINI_API_KEY);

/** What one evaluation request consumed; feeds the credit control panel. Text volume comes from the provider's own count. */
export interface AiCallUsage {
  /** ai = the model answered; failed = it was called and failed; estimate = it was not called (paused, limit, no key). */
  outcome: 'ai' | 'failed' | 'estimate';
  reason?: AiSkipReason | 'not_configured' | 'error';
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  /** Plain-language reason the local estimate was used instead of the AI (only when it was). */
  reasonText?: string;
}

// Shown to the organization's user inside the evaluation text when the local estimate replaces the AI.
const SKIP_TEXT: Record<AiSkipReason, string> = {
  paused: 'a IA está pausada pela administração da plataforma',
  limit_reached: 'o limite mensal de avaliações com IA desta organização foi atingido',
  budget_reached: 'o orçamento mensal de IA da plataforma foi atingido'
};

// The provider sometimes answers "high demand" for a while; the request is retried before giving up, but always inside a time budget:
// the whole evaluation must finish well before the 60 s limit of the serverless function.
const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1200, 3500];
const AI_TOTAL_BUDGET_MS = 42_000;
const AI_ATTEMPT_TIMEOUT_MS = 20_000;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const isTimeout = (err: unknown) => ['AbortError', 'TimeoutError'].includes((err as { name?: string } | undefined)?.name ?? '');

function isTransient(err: unknown): boolean {
  const e = err as { status?: number; message?: string } | undefined;
  if (typeof e?.status === 'number') return TRANSIENT_STATUS.has(e.status);
  return isTimeout(err) || err instanceof TypeError || /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(e?.message ?? '');
}

/**
 * Runs `fn`, retrying only on temporary provider/network errors (never on bad key, wrong model or invalid request).
 * Each attempt gets its own time limit (`fn` receives it) and no new attempt starts when the total budget is nearly spent.
 */
export async function withTransientRetry<T>(
  fn: (attemptTimeoutMs: number) => Promise<T>,
  delaysMs: readonly number[] = RETRY_DELAYS_MS,
  budgetMs = AI_TOTAL_BUDGET_MS,
  attemptTimeoutMs = AI_ATTEMPT_TIMEOUT_MS
): Promise<T> {
  const startedAt = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(Math.max(1000, Math.min(attemptTimeoutMs, budgetMs - (Date.now() - startedAt))));
    } catch (err) {
      const nextDelay = delaysMs[attempt];
      const left = budgetMs - (Date.now() - startedAt);
      // a further attempt only makes sense if the wait plus a reasonable answer time still fit in the budget
      if (!isTransient(err) || nextDelay === undefined || left < nextDelay + Math.min(attemptTimeoutMs, 6000)) throw err;
      console.warn(`[AI] Google indisponível no momento (${(err as { status?: number }).status ?? 'rede'}); nova tentativa ${attempt + 1} em ${delaysMs[attempt]} ms.`);
      await sleep(delaysMs[attempt]);
    }
  }
}

/** Why the call failed, in words the organization's user can act on. Never carries raw provider details. */
export function describeFailure(err: unknown): string {
  const status = (err as { status?: number } | undefined)?.status;
  if (typeof status === 'number' && TRANSIENT_STATUS.has(status)) {
    return 'o serviço de IA do Google está com alta demanda neste momento; tente "Re-analisar com IA" em alguns instantes';
  }
  if (isTimeout(err)) return 'o serviço de IA do Google demorou demais para responder; tente "Re-analisar com IA" em alguns instantes';
  if (status === 401 || status === 403) return 'o Google recusou a chave de acesso da IA; avise a administração da plataforma';
  if (status === 404) return 'o modelo de IA configurado não foi encontrado; avise a administração da plataforma';
  return 'a chamada ao Gemini falhou ou devolveu uma resposta inválida (detalhes nos registros do servidor)';
}

let geminiClient: GoogleGenAI | null = null;

/**
 * Shared client (also used by resumeAi.ts). `GEMINI_BASE_URL` only applies outside produção: aponta o SDK para um
 * Gemini falso (scripts/fakeGemini.ts) nos testes, sem risco de um valor esquecido desviar tráfego real em produção.
 */
export function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    const baseUrl = !isProduction() ? process.env.GEMINI_BASE_URL : undefined;
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
        ...(baseUrl ? { baseUrl } : {})
      }
    });
  }
  return geminiClient;
}

/** A score must come from the model as a number; a missing/invalid one is a failed answer, never a made-up default. Reused by resumeAi.ts. */
export function toScore(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Resposta do modelo sem nota válida (${label})`);
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Reused by resumeAi.ts. */
export function toStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`Resposta do modelo sem lista válida (${label})`);
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

function toPillarScores(value: unknown): AIAssistedEvaluation['pillarScores'] {
  if (!Array.isArray(value)) throw new Error('Resposta do modelo sem notas por pilar (pillarScores)');
  return value.map((p, i) => {
    if (!p || typeof p.pillarName !== 'string' || typeof p.analysis !== 'string') {
      throw new Error(`Resposta do modelo com pilar inválido (pillarScores[${i}])`);
    }
    return { pillarName: p.pillarName, score: toScore(p.score, `pillarScores[${i}]`), analysis: p.analysis };
  });
}

/** Reused by resumeAi.ts (compara nome extraído do currículo com o de um candidato já cadastrado). */
export const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Campo em branco vira "Não informado": a IA não pode tratar vazio como dado nem ler um valor inventado. */
const informed = (value: string | null | undefined): string => (value && value.trim() ? value.trim() : 'Não informado');

/**
 * Keeps only the organization's OWN pillars, in the DNA's order and with the DNA's official names (the model sometimes adds
 * pillars that are not in the DNA). If none of the names match, what the model answered is kept rather than showing nothing.
 */
export function alignPillars(
  scores: AIAssistedEvaluation['pillarScores'],
  dnaPillars: ReadonlyArray<{ name: string }>
): AIAssistedEvaluation['pillarScores'] {
  const byName = new Map(scores.map(s => [normName(s.pillarName), s]));
  const matched = dnaPillars.flatMap(p => {
    const s = byName.get(normName(p.name));
    return s ? [{ ...s, pillarName: p.name }] : [];
  });
  return matched.length ? matched : scores;
}

export async function evaluateCandidateWithAI(params: {
  candidate: Candidate;
  job: JobOpening;
  position?: JobPosition;
  dna: OrganizationalDNA;
  /** Model to call (see resolveModel). */
  model: string;
  /** When set, the model is NOT called and the labeled local estimate is used (AI paused / limit reached). */
  skip?: AiSkipReason;
}): Promise<{ evaluation: Omit<AIAssistedEvaluation, 'id' | 'evaluatedAt'>; usage: AiCallUsage }> {
  const { candidate, job, position, dna, model, skip } = params;
  const client = getGeminiClient();
  const startedAt = Date.now();
  const usage: AiCallUsage = { outcome: 'estimate', reason: 'not_configured', model, inputTokens: 0, outputTokens: 0, durationMs: 0 };

  // Why the local estimate is used; shown to the user in the evaluation text.
  let fallbackReason = 'o Gemini não está configurado neste ambiente (falta a chave GEMINI_API_KEY)';
  if (skip) {
    fallbackReason = SKIP_TEXT[skip];
    usage.reason = skip;
  }

  // If Gemini API is available (and the platform allows it now), invoke the model with a structured prompt
  if (client && !skip) {
    try {
      const prompt = `
Você é o assistente de inteligência artificial de apoio à decisão humana da plataforma Vértice 360 - Ciclo de Talentos.
Siga estritamente os princípios do produto:
1. IA como apoio (nunca toma a decisão final de contratação; apoia o recrutador).
2. Decisão humana prioritária (o RH/gestor validará as hipóteses).
3. Explicação clara e objetiva das recomendações (evitar 'caixa preta').
4. Privacidade e segurança entre empresas (dados isolados do tenant).
5. Rastreabilidade total.

ANALISE O CANDIDATO PARA A VAGA E O DNA CULTURAL DA ORGANIZAÇÃO:

DADOS DA ORGANIZAÇÃO & DNA CULTURAL:
- Arquétipo da Cultura: ${dna.archetype}
- Resumo da Cultura: ${dna.cultureSummary}
- Valores Fundamentais: ${dna.coreValues.join(', ')}
- Pilares Culturais: ${dna.pillars.map(p => `${p.name} (Peso: ${p.weight}/5): ${p.description}`).join(' | ')}

DADOS DA VAGA & CARGO:
- Título da Vaga: ${job.title}
- Requisitos Técnicos do Cargo: ${position?.technicalRequirements?.join(', ') || 'Não especificado'}
- Competências Comportamentais: ${position?.behavioralCompetencies?.join(', ') || 'Não especificado'}
- Modelo de Trabalho: ${job.workModel} em ${job.location}

DADOS DO CANDIDATO:
- Nome: ${candidate.name}
- Cargo Atual: ${informed(candidate.currentRole)}
- Anos de Experiência: ${candidate.yearsOfExperience > 0 ? `${candidate.yearsOfExperience} anos` : 'Não informado (ou sem experiência profissional)'}
- Formação: ${informed(candidate.education)}
- Resumo Profissional: ${informed(candidate.resumeSummary)}
- Competências Principais: ${candidate.skills.length ? candidate.skills.join(', ') : 'Não informado'}
- Idiomas: ${candidate.languages.length ? candidate.languages.join(', ') : 'Não informado'}
Campos "Não informado" são ausência de dado, não um ponto negativo: não invente conteúdo para eles e, se a falta impedir a análise, diga isso em potentialGaps.

Em pillarScores, devolva exatamente um item para cada pilar cultural listado acima, usando o nome exato do pilar, e nenhum pilar além desses.
Retorne um JSON com a avaliação honesta, construtiva e fundamentada.
`;

      const response = await withTransientRetry(attemptTimeoutMs => client.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: 'Você é um especialista em People Analytics e psicometria organizacional que avalia candidatos com rigor, transparência explicável e foco em apoiar a decisão humana sem viés.',
          responseMimeType: 'application/json',
          abortSignal: AbortSignal.timeout(attemptTimeoutMs),
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallFitScore: { type: Type.INTEGER, description: 'Nota geral ponderada de 0 a 100' },
              technicalFitScore: { type: Type.INTEGER, description: 'Nota de aderência técnica de 0 a 100' },
              culturalFitScore: { type: Type.INTEGER, description: 'Nota de aderência cultural de 0 a 100' },
              detailedExplanation: { type: Type.STRING, description: 'Texto explicativo do porquê desta nota' },
              keyStrengths: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Pontos fortes observados no perfil'
              },
              potentialGaps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Gaps ou pontos de atenção para investigar na entrevista humana'
              },
              suggestedInterviewQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Perguntas práticas sugeridas para o entrevistador humano validar as hipóteses'
              },
              pillarScores: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    pillarName: { type: Type.STRING },
                    score: { type: Type.INTEGER },
                    analysis: { type: Type.STRING }
                  },
                  required: ['pillarName', 'score', 'analysis']
                }
              }
            },
            required: [
              'overallFitScore',
              'technicalFitScore',
              'culturalFitScore',
              'detailedExplanation',
              'keyStrengths',
              'potentialGaps',
              'suggestedInterviewQuestions',
              'pillarScores'
            ]
          }
        }
      }));

      // The provider bills what it processed even when the answer turns out unusable, so count it before validating.
      // Thinking tokens are billed as output.
      usage.inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
      usage.outputTokens = (response.usageMetadata?.candidatesTokenCount ?? 0) + (response.usageMetadata?.thoughtsTokenCount ?? 0);

      if (!response.text) throw new Error('Resposta do modelo vazia');
      const parsed = JSON.parse(response.text);
      const evaluation: Omit<AIAssistedEvaluation, 'id' | 'evaluatedAt'> = {
        candidateId: candidate.id,
        jobOpeningId: job.id,
        source: 'gemini',
        overallFitScore: toScore(parsed.overallFitScore, 'overallFitScore'),
        technicalFitScore: toScore(parsed.technicalFitScore, 'technicalFitScore'),
        culturalFitScore: toScore(parsed.culturalFitScore, 'culturalFitScore'),
        detailedExplanation: typeof parsed.detailedExplanation === 'string' && parsed.detailedExplanation.trim()
          ? parsed.detailedExplanation
          : 'Avaliação gerada pelo modelo de IA.',
        keyStrengths: toStrings(parsed.keyStrengths, 'keyStrengths'),
        potentialGaps: toStrings(parsed.potentialGaps, 'potentialGaps'),
        suggestedInterviewQuestions: toStrings(parsed.suggestedInterviewQuestions, 'suggestedInterviewQuestions'),
        pillarScores: alignPillars(toPillarScores(parsed.pillarScores), dna.pillars)
      };
      usage.outcome = 'ai';
      usage.reason = undefined;
      usage.durationMs = Date.now() - startedAt;
      return { evaluation, usage };
    } catch (err) {
      console.error('[AI] A chamada ao Gemini falhou ou devolveu resposta inválida; usando estimativa local:', err);
      fallbackReason = describeFailure(err);
      usage.outcome = 'failed';
      usage.reason = 'error';
    }
  }

  // Local heuristic fallback. Its output is explicitly labeled as such (text + `source`) so nobody mistakes it for an AI assessment.
  console.warn(`[AI] Usando estimativa heurística local: ${fallbackReason}.`);
  const techMatches = (position?.technicalRequirements || []).filter(req => 
    candidate.skills.some(s => s.toLowerCase().includes(req.toLowerCase()) || req.toLowerCase().includes(s.toLowerCase())) ||
    candidate.resumeSummary.toLowerCase().includes(req.toLowerCase())
  );

  const matchRatio = position?.technicalRequirements?.length 
    ? techMatches.length / position.technicalRequirements.length 
    : 0.8;

  const techScore = Math.min(96, Math.max(65, Math.round(matchRatio * 40 + candidate.yearsOfExperience * 5 + 40)));
  const cultureScore = Math.min(95, Math.max(70, Math.round(78 + (candidate.skills.length % 5) * 3)));
  const overall = Math.round((techScore * 0.5) + (cultureScore * 0.5));

  // Só cita experiência e cargo quando o candidato os informou (campos em branco não são inventados).
  const knowsExperience = candidate.yearsOfExperience > 0 && candidate.currentRole.trim() !== '';
  const pillarScores = dna.pillars.map((pillar, idx) => ({
    pillarName: pillar.name,
    score: Math.min(95, Math.max(68, cultureScore + ((idx % 2 === 0) ? 3 : -4))),
    analysis: `O perfil do candidato demonstra compatibilidade com o pilar '${pillar.name}'${knowsExperience ? `, especialmente pela vivência de ${candidate.yearsOfExperience} anos no cargo de ${candidate.currentRole}` : ''}. Recomenda-se aprofundar na entrevista comportamental.`
  }));

  usage.durationMs = Date.now() - startedAt;
  usage.reasonText = fallbackReason;
  const evaluation: Omit<AIAssistedEvaluation, 'id' | 'evaluatedAt'> = {
    candidateId: candidate.id,
    jobOpeningId: job.id,
    source: 'heuristic',
    overallFitScore: overall,
    technicalFitScore: techScore,
    culturalFitScore: cultureScore,
    detailedExplanation: `⚠ ESTIMATIVA LOCAL — ${fallbackReason}. Estas notas vêm de regras simples (habilidades × requisitos e anos de experiência), NÃO de uma avaliação de IA. Use apenas como apoio e valide em entrevista. Análise assistida gerada para a vaga '${job.title}'. ${knowsExperience ? `O candidato ${candidate.name} possui ${candidate.yearsOfExperience} anos de experiência sólida como '${candidate.currentRole}'.` : `O candidato ${candidate.name} não informou tempo de experiência ou cargo atual.`} Foram identificadas correspondências fortes em ${techMatches.length > 0 ? techMatches.join(', ') : 'requisitos essenciais'}, com destaque para sua formação e consistência profissional. Aderência ao arquétipo cultural '${dna.archetype}' classificada em nível ${cultureScore >= 85 ? 'Excelente' : 'Bom'}.`,
    keyStrengths: [
      knowsExperience ? `Experiência de ${candidate.yearsOfExperience} anos como ${candidate.currentRole}` : null,
      candidate.skills.length ? `Domínio nas competências centrais: ${candidate.skills.slice(0, 3).join(', ')}` : null,
      candidate.education.trim() ? `Formação acadêmica sólida (${candidate.education})` : null
    ].filter((s): s is string => s !== null),
    potentialGaps: [
      'Validar em entrevista casos práticos de superação de metas sob pressão',
      'Investigar expectativas salariais e adaptação à dinâmica de squads da empresa'
    ],
    suggestedInterviewQuestions: [
      `Como você aplicou suas competências de ${candidate.skills[0] || 'sua área'} em um momento de alto impacto na sua última empresa?`,
      `Considerando nosso valor de '${dna.coreValues[0] || 'Transparência'}', conte uma situação onde foi necessário discordar construtivamente de um colega ou gestor.`,
      `Qual o seu método para se manter atualizado e aprender rapidamente novas tecnologias ou ferramentas?`
    ],
    pillarScores
  };
  return { evaluation, usage };
}
