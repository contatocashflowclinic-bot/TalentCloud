import {
  AIAssistedEvaluation, Candidate, InterviewSession, JobOpening, SelectionApplication
} from '../types.js';
import { formatDateSP } from './dateUtils.js';

export interface ApplicationSummaryData {
  organization?: string;
  candidate?: Candidate;
  job: JobOpening;
  application: SelectionApplication;
  evaluation?: AIAssistedEvaluation;
  interviews: InterviewSession[];
}

const STATUS: Record<SelectionApplication['status'], string> = {
  in_review: 'Em análise', advancing: 'Avançando', hold: 'Em espera', rejected: 'Reprovado', hired: 'Contratado'
};
const DECISION: Record<NonNullable<AIAssistedEvaluation['humanReviewerDecision']>, string> = {
  APPROVED: 'Aprovada pelo revisor humano',
  REJECTED: 'Rejeitada pelo revisor humano',
  REQUEST_ADDITIONAL_INTERVIEW: 'Revisor pediu nova entrevista',
  OVERRIDDEN: 'Decisão da IA substituída pelo revisor'
};
const RECOMMENDATION: Record<NonNullable<InterviewSession['interviewerRecommendation']>, string> = {
  STRONG_YES: 'Fortemente recomendado', YES: 'Recomendado', NEUTRAL: 'Neutro', NO: 'Não recomendado'
};
const INTERVIEW_STATUS: Record<InterviewSession['status'], string> = {
  scheduled: 'Agendada', completed: 'Realizada', cancelled: 'Cancelada', no_show: 'Não compareceu'
};

const stageOf = (d: ApplicationSummaryData) => {
  const stages = [...d.job.stages].sort((a, b) => a.order - b.order);
  const idx = stages.findIndex(s => s.id === d.application.currentStageId);
  return { name: idx >= 0 ? stages[idx].name : '—', position: idx + 1, total: stages.length };
};

const avg = (i: InterviewSession) =>
  i.scorecard.length ? i.scorecard.reduce((sum, c) => sum + c.score, 0) / i.scorecard.length : null;

/**
 * Plain-text summary for messaging / e-mail. It deliberately leaves out phone, e-mail and LinkedIn:
 * what leaves the system is the assessment, never the candidate's contact data (LGPD).
 */
export function buildSummaryText(d: ApplicationSummaryData): string {
  const c = d.candidate;
  const stage = stageOf(d);
  const lines: string[] = [
    `RESUMO DE CANDIDATO${d.organization ? ` — ${d.organization}` : ''}`,
    '',
    `${c?.name ?? 'Candidato'}${c ? ` — ${c.currentRole}, ${c.yearsOfExperience} anos de experiência` : ''}`,
    `Vaga: ${d.job.title}`,
    `Etapa: ${stage.name}${stage.total ? ` (${stage.position}/${stage.total})` : ''} · Situação: ${STATUS[d.application.status]}`
  ];
  if (c?.skills.length) lines.push(`Competências: ${c.skills.join(', ')}`);
  if (c?.education) lines.push(`Formação: ${c.education}`);
  if (d.evaluation) {
    const e = d.evaluation;
    lines.push('', `Avaliação por IA: fit geral ${e.overallFitScore}% (técnico ${e.technicalFitScore}%, cultural ${e.culturalFitScore}%)`);
    if (e.keyStrengths.length) lines.push(`Pontos fortes: ${e.keyStrengths.join('; ')}`);
    if (e.potentialGaps.length) lines.push(`Pontos de atenção: ${e.potentialGaps.join('; ')}`);
    lines.push(e.humanReviewerDecision ? `Revisão humana: ${DECISION[e.humanReviewerDecision]}` : 'Revisão humana: pendente (a IA apoia a decisão, não a substitui).');
  } else {
    lines.push('', 'Avaliação por IA: ainda não realizada.');
  }
  if (d.interviews.length) {
    lines.push('', 'Entrevistas:');
    for (const i of d.interviews) {
      const a = avg(i);
      lines.push(`- ${i.stageName} (${INTERVIEW_STATUS[i.status]})${a !== null ? ` · nota ${a.toFixed(1)}/5` : ''}${i.interviewerRecommendation ? ` · ${RECOMMENDATION[i.interviewerRecommendation]}` : ''}`);
    }
  }
  lines.push('', 'Documento interno e confidencial.');
  return lines.join('\n');
}

const esc = (value: unknown) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const CSS = `
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; font-size: 12px; line-height: 1.5; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin: 18px 0 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
  .muted { color: #64748b; }
  .kicker { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #4f46e5; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; break-inside: avoid; }
  .score { font-size: 18px; font-weight: 700; }
  .chips span { display: inline-block; background: #f1f5f9; border-radius: 999px; padding: 1px 8px; margin: 0 4px 4px 0; }
  ul { margin: 0; padding-left: 18px; }
  .foot { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; }
`;

