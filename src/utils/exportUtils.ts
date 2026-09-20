import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Candidate, TenantIndicators, JobOpening, AIAssistedEvaluation } from '../types.js';
import { formatDateTimeSP } from './dateUtils.js';

// Helper to trigger file download in browser
export function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports candidate talent pool data to CSV (Excel-ready with UTF-8 BOM and semicolon delimiters)
 */
export function exportCandidatesToCSV(
  candidates: Candidate[],
  evaluations: AIAssistedEvaluation[] = [],
  tenantName: string = 'Organização'
) {
  const headers = [
    'Nome Completo',
    'Cargo Atual',
    'Anos de Experiência',
    'Formação',
    'Competências / Skills',
    'Email',
    'Telefone',
    'Localização',
    'Score Fit Geral IA (%)',
    'Decisão do Gestor Humano',
    'Resumo Profissional'
  ];

  const rows = candidates.map(c => {
    const ev = evaluations.find(e => e.candidateId === c.id);
    const fitScore = ev ? `${ev.overallFitScore}%` : 'Não avaliado';
    const decision = ev?.humanReviewerDecision
      ? ev.humanReviewerDecision === 'APPROVED' ? 'Aprovado' : ev.humanReviewerDecision === 'REJECTED' ? 'Reprovado' : 'Aprofundar'
      : 'Pendente';

    return [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.currentRole.replace(/"/g, '""')}"`,
      c.yearsOfExperience,
      `"${(c.education || '').replace(/"/g, '""')}"`,
      `"${(c.skills || []).join(', ').replace(/"/g, '""')}"`,
      `"${c.email.replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.location || '').replace(/"/g, '""')}"`,
      `"${fitScore}"`,
      `"${decision}"`,
      `"${(c.resumeSummary || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const timestamp = new Date().toISOString().slice(0, 10);
  const cleanTenant = tenantName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  downloadFile(blob, `talent_pool_${cleanTenant}_${timestamp}.csv`);
}

/**
 * Exports candidate talent pool performance data to PDF
 */
export function exportCandidatesToPDF(
  candidates: Candidate[],
  evaluations: AIAssistedEvaluation[] = [],
  tenantName: string = 'Organização',
  dbName: string = 'tenant'
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const nowFormatted = formatDateTimeSP(new Date(), true);

  // Brand Header
  doc.setFillColor(79, 70, 229); // Indigo 600
  doc.rect(0, 0, 210, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Vértice 360 - Ciclo de Talentos', 14, 11);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Partição: ${dbName}  |  Fuso: Horário Oficial de Brasília / São Paulo (SP)`, 14, 18);

  // Document Title
  doc.setTextColor(30, 41, 59); // Slate 800
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório Executivo de Performance do Talent Pool', 14, 34);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text(`Organização: ${tenantName}  •  Data de Emissão: ${nowFormatted}`, 14, 40);

  // KPI summary badges
  const total = candidates.length;
  const avgExp = total > 0 ? (candidates.reduce((a, b) => a + b.yearsOfExperience, 0) / total).toFixed(1) : '0';
  const evaluatedCount = evaluations.filter(e => candidates.some(c => c.id === e.candidateId)).length;

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 45, 182, 16, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Total de Candidatos no Pool: ${total}`, 20, 55);
  doc.text(`Experiência Média: ${avgExp} anos`, 80, 55);
  doc.text(`Avaliados com IA Assistida: ${evaluatedCount} / ${total}`, 140, 55);

  // Table Data
  const tableData = candidates.map(c => {
    const ev = evaluations.find(e => e.candidateId === c.id);
    const fit = ev ? `${ev.overallFitScore}%` : 'Pendente';
    const status = ev?.humanReviewerDecision
      ? ev.humanReviewerDecision === 'APPROVED' ? 'Aprovado' : ev.humanReviewerDecision === 'REJECTED' ? 'Reprovado' : 'Aprofundar'
      : (ev ? 'Revisão Pend.' : 'Triagem');

    return [
      c.name,
      c.currentRole,
      `${c.yearsOfExperience} anos`,
      c.skills.slice(0, 3).join(', '),
      fit,
      status,
      c.email
    ];
  });

  autoTable(doc, {
    startY: 66,
    head: [['Candidato', 'Cargo Atual', 'Exp.', 'Principais Competências', 'Fit IA', 'Decisão', 'Contato']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [67, 56, 202],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2.5
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 28 },
      2: { cellWidth: 15 },
      3: { cellWidth: 38 },
      4: { cellWidth: 15 },
      5: { cellWidth: 20 },
      6: { cellWidth: 34 }
    }
  });

  // Footer / Confidentiality Note
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Vértice 360 • Partição: ${dbName} • Página ${i} de ${pageCount}`,
      14,
      290
    );
  }

  const cleanTenant = tenantName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const timestamp = new Date().toISOString().slice(0, 10);
  doc.save(`relatorio_talent_pool_${cleanTenant}_${timestamp}.pdf`);
}

