import { CLIMATE_CATEGORIES, type CampaignResults } from '../types.js';
import { CATEGORY_LABEL, ZONE_LABEL } from '../retention.js';
import { formatDateSP, formatDateTimeSP } from './dateUtils.js';
import { CAMPAIGN_STATUS_LABEL, formatEnps } from './retentionUtils.js';

/**
 * Export of the result of a climate survey. It carries exactly what the results screen shows: nothing below the
 * anonymity minimum, no author, and no answer the RH hid.
 */
interface Section {
  title: string;
  head: string[];
  body: string[][];
}

const num = (n: number) => n.toLocaleString('pt-BR');

export function climateSections(results: CampaignResults): Section[] {
  const { campaign: c } = results;
  const sections: Section[] = [];

  sections.push({
    title: 'Resumo da pesquisa',
    head: ['Item', 'Valor'],
    body: [
      ['Pesquisa', c.name],
      ['Período', c.period],
      ['Situação', CAMPAIGN_STATUS_LABEL[c.status]],
      ...(c.closesOn ? [[c.status === 'open' ? 'Encerra em' : 'Encerrou em', formatDateSP(c.closesOn)]] : []),
      ['Participação', `${c.responded} de ${c.eligible} (${results.responseRate}%)`],
      ...(results.enps
        ? [
            ['eNPS', `${formatEnps(results.enps.score)}${results.zone ? ` — ${ZONE_LABEL[results.zone]}` : ''}`],
            ['Promotores (9–10) / neutros (7–8) / detratores (0–6)', `${results.enps.promoters} / ${results.enps.passives} / ${results.enps.detractors}`],
            ...(results.previous ? [['Pesquisa anterior', `${formatEnps(results.previous.enps)} (${results.previous.name})`]] : [])
          ]
        : [['Resultado', `Liberado a partir de ${results.minGroup} respostas (proteção do anonimato)`]])
    ]
  });

  if (results.released && results.categoryAverages) {
    sections.push({
      title: 'Notas por categoria (0 a 10)',
      head: ['Categoria', 'Média'],
      body: CLIMATE_CATEGORIES.map(cat => [CATEGORY_LABEL[cat], num(results.categoryAverages![cat])])
    });
  }

  if (results.departments.length > 0) {
    sections.push({
      title: `Por departamento (mínimo de ${results.minGroup} respostas)`,
      head: ['Departamento', 'Respostas', 'eNPS', ...CLIMATE_CATEGORIES.map(cat => CATEGORY_LABEL[cat])],
      body: results.departments.map(d => [d.name, String(d.responses), formatEnps(d.enps), ...CLIMATE_CATEGORIES.map(cat => num(d.categoryAverages[cat]))])
    });
  }

  for (const block of results.blocks) {
    const rows: string[][] = block.questions.map(q => {
      const result = !q.released
        ? `Menos de ${results.minGroup} respostas (não detalhado)`
        : q.type === 'scale'
          ? `Média ${num(q.average ?? 0)}`
          : q.type === 'choice'
            ? (q.options ?? []).map(o => `${o.label}: ${o.count} (${q.responses > 0 ? Math.round((o.count / q.responses) * 100) : 0}%)`).join('; ')
            : `${q.responses} respostas em texto`;
      return [q.text, q.type === 'scale' ? 'Escala 0–10' : q.type === 'choice' ? 'Escolha única' : 'Texto livre', String(q.responses), result];
    });
    sections.push({
      title: `Perguntas estratégicas — ${block.title} (${block.audience === 'all' ? 'todos' : `cargos: ${block.positionTitles.join(', ') || '—'}`}; ${block.responded} de ${block.eligible} responderam)`,
      head: ['Pergunta', 'Tipo', 'Respostas', 'Resultado'],
      body: block.released ? rows : [[`Bloco com ${block.responded} respostas: resultado liberado a partir de ${results.minGroup}`, '', '', '']]
    });

    for (const q of block.questions) {
      const comments = (q.comments ?? []).filter(cm => !cm.hidden);
      if (q.released && q.type === 'text' && comments.length > 0) {
        sections.push({ title: `Respostas em texto — ${q.text}`, head: ['Resposta anônima'], body: comments.map(cm => [cm.text]) });
      }
    }
  }

  const coreComments = results.comments.filter(cm => !cm.hidden);
  if (coreComments.length > 0) {
    sections.push({ title: 'Comentários anônimos', head: ['Comentário'], body: coreComments.map(cm => [cm.text]) });
  }
  if (c.actionPlan) sections.push({ title: 'Plano de ação', head: ['Plano'], body: [[c.actionPlan]] });
  return sections;
}

const fileBase = (results: CampaignResults, tenantName: string) =>
  `clima_${tenantName}_${results.campaign.name}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').slice(0, 80);

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Excel-ready CSV: UTF-8 with BOM and semicolon delimiters. */
export function exportClimateResultsToCSV(results: CampaignResults, tenantName = 'Organização') {
  const q = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`;
  const rows: string[][] = [
    ['RESULTADO DE PESQUISA DE CLIMA'],
    ['Organização', tenantName],
    ['Emissão (São Paulo - SP)', formatDateTimeSP(new Date(), true)],
    []
  ];
  for (const section of climateSections(results)) rows.push([section.title.toUpperCase()], section.head, ...section.body, []);
  const csv = '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
  save(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${fileBase(results, tenantName)}_${new Date().toISOString().slice(0, 10)}.csv`);
}

/** PDF report. The PDF libraries are loaded only when this is used. */
export async function exportClimateResultsToPDF(results: CampaignResults, tenantName = 'Organização') {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, 210, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Vértice 360 - Ciclo de Talentos', 14, 11);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Horário Oficial de Brasília / São Paulo (SP)', 14, 18);

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Resultado da Pesquisa de Clima', 14, 34);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Organização: ${tenantName}  •  Emissão: ${formatDateTimeSP(new Date(), true)}`, 14, 40);

  let y = 46;
  for (const section of climateSections(results)) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    const titleLines = doc.splitTextToSize(section.title, 182) as string[];
    if (y > 265) { doc.addPage(); y = 16; }
    doc.text(titleLines, 14, y + 2);
    autoTable(doc, {
      startY: y + 2 + titleLines.length * 4.5,
      head: [section.head],
      body: section.body,
      theme: 'grid',
      headStyles: { fillColor: [67, 56, 202], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      margin: { left: 14, right: 14 }
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? y) + 8;
  }

  doc.save(`${fileBase(results, tenantName)}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
