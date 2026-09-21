import React, { useEffect, useState } from 'react';
import { X, Eye, EyeOff, ShieldCheck, TrendingUp, TrendingDown, Users, Lock } from 'lucide-react';
import { CLIMATE_CATEGORIES, type BlockResult, type CampaignResults, type QuestionResult } from '../../types.js';
import { CATEGORY_LABEL, ZONE_LABEL } from '../../retention.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';
import { TenantApi } from '../../services/api.js';
import { formatDateSP } from '../../utils/dateUtils.js';
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_STYLE, ZONE_STYLE_LIGHT, formatEnps } from '../../utils/retentionUtils.js';

interface Props {
  campaignId: string;
  canEdit: boolean;
  onClose: () => void;
}

const Bar: React.FC<{ value: number; label: string }> = ({ value, label }) => (
  <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`${label}: ${value} de 10`}>
    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(value / 10) * 100}%` }} />
  </div>
);

const CommentList: React.FC<{ comments: NonNullable<QuestionResult['comments']>; canEdit: boolean; onToggle: (id: string, hidden: boolean, questionId?: string) => void }> = ({ comments, canEdit, onToggle }) => (
  <ul className="space-y-2">
    {comments.map(cm => (
      <li key={`${cm.id}-${cm.questionId ?? ''}`} className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${cm.hidden ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-white border-slate-200 text-slate-700'}`}>
        <span className={`leading-relaxed ${cm.hidden ? 'italic' : ''}`}>{cm.hidden ? 'Resposta ocultada pelo RH.' : cm.text}</span>
        {canEdit && (
          <button
            type="button"
            onClick={() => onToggle(cm.id, !cm.hidden, cm.questionId)}
            className="shrink-0 px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold flex items-center gap-1"
            title={cm.hidden ? 'Reexibir' : 'Ocultar (por exemplo, se citar uma pessoa)'}
          >
            {cm.hidden ? <><Eye className="w-3 h-3" /> Reexibir</> : <><EyeOff className="w-3 h-3" /> Ocultar</>}
          </button>
        )}
      </li>
    ))}
  </ul>
);