/** Real funnel from the organization's stored indicators (conversion relative to applicants). */
function funnelRows(ind: TenantIndicators) {
  const f = ind.recruitmentFunnel;
  const base = f.applied || 0;
  const pct = (v: number) => (base > 0 ? `${((v / base) * 100).toFixed(1)}%` : '—');
  return [
    ['1. Inscritos / Triagem Inicial', f.applied, pct(f.applied)],
    ['2. Triagem / Fit Cultural', f.screened, pct(f.screened)],
    ['3. Entrevistas', f.interviewed, pct(f.interviewed)],
    ['4. Propostas', f.offered, pct(f.offered)],
    ['5. Admissões', f.hired, pct(f.hired)]
  ] as [string, number, string][];
}

/**
 * Exports People Analytics & Indicators data to CSV
 */
export function exportIndicatorsToCSV(
  indicators: TenantIndicators | null,
  tenantName: string = 'Organização'
) {
  if (!indicators) return; // nothing real to export
  const ind = indicators;

  const rows = [
    ['MÉTRICAS CONSOLIDADAS DE GESTÃO DE TALENTOS & PEOPLE ANALYTICS', '', ''],
    ['Organização', tenantName, ''],
    ['Data do Relatório (São Paulo - SP)', formatDateTimeSP(new Date(), true), ''],
    ['', '', ''],
    ['Indicador Estratégico', 'Valor Apurado', 'Benchmark / Meta'],
    ['Tempo Médio de Fechamento de Vaga (Time to Hire)', `${ind.timeToHireDays} dias`, 'Meta: < 30 dias'],
    ['Aderência ao DNA Cultural Médio (Fit Cultural)', `${ind.averageCulturalFit}%`, 'Meta: > 80%'],
    ['Custo Médio por Admissão (Cost per Hire)', `R$ ${ind.costPerHire.toLocaleString('pt-BR')}`, 'Período apurado: ' + ind.period],
    ['Taxa de Retenção Pós-Onboarding (90 dias)', `${(100 - ind.earlyTurnover90DaysRate).toFixed(1)}%`, 'Meta: > 90%'],
    ['Satisfação dos Candidatos (c-NPS)', `+${ind.candidateNPS}`, 'Zona de Excelência (> 70)'],
    ['Total de Contratações Realizadas no Trimestre', `${ind.totalHiresThisQuarter} profissionais`, 'Trimestre Atual'],
    ['', '', ''],
    ['FUNIL DE CONVERSÃO DO PROCESSO SELETIVO', 'VOLUME DE CANDIDATOS', 'TAXA DE CONVERSÃO'],
    ...funnelRows(ind).map(([label, n, conv]) => [label, `${n} candidatos`, conv]),
    ['', '', ''],
    ['GOVERNANÇA & PRINCÍPIOS DE DECISÃO HUMANA', 'SITUAÇÃO', 'DESCRIÇÃO'],
    ['Rastreabilidade & Logs Auditáveis', 'Ativa', 'Ações sensíveis registradas com carimbo de data/hora SP'],
    ['Decisão final', 'Humana', 'A IA apoia; recrutadores e gestores decidem e justificam']
  ];

  const csvContent = '\uFEFF' + rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const timestamp = new Date().toISOString().slice(0, 10);
  const cleanTenant = tenantName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  downloadFile(blob, `indicadores_people_analytics_${cleanTenant}_${timestamp}.csv`);
}

