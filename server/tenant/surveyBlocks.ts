import { createHash } from 'node:crypto';
import {
  CAREER_TRACKS,
  POSITION_LEVELS,
  QUESTION_TYPES,
  SURVEY_LIMITS,
  type BlockResult,
  type CampaignComment,
  type ClimateSurveyResponse,
  type PendingBlock,
  type QuestionResult,
  type SurveyAnswerValue,
  type SurveyBlock,
  type SurveyQuestion,
  type SurveyQuestionType,
  type TargetHints
} from '../../src/types.js';
import { MIN_GROUP } from '../../src/retention.js';
import { normalizeText } from '../../src/surveyTemplates.js';
import { ValidationError } from '../errors.js';
import { newId } from '../ids.js';
import { cleanText, requiredText } from './development.js';

/**
 * Rules of the strategic-question blocks of a survey (and of the templates that carry them): validation of what the
 * screens send, who sees each block, validation of the answers and the per-block results with the anonymity threshold.
 * Everything here is pure.
 */
type Body = Record<string, unknown>;

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/;
const MAX_POSITIONS = 60;

const isBlank = (value: unknown) => value === undefined || value === null || value === '';
const isObject = (value: unknown): value is Body => !!value && typeof value === 'object' && !Array.isArray(value);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Trimmed, non-empty and without repeats (ignoring case and accents), in the order sent. */
function uniqueTexts(value: unknown, label: string, maxItems: number, maxLength: number): string[] {
  if (isBlank(value)) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${label}: formato inválido.`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = cleanText(item, label, maxLength);
    const key = normalizeText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  if (out.length > maxItems) throw new ValidationError(`${label}: informe no máximo ${maxItems} itens.`);
  return out;
}

/** Only levels / tracks that exist in the Cargos module are accepted. */
function parseHints(value: unknown): TargetHints {
  if (isBlank(value)) return { levels: [], careerTracks: [] };
  if (!isObject(value)) throw new ValidationError('Sugestão de cargos: formato inválido.');
  const list = <T extends string>(raw: unknown, allowed: readonly T[], label: string): T[] => {
    if (isBlank(raw)) return [];
    if (!Array.isArray(raw) || raw.some(item => !allowed.includes(item as T))) throw new ValidationError(`${label}: valor inválido.`);
    return [...new Set(raw as T[])];
  };
  return { levels: list(value.levels, POSITION_LEVELS, 'Níveis'), careerTracks: list(value.careerTracks, CAREER_TRACKS, 'Trilhas de carreira') };
}

/** Ids of registered Cargos. They must exist in the organization; a template carries none (it only suggests). */
function parsePositionIds(value: unknown, refs: BlockRefs | undefined): string[] {
  if (!refs || isBlank(value)) return [];
  if (!Array.isArray(value)) throw new ValidationError('Cargos: formato inválido.');
  const ids = [...new Set(value.map(String))];
  if (ids.length > MAX_POSITIONS) throw new ValidationError(`Cargos: informe no máximo ${MAX_POSITIONS}.`);
  if (ids.some(id => !refs.positionIds.has(id))) throw new ValidationError('Cargo não encontrado nesta organização.');
  return ids;
}

/** What the blocks may refer to. Without it (templates) no Cargo id is kept. */
export interface BlockRefs {
  positionIds: ReadonlySet<string>;
}

function parseQuestion(raw: unknown, uniqueId: (raw: unknown, prefix: string) => string): SurveyQuestion {
  if (!isObject(raw)) throw new ValidationError('Pergunta inválida.');
  const type = raw.type;
  if (!QUESTION_TYPES.includes(type as SurveyQuestionType)) throw new ValidationError('Tipo de pergunta inválido. Use escala, escolha ou texto.');
  const question: SurveyQuestion = {
    id: uniqueId(raw.id, 'q'),
    text: requiredText(raw.text, 'Texto da pergunta', 300),
    type: type as SurveyQuestionType,
    required: typeof raw.required === 'boolean' ? raw.required : type !== 'text'
  };
  if (type === 'choice') {
    const options = uniqueTexts(raw.options, 'Opções', SURVEY_LIMITS.options, 80);
    if (options.length < 2) throw new ValidationError(`A pergunta “${question.text}” precisa de pelo menos 2 opções.`);
    question.options = options;
  }
  return question;
}

/**
 * The blocks of a survey or template, from a request body. Ids sent by the screen are kept (when valid and not repeated),
 * the others are generated. A block for "todos" carries no Cargos; a block for cargos points to REGISTERED Cargos (`refs`).
 */
export function parseBlocks(input: unknown, refs?: BlockRefs): SurveyBlock[] {
  if (isBlank(input)) return [];
  if (!Array.isArray(input)) throw new ValidationError('Perguntas estratégicas: formato inválido.');
  if (input.length > SURVEY_LIMITS.blocks) throw new ValidationError(`Uma pesquisa pode ter no máximo ${SURVEY_LIMITS.blocks} blocos de perguntas.`);

  const used = new Set<string>();
  const uniqueId = (raw: unknown, prefix: string): string => {
    const id = typeof raw === 'string' && ID_RE.test(raw) && !used.has(raw) ? raw : newId(prefix);
    used.add(id);
    return id;
  };

  let total = 0;
  const blocks = input.map(raw => {
    if (!isObject(raw)) throw new ValidationError('Bloco de perguntas inválido.');
    const audience = isBlank(raw.audience) ? 'all' : raw.audience;
    if (audience !== 'all' && audience !== 'roles') throw new ValidationError('Público do bloco inválido. Use todos ou cargos específicos.');
    if (raw.questions !== undefined && !Array.isArray(raw.questions)) throw new ValidationError('Perguntas do bloco: formato inválido.');
    const questions = ((raw.questions as unknown[] | undefined) ?? []);
    if (questions.length > SURVEY_LIMITS.questionsPerBlock) {
      throw new ValidationError(`Cada bloco pode ter no máximo ${SURVEY_LIMITS.questionsPerBlock} perguntas.`);
    }
    total += questions.length;
    const description = cleanText(raw.description, 'Descrição do bloco', 300);
    return {
      id: uniqueId(raw.id, 'b'),
      title: requiredText(raw.title, 'Título do bloco', 80),
      ...(description ? { description } : {}),
      audience,
      positionIds: audience === 'roles' ? parsePositionIds(raw.positionIds, refs) : [],
      targetHints: parseHints(raw.targetHints),
      questions: questions.map(q => parseQuestion(q, uniqueId))
    } satisfies SurveyBlock;
  });

  if (total > SURVEY_LIMITS.questions) throw new ValidationError(`Uma pesquisa pode ter no máximo ${SURVEY_LIMITS.questions} perguntas estratégicas.`);
  return blocks;
}

/** What must be true before a survey goes live: no empty block, and every block for "cargos" names at least one. */
export function assertBlocksReady(blocks: readonly SurveyBlock[]): void {
  for (const block of blocks) {
    if (block.questions.length === 0) throw new ValidationError(`O bloco “${block.title}” não tem perguntas. Adicione uma ou remova o bloco.`);
    if (block.audience === 'roles' && block.positionIds.length === 0) {
      throw new ValidationError(`Escolha ao menos um cargo para o bloco “${block.title}” ou deixe-o para todos.`);
    }
  }
}

// ---- Who sees what -----------------------------------------------------------------------------
/** A block "para todos" is seen by everyone; one "para cargos" only by whoever is linked to one of those registered Cargos. */
export function memberSeesBlock(block: Pick<SurveyBlock, 'audience' | 'positionIds'>, member: { positionId?: string }): boolean {
  return block.audience === 'all' || (!!member.positionId && block.positionIds.includes(member.positionId));
}

export const visibleBlocks = (blocks: readonly SurveyBlock[], member: { positionId?: string }): SurveyBlock[] =>
  blocks.filter(block => memberSeesBlock(block, member));

/** The block as the respondent sees it: without the job titles it was aimed at. */
export const toPendingBlocks = (blocks: readonly SurveyBlock[]): PendingBlock[] =>
  blocks.map(({ id, title, description, questions }) => ({ id, title, ...(description ? { description } : {}), questions }));

// ---- Answers -----------------------------------------------------------------------------------
/**
 * Validates the answers to the blocks the respondent can see. Answers to questions of blocks aimed at other job titles are
 * refused, a required question must be answered, and every value must fit its question type.
 */
export function parseBlockAnswers(visible: readonly SurveyBlock[], raw: unknown): Record<string, SurveyAnswerValue> {
  if (!isBlank(raw) && !isObject(raw)) throw new ValidationError('Respostas das perguntas estratégicas: formato inválido.');
  const input = (raw ?? {}) as Body;
  const questions = new Map(visible.flatMap(block => block.questions.map(q => [q.id, q] as const)));

  for (const key of Object.keys(input)) {
    if (!questions.has(key)) throw new ValidationError('Há resposta para uma pergunta que não faz parte da sua pesquisa.');
  }

  const out: Record<string, SurveyAnswerValue> = {};
  for (const question of questions.values()) {
    const value = input[question.id];
    const blank = isBlank(value) || (typeof value === 'string' && value.trim() === '');
    if (blank) {
      if (question.required) throw new ValidationError(`Responda a pergunta: “${question.text}”.`);
      continue;
    }
    if (question.type === 'scale') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10) {
        throw new ValidationError(`“${question.text}”: informe uma nota de 0 a 10.`);
      }
      out[question.id] = value;
    } else if (question.type === 'choice') {
      if (typeof value !== 'string' || !question.options?.includes(value)) throw new ValidationError(`“${question.text}”: escolha uma das opções.`);
      out[question.id] = value;
    } else {
      out[question.id] = cleanText(value, `“${question.text}”`, 1000);
    }
  }
  return out;
}

// ---- Results ------------------------------------------------------------------------------------
const shuffleKey = (id: string) => createHash('sha256').update(id).digest('hex');

/**
 * Per-block results. `members` are the people of the survey's audience (the ones who could answer). A block, and each
 * question inside it, only shows results with MIN_GROUP answers or more: below that, who said what stops being secret.
 */
export function buildBlockResults(input: {
  blocks: readonly SurveyBlock[];
  responses: readonly ClimateSurveyResponse[];
  members: readonly { positionId?: string }[];
  /** Registered Cargos (to show the titles a block is aimed at). */
  positions: readonly { id: string; title: string }[];
}): BlockResult[] {
  const { blocks, responses, members, positions } = input;

  return blocks.map(block => {
    const answeredBlock = responses.filter(r => block.questions.some(q => r.blockAnswers?.[q.id] !== undefined));
    const released = answeredBlock.length >= MIN_GROUP;

    const questions: QuestionResult[] = block.questions.map(q => {
      const answers = responses.flatMap(r => (r.blockAnswers?.[q.id] === undefined ? [] : [{ response: r, value: r.blockAnswers[q.id] }]));
      const base: QuestionResult = { questionId: q.id, text: q.text, type: q.type, responses: answers.length, released: released && answers.length >= MIN_GROUP };
      if (!base.released) return base;

      if (q.type === 'scale') {
        return { ...base, average: round1(answers.reduce((sum, a) => sum + Number(a.value), 0) / answers.length) };
      }
      if (q.type === 'choice') {
        return { ...base, options: (q.options ?? []).map(label => ({ label, count: answers.filter(a => a.value === label).length })) };
      }
      const comments: CampaignComment[] = answers
        .map(a => ({ id: a.response.id, questionId: q.id, text: String(a.value), hidden: !!a.response.hiddenTexts?.includes(q.id) }))
        .sort((a, b) => shuffleKey(`${a.id}:${q.id}`).localeCompare(shuffleKey(`${b.id}:${q.id}`)));
      return { ...base, comments };
    });

    return {
      blockId: block.id,
      title: block.title,
      ...(block.description ? { description: block.description } : {}),
      audience: block.audience,
      positionTitles: block.positionIds.map(id => positions.find(p => p.id === id)?.title ?? '(cargo arquivado)'),
      eligible: members.filter(m => memberSeesBlock(block, m)).length,
      responded: answeredBlock.length,
      released,
      questions
    };
  });
}

// ---- Templates of the organization ----------------------------------------------------------------
/** Fields of an organization template from a request body; `partial` (PATCH) reads only what was sent. */
export function parseTemplateFields(body: Body, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!partial || body.name !== undefined) out.name = requiredText(body.name, 'Nome do template', 80);
  if (!partial || body.description !== undefined) out.description = cleanText(body.description, 'Descrição', 300);
  if (body.focus !== undefined) out.focus = cleanText(body.focus, 'Área', 60) || null;
  if (body.basedOn !== undefined) out.basedOn = cleanText(body.basedOn, 'Origem', 60) || null;
  if (!partial || body.blocks !== undefined) {
    const blocks = parseBlocks(body.blocks); // no refs: a template suggests cargos by level/track, it never holds Cargo ids
    const empty = blocks.find(block => block.questions.length === 0);
    if (empty) throw new ValidationError(`O bloco “${empty.title}” não tem perguntas. Adicione uma ou remova o bloco.`);
    out.blocks = blocks;
  }
  return out;
}