/** Self-contained, print-ready page (A4). Every dynamic value is HTML-escaped. */
export function buildPrintHtml(d: ApplicationSummaryData, printedBy?: string): string {
  const c = d.candidate;
  const stage = stageOf(d);
  const e = d.evaluation;
  const list = (items: string[]) => (items.length ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '<span class="muted">—</span>');

  const interviews = d.interviews.map(i => {
    const a = avg(i);
    return `<div class="box"><b>${esc(i.stageName)}</b> <span class="muted">· ${esc(formatDateSP(i.scheduledFor))} · ${esc(INTERVIEW_STATUS[i.status])}</span>
      ${a !== null ? `<div>Nota média <b>${a.toFixed(1)}/5</b>${i.interviewerRecommendation ? ` · ${esc(RECOMMENDATION[i.interviewerRecommendation])}` : ''}</div>` : ''}
      ${i.overallFeedback ? `<div class="muted">${esc(i.overallFeedback)}</div>` : ''}</div>`;
  }).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(`Resumo — ${c?.name ?? 'Candidato'} — ${d.job.title}`)}</title><style>${CSS}</style></head><body>
  <div class="kicker">${esc(d.organization ?? 'Vértice 360')} · Resumo do candidato</div>
  <h1>${esc(c?.name ?? 'Candidato')}</h1>
  <div class="muted">${esc(c ? `${c.currentRole} • ${c.yearsOfExperience} anos de experiência` : '')}</div>

  <h2>Processo seletivo</h2>
  <div class="grid">
    <div class="box"><div class="muted">Vaga</div><b>${esc(d.job.title)}</b></div>
    <div class="box"><div class="muted">Etapa atual</div><b>${esc(stage.name)}</b>${stage.total ? ` <span class="muted">(${stage.position}/${stage.total})</span>` : ''}</div>
    <div class="box"><div class="muted">Situação</div><b>${esc(STATUS[d.application.status])}</b> <span class="muted">· inscrito em ${esc(formatDateSP(d.application.appliedAt))}</span></div>
  </div>

  ${c ? `<h2>Perfil</h2>
  <div>${[c.email, c.phone, c.location, c.education].filter(Boolean).map(esc).join(' · ')}</div>
  ${c.linkedinUrl ? `<div>${esc(c.linkedinUrl)}</div>` : ''}
  ${c.resumeSummary ? `<p>${esc(c.resumeSummary)}</p>` : ''}
  <div class="chips">${c.skills.map(s => `<span>${esc(s)}</span>`).join('')}</div>
  ${c.languages.length ? `<div class="muted">Idiomas: ${esc(c.languages.join(', '))}</div>` : ''}` : ''}

  <h2>Avaliação assistida por IA</h2>
  ${e ? `<div class="grid">
      <div class="box"><div class="muted">Fit geral</div><div class="score">${e.overallFitScore}%</div></div>
      <div class="box"><div class="muted">Técnico</div><div class="score">${e.technicalFitScore}%</div></div>
      <div class="box"><div class="muted">Cultural</div><div class="score">${e.culturalFitScore}%</div></div>
    </div>
    ${e.detailedExplanation ? `<p>${esc(e.detailedExplanation)}</p>` : ''}
    <div class="grid" style="grid-template-columns:1fr 1fr">
      <div><b>Pontos fortes</b>${list(e.keyStrengths)}</div>
      <div><b>Pontos de atenção</b>${list(e.potentialGaps)}</div>
    </div>
    <p class="muted">${e.humanReviewerDecision ? `Revisão humana: ${esc(DECISION[e.humanReviewerDecision])}${e.humanNotes ? ` — ${esc(e.humanNotes)}` : ''}` : 'Sem decisão do revisor humano. A IA apoia a decisão, não a substitui.'}</p>`
    : '<span class="muted">Avaliação por IA ainda não realizada para esta vaga.</span>'}

  ${d.interviews.length ? `<h2>Entrevistas</h2>${interviews}` : ''}
  ${d.application.notes.length ? `<h2>Histórico do processo</h2>${list([...d.application.notes].reverse())}` : ''}

  <div class="foot">Documento interno e confidencial — contém dados pessoais protegidos pela LGPD. Gerado em ${esc(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}${printedBy ? ` por ${esc(printedBy)}` : ''}.</div>
</body></html>`;
}

/** Prints through a hidden iframe (no pop-up to be blocked); the browser dialog also offers "Save as PDF". */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) { frame.remove(); throw new Error('Não foi possível preparar a impressão.'); }
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 1500);
  }, 250);
}