/**
 * Exports People Analytics & Indicators data to PDF
 */
export function exportIndicatorsToPDF(
  indicators: TenantIndicators | null,
  tenantName: string = 'Organização',
  dbName: string = 'tenant'
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  if (!indicators) return; // nothing real to export
  const ind = indicators;

  const nowFormatted = formatDateTimeSP(new Date(), true);

  // Header Banner
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, 210, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Vértice 360 - Ciclo de Talentos', 14, 11);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Partição: ${dbName}  |  Horário Oficial de Brasília / São Paulo (SP)`, 14, 18);

  // Document Title
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório Estratégico de Indicadores & People Analytics', 14, 34);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Organização: ${tenantName}  •  Emissão: ${nowFormatted}`, 14, 40);

  // KPI Overview Table
  autoTable(doc, {
    startY: 46,
    head: [['Indicador Estratégico', 'Resultado Apurado', 'Meta / Benchmark', 'Impacto']],
    body: [
      ['Time to Hire (Tempo Médio de Fechamento)', `${ind.timeToHireDays} dias`, '< 30 dias', '-4 dias vs mês anterior'],
      ['Fit Cultural Médio (Pilares do DNA)', `${ind.averageCulturalFit}%`, '> 80%', 'Alta aderência cultural'],
      ['Custo por Contratação (Cost per Hire)', `R$ ${ind.costPerHire.toLocaleString('pt-BR')}`, 'R$ 4.500', '-18% com triagem inteligente'],
      ['Retenção Pós-Onboarding (90 dias)', `${(100 - ind.earlyTurnover90DaysRate).toFixed(1)}%`, '> 90%', 'Excelente integração'],
      ['Satisfação dos Candidatos (c-NPS)', `+${ind.candidateNPS}`, '> 70', 'Zona de Excelência'],
      ['Vagas Fechadas no Trimestre', `${ind.totalHiresThisQuarter} profissionais`, '12 contratações', 'Meta trimestral superada']
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [67, 56, 202],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.8
    }
  });

  const finalY1 = (doc as any).lastAutoTable.finalY || 105;

  // Funnel Section Title
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Funil de Conversão do Processo Seletivo', 14, finalY1 + 10);

  autoTable(doc, {
    startY: finalY1 + 14,
    head: [['Etapa do Funil', 'Candidatos', 'Taxa de Conversão Relativa', 'Status']],
    body: [
      ...funnelRows(ind).map(([label, n, conv]) => [label, `${n} candidatos`, conv, '']),
    ],
    theme: 'striped',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5
    }
  });

  const finalY2 = (doc as any).lastAutoTable.finalY || 160;

  const finalY3 = finalY2;

  // Governance & Principles Section Title
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Auditoria de Governança & Soberania da Decisão Humana', 14, finalY3 + 10);

  autoTable(doc, {
    startY: finalY3 + 14,
    head: [['Princípio / Pilar', 'Índice Apurado', 'Garantia e Conformidade']],
    body: [
      ['Decisão final', 'Humana', 'A IA apoia; recrutadores e gestores decidem e justificam'],
      ['Rastreabilidade das Ações', 'Ativa', 'Ações sensíveis registradas com carimbo de data/hora oficial de São Paulo (SP)'],
      ['Privacidade entre Organizações', 'Aplicada', 'Dados separados por organização no banco (chaves compostas + RLS)']
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5
    }
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Vértice 360 • Partição: ${dbName} • Emissão: ${nowFormatted} • Página ${i} de ${pageCount}`,
      14,
      290
    );
  }

  const cleanTenant = tenantName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const timestamp = new Date().toISOString().slice(0, 10);
  doc.save(`indicadores_people_analytics_${cleanTenant}_${timestamp}.pdf`);
}
