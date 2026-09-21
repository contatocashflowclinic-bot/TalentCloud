import React from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Users, AlertTriangle } from 'lucide-react';
import {
  CAREER_TRACKS, POSITION_LEVELS, QUESTION_TYPES, SURVEY_LIMITS,
  type CareerTrack, type PositionLevel, type PositionOption, type SurveyBlock, type SurveyQuestion, type SurveyQuestionType
} from '../../types.js';
import { MIN_GROUP } from '../../retention.js';
import { CAREER_TRACK_LABEL, noHints, suggestPositions } from '../../surveyTemplates.js';

interface Props {
  blocks: SurveyBlock[];
  onChange: (blocks: SurveyBlock[]) => void;
  /**
   * template: a block suggests Cargos by their level / career track (attributes of the Cargos module) ·
   * campaign: a block points to the Cargos registered in the organization.
   */
  mode: 'template' | 'campaign';
  /** Registered Cargos (campaign mode), with how many people are linked to each. */
  positions?: PositionOption[];
  /** Department names, to group the Cargos. */
  departments?: { id: string; name: string }[];
}

export const TYPE_LABEL: Record<SurveyQuestionType, string> = {
  scale: 'Escala de 0 a 10',
  choice: 'Escolha única',
  text: 'Texto livre'
};

export const localId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/** The blocks of a template as blocks of a new survey: fresh ids and, for blocks aimed at cargos, the registered Cargos that match the suggestion. */
export const blocksFromTemplate = (blocks: SurveyBlock[], positions: PositionOption[]): SurveyBlock[] =>
  blocks.map(b => ({
    ...b,
    id: localId('b'),
    positionIds: b.audience === 'roles' ? suggestPositions(b.targetHints, positions).map(p => p.id) : [],
    questions: b.questions.map(q => ({ ...q, id: localId('q') }))
  }));

/** A copy of a survey's blocks (new ids), keeping the registered cargos they point to. */
export const duplicateBlocks = (blocks: SurveyBlock[]): SurveyBlock[] =>
  blocks.map(b => ({ ...b, id: localId('b'), questions: b.questions.map(q => ({ ...q, id: localId('q') })) }));

const newQuestion = (): SurveyQuestion => ({ id: localId('q'), text: '', type: 'scale', required: true });
export const newBlock = (): SurveyBlock => ({
  id: localId('b'), title: '', audience: 'all', positionIds: [], targetHints: noHints(), questions: [newQuestion()]
});

const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500';
const smallBtn = 'p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent';

const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
};

const toggle = <T,>(list: readonly T[], item: T): T[] => (list.includes(item) ? list.filter(x => x !== item) : [...list, item]);

/**
 * Editor of the strategic-question blocks of a survey (or template). Every block is aimed at everyone or at some Cargos of
 * the Cargos module (never typed); each question is a 0–10 scale, a single choice or free text.
 */
