import http from 'node:http';

/**
 * Minimal fake of the Gemini REST API (only the one endpoint the project calls: `models/{model}:generateContent`),
 * used exclusively by the smoke test so it never calls the real Google API. The scenario is chosen by a marker placed
 * inside the request content — for a PDF upload, embed the marker as literal text near the start of the PDF (a
 * `%PDF-1.4` stream with the marker as a visible string is enough: this server does not truly parse PDF, it just
 * looks for the marker bytes anywhere in the base64-decoded inline data or in the plain text part).
 *
 * Point the app at it with `GEMINI_API_KEY=fake GEMINI_BASE_URL=http://127.0.0.1:<port>` (server/gemini.ts only
 * honors `GEMINI_BASE_URL` outside production).
 */
const MARKERS = {
  HIGH_FIT: '[[FIT:HIGH]]',
  LOW_TECH_HIGH_CULTURE: '[[FIT:SECOND_LOOK]]',
  NO_EMAIL: '[[NO_EMAIL]]',
  BAD_JSON: '[[BAD_JSON]]',
  HTTP_500: '[[HTTP_500]]',
  INJECTION: '[[INJECTION]]'
} as const;

let calls = 0;

function extractIds(promptText: string): { requirementIds: string[]; pillarIds: string[] } {
  const requirementIds: string[] = [];
  const pillarIds: string[] = [];
  for (const m of promptText.matchAll(/^\s*-\s+([A-Za-z0-9_-]+):/gm)) {
    const id = m[1];
    if (/^R\d+$/.test(id)) requirementIds.push(id);
    else if (!requirementIds.includes(id) && !pillarIds.includes(id)) pillarIds.push(id);
  }
  return { requirementIds: [...new Set(requirementIds)], pillarIds: [...new Set(pillarIds)] };
}

function buildAnalysisJson(promptText: string, allText: string): string {
  const { requirementIds, pillarIds } = extractIds(promptText);

  if (allText.includes(MARKERS.NO_EMAIL)) {
    return JSON.stringify({
      documentQuality: 'good', qualityNote: '', instructionsInDocument: false,
      extraction: {
        name: 'Candidato Sem Email', email: '', phone: '', location: '', linkedinUrl: '', currentRole: 'Dev',
        yearsOfExperience: 3, education: '', skills: ['TypeScript'], languages: [], summary: 'Perfil técnico.'
      },
      requirements: requirementIds.map(id => ({ id, status: 'met', evidence: 'evidência' })),
      pillars: pillarIds.map(id => ({ id, score: 80, confidence: 'high', analysis: 'ok', evidence: 'evidência' })),
      technicalScore: 80, strengths: ['Forte em TypeScript'], gaps: [], interviewQuestions: ['Pergunta?'],
      explanation: 'Perfil forte, mas sem e-mail no currículo.'
    });
  }

  const highCultureLowTech = allText.includes(MARKERS.LOW_TECH_HIGH_CULTURE);
  const technicalScore = highCultureLowTech ? 30 : 88;
  const pillarConfidence = allText.includes(MARKERS.HIGH_FIT) || highCultureLowTech ? 'high' : 'high';
  const pillarScore = highCultureLowTech ? 95 : 85;

  return JSON.stringify({
    documentQuality: 'good',
    qualityNote: '',
    instructionsInDocument: allText.includes(MARKERS.INJECTION),
    extraction: {
      name: 'Candidata Smoke Teste', email: 'candidata.smoke@teste.local', phone: '', location: 'São Paulo, SP',
      linkedinUrl: '', currentRole: 'Engenheira de Software', yearsOfExperience: 6, education: 'Bacharelado em Ciência da Computação',
      skills: ['TypeScript', 'PostgreSQL'], languages: ['Português'], summary: 'Seis anos construindo produtos web.'
    },
    requirements: requirementIds.map(id => ({ id, status: highCultureLowTech ? 'not_met' : 'met', evidence: highCultureLowTech ? '' : 'Cinco anos usando TypeScript em produção.' })),
    pillars: pillarIds.map(id => ({ id, score: pillarScore, confidence: pillarConfidence, analysis: 'Demonstra alinhamento no currículo.', evidence: 'Evidência do currículo.' })),
    technicalScore,
    strengths: ['Forte em TypeScript', 'Experiência com PostgreSQL'],
    gaps: highCultureLowTech ? ['Poucos requisitos técnicos atendidos'] : [],
    interviewQuestions: ['Conte sobre uma decisão técnica difícil que você liderou.'],
    explanation: highCultureLowTech ? 'Ótima aderência cultural, mas poucos requisitos técnicos atendidos.' : 'Perfil técnico forte, com boa evidência cultural.'
  });
}

export function startFakeGemini(port: number): Promise<{ close: () => Promise<void>; callCount: () => number }> {
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');

    if (!req.url?.includes(':generateContent')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'not found in fake gemini' } }));
    }

    calls++;
    let body: any = {};
    try { body = JSON.parse(raw); } catch { /* ignora */ }
    // O SDK envolve as partes soltas que o projeto envia num único Content: `contents: [{ parts: [...] }]`.
    // Aceita as duas formas (partes soltas ou já dentro de `.parts`) para não depender de um detalhe de versão do SDK.
    const contents: any[] = Array.isArray(body.contents) ? body.contents : [];
    const parts: any[] = contents.flatMap(c => (Array.isArray(c?.parts) ? c.parts : [c]));
    const textParts = parts.filter(p => typeof p?.text === 'string').map(p => p.text as string);
    const promptText = textParts[0] ?? '';
    const inlineDataText = parts
      .filter(p => p?.inlineData?.data)
      .map(p => Buffer.from(p.inlineData.data, 'base64').toString('latin1'))
      .join('\n');
    const allText = [...textParts, inlineDataText].join('\n');

    if (allText.includes(MARKERS.HTTP_500)) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'simulated transient error' } }));
    }

    const usageMetadata = { promptTokenCount: 500, candidatesTokenCount: 300, totalTokenCount: 800 };

    if (allText.includes(MARKERS.BAD_JSON)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text: 'isto não é um JSON válido' }] }, finishReason: 'STOP', index: 0 }],
        usageMetadata,
        modelVersion: 'gemini-3.8-flash'
      }));
    }

    const analysisText = buildAnalysisJson(promptText, allText);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text: analysisText }] }, finishReason: 'STOP', index: 0 }],
      usageMetadata,
      modelVersion: 'gemini-3.8-flash'
    }));
  });

  return new Promise(resolve => {
    server.listen(port, () => resolve({
      close: () => new Promise(r => server.close(() => r())),
      callCount: () => calls
    }));
  });
}

export const FAKE_GEMINI_MARKERS = MARKERS;

// Allows running standalone too: `node --import tsx scripts/fakeGemini.ts 5177`
if (process.argv[1] && process.argv[1].endsWith('fakeGemini.ts')) {
  const port = Number(process.argv[2]) || 5177;
  void startFakeGemini(port).then(() => console.log(`FAKE_GEMINI_READY on ${port}`));
}