const QuestionBlockResult: React.FC<{ question: QuestionResult }> = ({ question }) => {
  if (question.type === 'scale' && question.average !== undefined) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3"><span className="text-slate-700">{question.text}</span><span className="font-mono text-slate-600 shrink-0">{question.average.toLocaleString('pt-BR')} <span className="text-slate-400">· {question.responses} resp.</span></span></div>
        <Bar value={question.average} label={question.text} />
      </div>
    );
  }
  if (question.type === 'choice' && question.options) {
    return (
      <div className="space-y-1.5">
        <div className="text-slate-700">{question.text} <span className="text-slate-400">· {question.responses} resp.</span></div>
        {question.options.map(o => {
          const pct = question.responses > 0 ? Math.round((o.count / question.responses) * 100) : 0;
          return (
            <div key={o.label} className="space-y-0.5">
              <div className="flex items-center justify-between gap-3 text-[11px]"><span className="text-slate-600">{o.label}</span><span className="font-mono text-slate-500 shrink-0">{o.count} ({pct}%)</span></div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`${o.label}: ${pct}%`}><div className="h-full rounded-full bg-indigo-400" style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

const BlockResultCard: React.FC<{ block: BlockResult; minGroup: number; canEdit: boolean; onToggle: (id: string, hidden: boolean, questionId?: string) => void }> = ({ block, minGroup, canEdit, onToggle }) => (
  <div className="rounded-xl border border-slate-200 p-4 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h5 className="font-bold text-slate-900 text-sm">{block.title}</h5>
        <p className="text-slate-500 flex items-center gap-1 mt-0.5"><Users className="w-3 h-3 shrink-0" /> {block.audience === 'all' ? 'Todos' : `Cargos: ${block.positionTitles.join(', ') || '—'}`}</p>
      </div>
      <span className="font-mono text-slate-600 shrink-0">{block.responded} de {block.eligible} responderam</span>
    </div>

    {!block.released ? (
      <p className="p-3 rounded-lg bg-slate-50 border border-dashed border-slate-300 text-slate-600 flex items-start gap-1.5">
        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        Este bloco tem {block.responded} {block.responded === 1 ? 'resposta' : 'respostas'}. O resultado é liberado a partir de {minGroup}, para proteger o anonimato.
      </p>
    ) : (
      <div className="space-y-3.5">
        {block.questions.map(q => (
          <div key={q.questionId}>
            {!q.released ? (
              <p className="text-slate-500">{q.text} <span className="text-slate-400">— {q.responses} {q.responses === 1 ? 'resposta' : 'respostas'} (menos de {minGroup}: não detalhado)</span></p>
            ) : q.type === 'text' ? (
              <div className="space-y-2">
                <div className="text-slate-700">{q.text} <span className="text-slate-400">· {q.responses} resp.</span></div>
                <CommentList comments={q.comments ?? []} canEdit={canEdit} onToggle={onToggle} />
              </div>
            ) : (
              <QuestionBlockResult question={q} />
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);

/** Results of one survey. Groups with few answers are never detailed: the screen says when they will be released. */
export const CampaignResultsModal: React.FC<Props> = ({ campaignId, canEdit, onClose }) => {
  const [results, setResults] = useState<CampaignResults | null>(null);
  const [error, setError] = useState('');
  const backdrop = useBackdropClose(onClose);

  const load = async () => {
    try {
      setResults(await TenantApi.getCampaignResults(campaignId));
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar o resultado.');
    }
  };

  useEffect(() => {
    void load();
  }, [campaignId]);

  const toggleComment = async (id: string, hidden: boolean, questionId?: string) => {
    try {
      await TenantApi.setCommentHidden(campaignId, id, hidden, questionId);
      await load();
    } catch (err: any) {
      setError(err.message || 'Não foi possível alterar o comentário.');
    }
  };

  const c = results?.campaign;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col border border-slate-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Resultado da pesquisa</span>
            <h3 className="text-base font-bold text-slate-900 truncate">{c?.name ?? 'Carregando…'}</h3>
            {c && (
              <p className="text-xs text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${CAMPAIGN_STATUS_STYLE[c.status]}`}>{CAMPAIGN_STATUS_LABEL[c.status]}</span>
                <span>{c.period}</span>
                {c.closesOn && <span>· encerra em {formatDateSP(c.closesOn)}</span>}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-xs overflow-y-auto min-h-0">
          {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">{error}</div>}
          {!results && !error && <p className="text-slate-400 py-6 text-center">Carregando…</p>}

          {results && c && (
            <>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-700">Participação</span>
                  <span className="font-mono text-slate-700">{c.responded} de {c.eligible} ({results.responseRate}%)</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden" role="img" aria-label={`Participação de ${results.responseRate}%`}>
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${results.responseRate}%` }} />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-900 flex items-start gap-2 leading-relaxed">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
                <span>
                  As respostas são <strong>anônimas</strong>: o sistema guarda apenas que a pessoa respondeu, nunca o que respondeu.
                  Por isso o resultado só é liberado a partir de <strong>{results.minGroup} respostas</strong>, e cada departamento só aparece com {results.minGroup} ou mais.
                </span>
              </div>

              {!results.released ? (
                <div className="p-6 rounded-xl border border-dashed border-slate-300 text-center text-slate-600">
                  {c.responded === 0
                    ? 'Ainda não há respostas.'
                    : `Há ${c.responded} ${c.responded === 1 ? 'resposta' : 'respostas'}. O resultado é liberado a partir de ${results.minGroup}, para proteger o anonimato.`}
                </div>
              ) : (
                <>
                  {results.enps && (
                    <div className="p-4 rounded-xl bg-slate-900 text-white space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">eNPS</span>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-4xl font-extrabold font-mono">{formatEnps(results.enps.score)}</span>
                        {results.zone && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${ZONE_STYLE_LIGHT[results.zone]}`}>{ZONE_LABEL[results.zone]}</span>}
                        {results.previous && (
                          <span className="text-[11px] text-slate-300 flex items-center gap-1">
                            {results.enps.score >= results.previous.enps ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-400" />}
                            antes: {formatEnps(results.previous.enps)} ({results.previous.name})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300">
                        {results.enps.promoters} promotores (9–10) · {results.enps.passives} neutros (7–8) · {results.enps.detractors} detratores (0–6)
                      </p>
                    </div>
                  )}

                  {results.categoryAverages && (
                    <div className="space-y-2.5">
                      <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Notas por categoria</h4>
                      {CLIMATE_CATEGORIES.map(cat => (
                        <div key={cat} className="space-y-1">
                          <div className="flex items-center justify-between"><span className="font-semibold text-slate-700">{CATEGORY_LABEL[cat]}</span><span className="font-mono text-slate-600">{results.categoryAverages![cat].toLocaleString('pt-BR')}</span></div>
                          <Bar value={results.categoryAverages![cat]} label={CATEGORY_LABEL[cat]} />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Por departamento</h4>
                    {results.departments.length === 0 ? (
                      <p className="text-slate-500">Nenhum departamento tem {results.minGroup} respostas ou mais ainda.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
                            <tr>
                              <th className="px-3 py-2">Departamento</th>
                              <th className="px-3 py-2">Respostas</th>
                              <th className="px-3 py-2">eNPS</th>
                              {CLIMATE_CATEGORIES.map(cat => <th key={cat} className="px-3 py-2">{CATEGORY_LABEL[cat]}</th>)}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {results.departments.map(d => (
                              <tr key={d.departmentId}>
                                <td className="px-3 py-2 font-semibold text-slate-800">{d.name}</td>
                                <td className="px-3 py-2 font-mono">{d.responses}</td>
                                <td className="px-3 py-2 font-mono">{formatEnps(d.enps)}</td>
                                {CLIMATE_CATEGORIES.map(cat => <td key={cat} className="px-3 py-2 font-mono">{d.categoryAverages[cat].toLocaleString('pt-BR')}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Comentários anônimos ({results.comments.filter(x => !x.hidden).length})</h4>
                    {results.comments.length === 0 ? (
                      <p className="text-slate-500">Ninguém deixou comentário.</p>
                    ) : (
                      <CommentList comments={results.comments} canEdit={canEdit} onToggle={(id, hidden) => void toggleComment(id, hidden)} />
                    )}
                  </div>

                  {results.blocks.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Perguntas estratégicas</h4>
                      {results.blocks.map(b => (
                        <BlockResultCard key={b.blockId} block={b} minGroup={results.minGroup} canEdit={canEdit} onToggle={(id, hidden, questionId) => void toggleComment(id, hidden, questionId)} />
                      ))}
                    </div>
                  )}
                </>
              )}

              {c.actionPlan && (
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Plano de ação</h4>
                  <p className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-900 whitespace-pre-line leading-relaxed">{c.actionPlan}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs">Fechar</button>
        </div>
      </div>
    </div>
  );
};
