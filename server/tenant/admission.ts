import type { AdmissionItem, AdmissionTemplate, JobOffer } from '../../src/types.js';
import { ValidationError } from '../errors.js';
import { newId } from '../ids.js';

type Def = Omit<AdmissionTemplate, 'id' | 'active'>;
const both: JobOffer['contractType'][] = ['CLT', 'PJ'];
const clt: JobOffer['contractType'][] = ['CLT'];
const pj: JobOffer['contractType'][] = ['PJ'];

const doc = (name: string, category: Def['category'], contractTypes: Def['contractTypes'], extra: Partial<Def> = {}): Def => ({
  name, category, description: '', required: true, requiresDocument: true, responsible: 'Candidato', dueDaysBeforeStart: 7, contractTypes, ...extra
});
const step = (name: string, responsible: Def['responsible'], contractTypes: Def['contractTypes'], extra: Partial<Def> = {}): Def => ({
  name, category: 'Etapas internas', description: '', required: true, requiresDocument: false, responsible, dueDaysBeforeStart: 3, contractTypes, ...extra
});

/** Starter catalog created once per organization; RH edits it afterwards. */
export const DEFAULT_ADMISSION_TEMPLATES: Def[] = [
  doc('RG ou CNH', 'Documentos pessoais', both),
  doc('CPF', 'Documentos pessoais', both),
  doc('Comprovante de residência', 'Documentos pessoais', both),
  doc('Foto 3x4', 'Documentos pessoais', both, { required: false }),
  doc('Comprovante de escolaridade', 'Documentos pessoais', both),
  doc('CTPS (digital ou física)', 'Documentos pessoais', clt),
  doc('PIS/NIS', 'Documentos pessoais', clt),
  doc('Título de eleitor', 'Documentos pessoais', clt),
  doc('Certificado de reservista', 'Documentos pessoais', clt, { required: false }),
  doc('Certidão de nascimento ou casamento', 'Documentos pessoais', clt),
  doc('Cartão CNPJ e contrato social/MEI', 'Documentos pessoais', pj),
  doc('ASO — Atestado de Saúde Ocupacional admissional', 'Exames', clt, { responsible: 'RH', dueDaysBeforeStart: 3 }),
  doc('Comprovante de dados bancários', 'Dados bancários e dependentes', both),
  doc('Documentos de dependentes', 'Dados bancários e dependentes', clt, { required: false }),
  doc('Contrato de trabalho assinado', 'Contratuais', clt, { responsible: 'Jurídico', dueDaysBeforeStart: 1 }),
  doc('Contrato de prestação de serviços assinado', 'Contratuais', pj, { responsible: 'Jurídico', dueDaysBeforeStart: 1 }),
  doc('Termo de confidencialidade assinado', 'Contratuais', both, { responsible: 'RH', dueDaysBeforeStart: 1 }),
  doc('Termo de responsabilidade de equipamentos', 'Contratuais', both, { responsible: 'RH', dueDaysBeforeStart: 1, required: false }),
  step('Cadastro no eSocial', 'DP', clt, { dueDaysBeforeStart: 1 }),
  step('Registro em folha de pagamento', 'DP', clt, { dueDaysBeforeStart: 1 }),
  step('Cadastro do prestador no financeiro', 'DP', pj, { dueDaysBeforeStart: 1 }),
  step('Criação de e-mail e acessos', 'TI', both),
  step('Separação e entrega de equipamentos', 'TI', both, { required: false })
];

const isoDate = (d: Date) => d.toISOString().split('T')[0];

/** Due date = start date minus the item's lead time in days. */
export function dueDateFor(startDate: string, daysBefore: number): string {
  const start = new Date(`${startDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime())) return startDate;
  start.setUTCDate(start.getUTCDate() - daysBefore);
  return isoDate(start);
}

export function buildAdmissionItems(
  templates: AdmissionTemplate[],
  contractType: JobOffer['contractType'],
  startDate: string,
  skipTemplateIds: ReadonlySet<string> = new Set()
): AdmissionItem[] {
  return templates
    .filter(t => t.active && t.contractTypes.includes(contractType) && !skipTemplateIds.has(t.id))
    .map(t => ({
      id: newId('adi'),
      templateId: t.id,
      title: t.name,
      category: t.category,
      required: t.required,
      requiresDocument: t.requiresDocument,
      responsible: t.responsible,
      dueDate: dueDateFor(startDate, t.dueDaysBeforeStart),
      status: 'pending' as const,
      history: []
    }));
}

export type AdmissionAction = 'approve' | 'reject' | 'reopen';

/** Review workflow of one item. Throws ValidationError for transitions that make no sense. */
export function reviewItem(item: AdmissionItem, action: AdmissionAction, note: string | undefined, by: string): void {
  const at = new Date().toISOString();
  const text = note?.trim();
  if (action === 'approve') {
    if (item.requiresDocument && item.status !== 'submitted') throw new ValidationError('Só é possível aprovar um documento que foi enviado e aguarda análise.');
    if (!item.requiresDocument && item.status === 'approved') throw new ValidationError('Esta etapa já está concluída.');
    item.status = 'approved';
    item.reviewNote = text || undefined;
    item.history.push({ at, by, action: item.requiresDocument ? 'Documento aprovado' : 'Etapa concluída' });
  } else if (action === 'reject') {
    if (!item.requiresDocument || item.status !== 'submitted') throw new ValidationError('Só é possível reprovar um documento enviado e em análise.');
    if (!text) throw new ValidationError('Informe o motivo da reprovação.');
    item.status = 'rejected';
    item.reviewNote = text;
    item.history.push({ at, by, action: `Documento reprovado: ${text}` });
  } else {
    if (item.status === 'pending') throw new ValidationError('O item já está pendente.');
    item.status = item.requiresDocument && item.file ? 'submitted' : 'pending';
    item.reviewNote = undefined;
    item.history.push({ at, by, action: 'Item reaberto' });
  }
}