export const BlocksEditor: React.FC<Props> = ({ blocks, onChange, mode, positions = [], departments = [] }) => {
  const totalQuestions = blocks.reduce((sum, b) => sum + b.questions.length, 0);

  const setBlock = (index: number, patch: Partial<SurveyBlock>) => onChange(blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  const setQuestion = (bi: number, qi: number, patch: Partial<SurveyQuestion>) =>
    setBlock(bi, { questions: blocks[bi].questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) });

  const peopleIn = (block: SurveyBlock) => positions.filter(p => block.positionIds.includes(p.id)).reduce((sum, p) => sum + p.count, 0);

  // Cargos grouped by department (registered data), departments without cargos left out
  const groups = departments
    .map(d => ({ department: d, items: positions.filter(p => p.departmentId === d.id) }))
    .filter(g => g.items.length > 0);
  const orphans = positions.filter(p => !departments.some(d => d.id === p.departmentId));

  const renderPositions = (bi: number, block: SurveyBlock, items: PositionOption[], title: string) => {
    const ids = items.map(p => p.id);
    const allChosen = ids.every(id => block.positionIds.includes(id));
    return (
      <div key={title} className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-600 text-[11px] uppercase tracking-wider">{title}</span>
          <button
            type="button"
            className="text-[11px] font-semibold text-indigo-600 hover:underline"
            onClick={() => setBlock(bi, { positionIds: allChosen ? block.positionIds.filter(id => !ids.includes(id)) : [...new Set([...block.positionIds, ...ids])] })}
          >
            {allChosen ? 'Limpar' : 'Marcar todos'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {items.map(p => (
            <label key={p.id} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={block.positionIds.includes(p.id)} onChange={() => setBlock(bi, { positionIds: toggle(block.positionIds, p.id) })} />
              <span className="truncate">{p.title}</span> <span className="text-slate-400 shrink-0">({p.count})</span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {blocks.length === 0 && (
        <p className="p-4 rounded-xl border border-dashed border-slate-300 text-center text-slate-500">
          Nenhum bloco de perguntas estratégicas. A pesquisa terá só as perguntas-padrão (recomendação, cinco categorias e comentário).
        </p>
      )}

      {blocks.map((block, bi) => (
        <div key={block.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2 min-w-0">
              <input
                type="text" maxLength={80} value={block.title} aria-label={`Título do bloco ${bi + 1}`}
                onChange={(e) => setBlock(bi, { title: e.target.value })}
                placeholder="Título do bloco (ex.: Para quem lidera pessoas)" className={`${inputCls} font-semibold`}
              />
              <input
                type="text" maxLength={300} value={block.description ?? ''} aria-label={`Descrição do bloco ${bi + 1}`}
                onChange={(e) => setBlock(bi, { description: e.target.value })}
                placeholder="Explicação curta para quem responde (opcional)" className={inputCls}
              />
            </div>
            <div className="flex items-center shrink-0">
              <button type="button" className={smallBtn} disabled={bi === 0} onClick={() => onChange(move(blocks, bi, bi - 1))} aria-label="Subir bloco"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" className={smallBtn} disabled={bi === blocks.length - 1} onClick={() => onChange(move(blocks, bi, bi + 1))} aria-label="Descer bloco"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" className={`${smallBtn} hover:!text-rose-600 hover:!bg-rose-50`} onClick={() => onChange(blocks.filter((_, i) => i !== bi))} aria-label="Remover bloco"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="font-semibold text-slate-700 flex items-center gap-1.5 mb-1"><Users className="w-3.5 h-3.5" /> Quem responde este bloco</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name={`aud-${block.id}`} checked={block.audience === 'all'} onChange={() => setBlock(bi, { audience: 'all' })} /> Todos
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name={`aud-${block.id}`} checked={block.audience === 'roles'} onChange={() => setBlock(bi, { audience: 'roles' })} /> Só alguns cargos
              </label>
            </div>

            {block.audience === 'roles' && mode === 'template' && (
              <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
                <p className="text-[11px] text-slate-500">
                  Ao usar o template, o sistema sugere os <strong>Cargos cadastrados</strong> que combinam com o nível e a trilha indicados abaixo, e você confirma. Sem nada marcado, você escolhe os cargos na hora.
                </p>
                <div>
                  <span className="block font-semibold text-slate-700 mb-1">Nível do cargo</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {POSITION_LEVELS.map((level: PositionLevel) => (
                      <label key={level} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={block.targetHints.levels.includes(level)} onChange={() => setBlock(bi, { targetHints: { ...block.targetHints, levels: toggle(block.targetHints.levels, level) } })} /> {level}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="block font-semibold text-slate-700 mb-1">Trilha de carreira</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {CAREER_TRACKS.map((track: CareerTrack) => (
                      <label key={track} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={block.targetHints.careerTracks.includes(track)} onChange={() => setBlock(bi, { targetHints: { ...block.targetHints, careerTracks: toggle(block.targetHints.careerTracks, track) } })} /> {CAREER_TRACK_LABEL[track]}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {block.audience === 'roles' && mode === 'campaign' && (
              <div className="space-y-1.5">
                <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-3 max-h-56 overflow-y-auto">
                  {positions.length === 0 && <p className="text-slate-500">Nenhum cargo ativo cadastrado. Cadastre os cargos no módulo Cargos.</p>}
                  {groups.map(g => renderPositions(bi, block, g.items, g.department.name))}
                  {orphans.length > 0 && renderPositions(bi, block, orphans, 'Outros')}
                </div>
                {block.positionIds.length === 0 ? (
                  <p className="text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Escolha ao menos um cargo, ou o bloco não poderá ser publicado.</p>
                ) : peopleIn(block) < MIN_GROUP ? (
                  <p className="text-amber-700 flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Só {peopleIn(block)} {peopleIn(block) === 1 ? 'pessoa vê' : 'pessoas veem'} este bloco: o resultado dele só é liberado com {MIN_GROUP} respostas (proteção do anonimato).</p>
                ) : (
                  <p className="text-slate-500">{peopleIn(block)} pessoas veem este bloco.</p>
                )}
              </div>
            )}
          </fieldset>

          <div className="space-y-2.5">
            {block.questions.map((q, qi) => (
              <div key={q.id} className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-[11px] font-bold text-slate-400 w-5 shrink-0">{qi + 1}.</span>
                  <textarea
                    rows={2} maxLength={300} value={q.text} aria-label={`Pergunta ${qi + 1} do bloco ${bi + 1}`}
                    onChange={(e) => setQuestion(bi, qi, { text: e.target.value })} lang="pt-BR" spellCheck
                    placeholder="Escreva a pergunta (afirmações funcionam bem na escala: quanto maior a nota, melhor)" className={inputCls}
                  />
                  <div className="flex items-center shrink-0">
                    <button type="button" className={smallBtn} disabled={qi === 0} onClick={() => setBlock(bi, { questions: move(block.questions, qi, qi - 1) })} aria-label="Subir pergunta"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button type="button" className={smallBtn} disabled={qi === block.questions.length - 1} onClick={() => setBlock(bi, { questions: move(block.questions, qi, qi + 1) })} aria-label="Descer pergunta"><ArrowDown className="w-3.5 h-3.5" /></button>
                    <button type="button" className={`${smallBtn} hover:!text-rose-600 hover:!bg-rose-50`} onClick={() => setBlock(bi, { questions: block.questions.filter((_, i) => i !== qi) })} aria-label="Remover pergunta"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-7">
                  <select
                    value={q.type} aria-label="Tipo de pergunta"
                    onChange={(e) => {
                      const type = e.target.value as SurveyQuestionType;
                      setQuestion(bi, qi, { type, required: type !== 'text', ...(type === 'choice' ? { options: q.options?.length ? q.options : ['', ''] } : { options: undefined }) });
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
                  >
                    {QUESTION_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={q.required} onChange={(e) => setQuestion(bi, qi, { required: e.target.checked })} /> Resposta obrigatória
                  </label>
                </div>

                {q.type === 'choice' && (
                  <div className="pl-7">
                    <textarea
                      rows={3} aria-label="Opções da pergunta" value={(q.options ?? []).join('\n')}
                      onChange={(e) => setQuestion(bi, qi, { options: e.target.value.split('\n') })}
                      placeholder={'Uma opção por linha\nEx.: Toda semana\nA cada 15 dias'} className={inputCls}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">De 2 a {SURVEY_LIMITS.options} opções.</p>
                  </div>
                )}
              </div>
            ))}

            <button
              type="button" disabled={block.questions.length >= SURVEY_LIMITS.questionsPerBlock}
              onClick={() => setBlock(bi, { questions: [...block.questions, newQuestion()] })}
              className="px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold flex items-center gap-1.5 disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar pergunta
            </button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button" disabled={blocks.length >= SURVEY_LIMITS.blocks}
          onClick={() => onChange([...blocks, newBlock()])}
          className="px-3 py-2 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-semibold flex items-center gap-1.5 disabled:opacity-40"
        >
          <Plus className="w-4 h-4" /> Adicionar bloco de perguntas
        </button>
        <span className="text-[11px] text-slate-400">{blocks.length} de {SURVEY_LIMITS.blocks} blocos · {totalQuestions} de {SURVEY_LIMITS.questions} perguntas</span>
      </div>
    </div>
  );
};
