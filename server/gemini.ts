import { GoogleGenAI, Type } from '@google/genai';
import {
  AIAssistedEvaluation,
  Candidate,
  JobOpening,
  JobPosition,
  OrganizationalDNA
} from '../src/types.js';
import type { AiSkipReason } from './aiCost.js';

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
}

// Shown to the organization's user inside the evaluation text when the local estimate replaces the AI.
const SKIP_TEXT: Record<AiSkipReason, string> = {
  paused: 'a IA está pausada pela administração da plataforma',
  limit_reached: 'o limite mensal de avaliações com IA desta organização foi atingido',
  budget_reached: 'o orçamento mensal de IA da plataforma foi atingido'
};

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return geminiClient;
}

/** A score must come from the model as a number; a missing/invalid one is a failed answer, never a made-up default. */
function toScore(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Resposta do modelo sem nota válida (${label})`);
  return Math.min(100, Math.max(0, Math.round(value)));
}

function toStrings(value: unknown, label: string): string[] {
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
- Cargo Atual: ${candidate.currentRole}
- Anos de Experiência: ${candidate.yearsOfExperience} anos
- Formação: ${candidate.education}
- Resumo Profissional: ${candidate.resumeSummary}
- Competências Principais: ${candidate.skills.join(', ')}
- Idiomas: ${candidate.languages.join(', ')}

Retorne um JSON com a avaliação honesta, construtiva e fundamentada.
`;

      const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: 'Você é um especialista em People Analytics e psicometria organizacional que avalia candidatos com rigor, transparência explicável e foco em apoiar a decisão humana sem viés.',
          responseMimeType: 'application/json',
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
      });

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
        pillarScores: toPillarScores(parsed.pillarScores)
      };
      usage.outcome = 'ai';
      usage.reason = undefined;
      usage.durationMs = Date.now() - startedAt;
      return { evaluation, usage };
    } catch (err) {
      console.error('[AI] A chamada ao Gemini falhou ou devolveu resposta inválida; usando estimativa local:', err);
      fallbackReason = 'a chamada ao Gemini falhou ou devolveu uma resposta inválida (detalhes nos registros do servidor)';
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

  const pillarScores = dna.pillars.map((pillar, idx) => ({
    pillarName: pillar.name,
    score: Math.min(95, Math.max(68, cultureScore + ((idx % 2 === 0) ? 3 : -4))),
    analysis: `O perfil do candidato demonstra compatibilidade com o pilar '${pillar.name}', especialmente pela vivência de ${candidate.yearsOfExperience} anos no cargo de ${candidate.currentRole}. Recomenda-se aprofundar na entrevista comportamental.`
  }));

  usage.durationMs = Date.now() - startedAt;
  const evaluation: Omit<AIAssistedEvaluation, 'id' | 'evaluatedAt'> = {
    candidateId: candidate.id,
    jobOpeningId: job.id,
    source: 'heuristic',
    overallFitScore: overall,
    technicalFitScore: techScore,
    culturalFitScore: cultureScore,
    detailedExplanation: `⚠ ESTIMATIVA LOCAL — ${fallbackReason}. Estas notas vêm de regras simples (habilidades × requisitos e anos de experiência), NÃO de uma avaliação de IA. Use apenas como apoio e valide em entrevista. Análise assistida gerada para a vaga '${job.title}'. O candidato ${candidate.name} possui ${candidate.yearsOfExperience} anos de experiência sólida como '${candidate.currentRole}'. Foram identificadas correspondências fortes em ${techMatches.length > 0 ? techMatches.join(', ') : 'requisitos essenciais'}, com destaque para sua formação e consistência profissional. Aderência ao arquétipo cultural '${dna.archetype}' classificada em nível ${cultureScore >= 85 ? 'Excelente' : 'Bom'}.`,
    keyStrengths: [
      `Experiência de ${candidate.yearsOfExperience} anos como ${candidate.currentRole}`,
      `Domínio nas competências centrais: ${candidate.skills.slice(0, 3).join(', ')}`,
      `Formação acadêmica sólida (${candidate.education})`
    ],
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
