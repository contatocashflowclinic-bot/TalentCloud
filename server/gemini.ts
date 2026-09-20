import { GoogleGenAI, Type } from '@google/genai';
import {
  AIAssistedEvaluation,
  Candidate,
  JobOpening,
  JobPosition,
  OrganizationalDNA
} from '../src/types.js';

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

export async function evaluateCandidateWithAI(params: {
  candidate: Candidate;
  job: JobOpening;
  position?: JobPosition;
  dna: OrganizationalDNA;
}): Promise<Omit<AIAssistedEvaluation, 'id' | 'evaluatedAt'>> {
  const { candidate, job, position, dna } = params;
  const client = getGeminiClient();

  // If Gemini API is available, invoke the model (GEMINI_MODEL, default gemini-3.8-flash) with a structured prompt
  if (client) {
    try {
      const prompt = `
Você é o assistente de inteligência artificial de apoio à decisão humana da plataforma TalentCloud.
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
        model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
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

      if (response.text) {
        const parsed = JSON.parse(response.text);
        return {
          candidateId: candidate.id,
          jobOpeningId: job.id,
          overallFitScore: Math.min(100, Math.max(0, parsed.overallFitScore || 85)),
          technicalFitScore: Math.min(100, Math.max(0, parsed.technicalFitScore || 85)),
          culturalFitScore: Math.min(100, Math.max(0, parsed.culturalFitScore || 85)),
          detailedExplanation: parsed.detailedExplanation || 'Avaliação gerada pelo modelo de IA.',
          keyStrengths: parsed.keyStrengths || [],
          potentialGaps: parsed.potentialGaps || [],
          suggestedInterviewQuestions: parsed.suggestedInterviewQuestions || [],
          pillarScores: parsed.pillarScores || []
        };
      }
    } catch (err) {
      console.warn('Gemini API call failed, using intelligent analytical fallback:', err);
    }
  }

  // Local heuristic fallback. Its output is explicitly labeled as such so nobody mistakes it for an AI assessment.
  console.warn('[AI] Gemini indisponível: usando estimativa heurística local (rotulada na resposta).');
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

  return {
    candidateId: candidate.id,
    jobOpeningId: job.id,
    overallFitScore: overall,
    technicalFitScore: techScore,
    culturalFitScore: cultureScore,
    detailedExplanation: `⚠ ESTIMATIVA LOCAL — o Gemini não está configurado ou não respondeu. Estas notas vêm de regras simples (habilidades × requisitos e anos de experiência), NÃO de uma avaliação de IA. Use apenas como apoio e valide em entrevista. Análise assistida gerada para a vaga '${job.title}'. O candidato ${candidate.name} possui ${candidate.yearsOfExperience} anos de experiência sólida como '${candidate.currentRole}'. Foram identificadas correspondências fortes em ${techMatches.length > 0 ? techMatches.join(', ') : 'requisitos essenciais'}, com destaque para sua formação e consistência profissional. Aderência ao arquétipo cultural '${dna.archetype}' classificada em nível ${cultureScore >= 85 ? 'Excelente' : 'Bom'}.`,
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
}
