import React, { useEffect, useState } from 'react';
import { CheckCircle2, ShieldCheck, ClipboardList } from 'lucide-react';
import { CLIMATE_CATEGORIES, type ClimateCategory, type PendingSurvey, type SurveyAnswerValue, type SurveyQuestion } from '../../types.js';
import { CATEGORY_LABEL } from '../../retention.js';
import { TenantApi } from '../../services/api.js';
import { formatDateSP } from '../../utils/dateUtils.js';

/** Fired after an answer is sent, so the "you have a survey" notice can disappear. */
export const CLIMATE_ANSWERED_EVENT = 'talentcloud:climate-answered';

const SCALE = Array.from({ length: 11 }, (_, i) => i);

const ScoreRow: React.FC<{ label: string; value: number | null; onPick: (n: number) => void; low?: string; high?: string }> = ({ label, value, onPick, low, high }) => (
  <fieldset className="space-y-1.5">
    <legend className="text-xs font-semibold text-slate-800">{label}</legend>
    <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5" role="radiogroup" aria-label={label}>
      {SCALE.map(n => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onPick(n)}
          className={`h-9 rounded-lg border text-xs font-bold transition-colors ${
            value === n ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
    {(low || high) && (
      <div className="flex justify-between text-[10px] text-slate-400"><span>{low}</span><span>{high}</span></div>
    )}
  </fieldset>
);

/** One strategic question, by type: a 0–10 scale, a single choice or free text. */
const QuestionField: React.FC<{ question: SurveyQuestion; value: SurveyAnswerValue | undefined; onChange: (value: SurveyAnswerValue | undefined) => void }> = ({ question, value, onChange }) => {
  const label = `${question.text}${question.required ? '' : ' (opcional)'}`;
  if (question.type === 'scale') {
    return <ScoreRow label={label} value={typeof value === 'number' ? value : null} onPick={onChange} low="0 = discordo totalmente" high="10 = concordo totalmente" />;
  }
  if (question.type === 'choice') {
    return (
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-semibold text-slate-800">{label}</legend>
        <div className="space-y-1.5" role="radiogroup" aria-label={question.text}>
          {(question.options ?? []).map(option => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={value === option}
              onClick={() => onChange(option)}
              className={`w-full px-3 py-2 rounded-xl border text-left text-xs transition-colors ${
                value === option ? 'bg-indigo-600 border-indigo-600 text-white font-semibold' : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-800">{label}</label>
      <textarea
        rows={3}
        maxLength={1000}
        lang="pt-BR"
        spellCheck
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        aria-label={question.text}
        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500"
      />
    </div>
  );
};

const isAnswered = (value: SurveyAnswerValue | undefined) => value !== undefined && !(typeof value === 'string' && value.trim() === '');

const SurveyForm: React.FC<{ survey: PendingSurvey; onDone: () => Promise<void> }> = ({ survey, onDone }) => {
  const [enps, setEnps] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Partial<Record<ClimateCategory, number>>>({});
  const [answers, setAnswers] = useState<Record<string, SurveyAnswerValue>>({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setAnswer = (id: string, value: SurveyAnswerValue | undefined) =>
    setAnswers(current => {
      const next = { ...current };
      if (value === undefined || (typeof value === 'string' && value === '')) delete next[id];
      else next[id] = value;
      return next;
    });

  const blocksDone = survey.blocks.every(b => b.questions.every(q => !q.required || isAnswered(answers[q.id])));
  const complete = enps !== null && CLIMATE_CATEGORIES.every(c => ratings[c] !== undefined) && blocksDone;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complete) {
      setError('Responda a recomendação, avalie todas as categorias e responda as perguntas obrigatórias.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      await TenantApi.submitSurveyAnswer(survey.campaignId, {
        enps: enps!,
        categories: ratings as Record<ClimateCategory, number>,
        ...(survey.blocks.length > 0 ? { answers } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {})
      });
      window.dispatchEvent(new Event(CLIMATE_ANSWERED_EVENT));
      await onDone();
    } catch (err: any) {
      setError(err.message || 'Não foi possível enviar sua resposta.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5 pt-2">
      <ScoreRow
        label="Em uma escala de 0 a 10, o quanto você recomendaria esta organização como um bom lugar para trabalhar?"
        value={enps}
        onPick={setEnps}
        low="0 = de jeito nenhum"
        high="10 = com certeza"
      />

      <div className="space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Como você avalia (de 0 a 10)</h4>
        {CLIMATE_CATEGORIES.map(c => (
          <ScoreRow key={c} label={CATEGORY_LABEL[c]} value={ratings[c] ?? null} onPick={(n) => setRatings(current => ({ ...current, [c]: n }))} />
        ))}
      </div>

      {survey.blocks.map(block => (
        <section key={block.id} className="space-y-4 pt-4 border-t border-slate-100">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">{block.title}</h4>
            {block.description && <p className="text-[11px] text-slate-500 mt-0.5">{block.description}</p>}
          </div>
          {block.questions.map(q => (
            <QuestionField key={q.id} question={q} value={answers[q.id]} onChange={(value) => setAnswer(q.id, value)} />
          ))}
        </section>
      ))}

      <div className="space-y-1.5">
        <label htmlFor={`comment-${survey.campaignId}`} className="text-xs font-semibold text-slate-800">Quer deixar um comentário? (opcional)</label>
        <textarea
          id={`comment-${survey.campaignId}`}
          rows={3}
          maxLength={1000}
          lang="pt-BR"
          spellCheck
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Conte o que está funcionando bem e o que poderia melhorar. Evite citar nomes de pessoas."
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500"
        />
      </div>

      <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-900 flex items-start gap-2 leading-relaxed">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
        <span>Sua resposta é <strong>anônima</strong>. O sistema registra apenas que você respondeu (para você não responder duas vezes), nunca o que você respondeu.</span>
      </div>

      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}

      <div className="flex justify-end">
        <button type="submit" disabled={busy || !complete} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs disabled:opacity-50">
          {busy ? 'Enviando…' : 'Enviar resposta'}
        </button>
      </div>
    </form>
  );
};

/** Aba Responder: as pesquisas abertas para a pessoa. Qualquer colaborador com a rotina "Pesquisa de Clima". */
export const SurveyAnswerPanel: React.FC<{ tenantId?: string }> = ({ tenantId }) => {
  const [surveys, setSurveys] = useState<PendingSurvey[] | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    try {
      const list = await TenantApi.getPendingSurveys();
      setSurveys(list);
      setOpenId(current => current ?? list.find(s => !s.answered)?.campaignId ?? null);
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar as pesquisas.');
      setSurveys([]);
    }
  };

  useEffect(() => {
    void load();
  }, [tenantId]);

  if (surveys === null) return <p className="text-xs text-slate-400 py-8 text-center">Carregando…</p>;

  return (
    <div className="space-y-4 max-w-3xl">
      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</div>}

      {surveys.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500 space-y-2">
          <ClipboardList className="w-6 h-6 mx-auto text-slate-300" />
          <div className="font-semibold text-slate-700">Nenhuma pesquisa aberta para você agora</div>
          <div>Quando uma pesquisa de clima for publicada para o seu grupo, ela aparece aqui.</div>
        </div>
      ) : (
        surveys.map(s => (
          <div key={s.campaignId} className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">{s.name}</h3>
                <p className="text-[11px] text-slate-500">
                  Período {s.period}{s.closesOn ? ` · responda até ${formatDateSP(s.closesOn)}` : ''}
                </p>
              </div>
              {s.answered && (
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[10px] flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="w-3 h-3" /> Respondida
                </span>
              )}
            </div>
            {s.description && <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{s.description}</p>}

            {s.answered ? (
              <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl p-3">Obrigado! Sua resposta foi registrada de forma anônima.</p>
            ) : openId === s.campaignId ? (
              <SurveyForm survey={s} onDone={async () => { setOpenId(null); await load(); }} />
            ) : (
              <button onClick={() => setOpenId(s.campaignId)} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs">Responder agora</button>
            )}
          </div>
        ))
      )}
    </div>
  );
};
