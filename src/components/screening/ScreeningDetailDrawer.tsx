import React, { useEffect, useState } from 'react';
import { X, Sparkles, ClipboardList, Award, MessageSquareQuote, Download, RotateCw, AlertTriangle, ShieldAlert } from 'lucide-react';
import { TenantApi, ApiError } from '../../services/api.js';
import type { ScreeningDetail } from '../../types.js';
import { FLAG_LABEL, REQUIREMENT_LABEL, EVIDENCE_LABEL } from '../../screening.js';
import { fitLevel, FIT_LEVEL_LABEL } from '../../utils/aiEvaluation.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';
import { Card } from '../modules/SummaryParts.js';
import { formatDateTimeSP } from '../../utils/dateUtils.js';

const FLAG_TONE_CLASS: Record<string, string> = {
  good: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  info: 'bg-slate-100 text-slate-700 border-slate-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  bad: 'bg-rose-50 text-rose-800 border-rose-200'
};

const REQ_TONE: Record<string, string> = {
  met: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  partial: 'text-amber-700 bg-amber-50 border-amber-200',
  not_met: 'text-rose-700 bg-rose-50 border-rose-200',
  no_evidence: 'text-slate-500 bg-slate-50 border-slate-200'
};

export const ScreeningDetailDrawer: React.FC<{ fileId: string; canUpload: boolean; onClose: () => void; onChanged: () => void }> = ({
  fileId, canUpload, onClose, onChanged
}) => {
  const backdrop = useBackdropClose(onClose);
  const [detail, setDetail] = useState<ScreeningDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setDetail(await TenantApi.getScreeningDetail(fileId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar este currículo.');
    }
  };

  useEffect(() => { void load(); }, [fileId]);

  const reanalyze = async () => {
    if (!confirm('Reanalisar conta como uma nova leitura de IA (entra no limite mensal). Continuar?')) return;
    try {
      setBusy(true);
      await TenantApi.analyzeResume(fileId, true);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao reanalisar.');
    } finally {
      setBusy(false);
    }
  };

  const analysis = detail?.analysis;
  const level = analysis ? fitLevel(analysis.overallScore) : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs" {...backdrop}>
      <div className="w-full max-w-xl h-full bg-white shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{detail?.file.fileName ?? 'Currículo'}</h3>
            {detail?.candidate && <p className="text-xs text-slate-500">{detail.candidate.name} · {detail.candidate.email}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-4.5 h-4.5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">{error}</div>}
          {!detail && !error && <div className="text-center py-10 text-slate-400 text-xs">Carregando…</div>}

          {detail && (
            <>
              {detail.flags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {detail.flags.map(f => (
                    <span key={f} title={FLAG_LABEL[f].hint} className={`px-2 py-1 rounded-lg border text-[11px] font-semibold ${FLAG_TONE_CLASS[FLAG_LABEL[f].tone]}`}>
                      {FLAG_LABEL[f].label}
                    </span>
                  ))}
                </div>
              )}

              {detail.file.status === 'needs_data' && canUpload && (
                <CompleteDataForm
                  fileId={fileId}
                  suggestedName={analysis?.extraction.name}
                  suggestedEmail={analysis?.extraction.email}
                  reason={detail.file.failureMessage}
                  onDone={async () => { await load(); onChanged(); }}
                />
              )}

              {analysis ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <ScoreBox label="Fit geral" value={analysis.overallScore} highlight />
                    <ScoreBox label="Técnica" value={analysis.technicalScore} />
                    <ScoreBox label="Cultural" value={analysis.culturalScore} unknownLabel="Não verificável" />
                  </div>
                  {level && (
                    <p className="text-xs text-slate-500">
                      Aderência: <span className="font-semibold text-slate-700">{FIT_LEVEL_LABEL[level]}</span>
                      {detail.culturalFitThreshold != null && analysis.culturalScore != null && (
                        <> · Corte cultural do DNA: {detail.culturalFitThreshold}%</>
                      )}
                    </p>
                  )}

                  <Card icon={<MessageSquareQuote className="w-4 h-4" />} title="Parecer">
                    <p className="text-xs text-slate-600 leading-relaxed">{analysis.explanation}</p>
                  </Card>

                  <Card icon={<ClipboardList className="w-4 h-4" />} title={`Requisitos do Cargo (${analysis.requirements.filter(r => r.status === 'met').length} de ${analysis.requirements.length} atendidos)`}>
                    <ul className="space-y-1.5">
                      {analysis.requirements.map(r => (
                        <li key={r.id} className={`px-2.5 py-1.5 rounded-lg border text-xs ${REQ_TONE[r.status]}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{r.requirement}</span>
                            <span className="shrink-0">{REQUIREMENT_LABEL[r.status]}</span>
                          </div>
                          {r.evidence && <p className="mt-0.5 italic opacity-80">"{r.evidence}"</p>}
                        </li>
                      ))}
                    </ul>
                  </Card>

                  <Card icon={<Award className="w-4 h-4" />} title="Aderência ao DNA Cultural, por pilar">
                    <ul className="space-y-2">
                      {analysis.pillars.map(p => (
                        <li key={p.id} className="text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-700">{p.name}</span>
                            <span className="text-slate-500">{p.confidence === 'none' ? 'Sem evidência' : `${p.score}% · ${EVIDENCE_LABEL[p.confidence]}`}</span>
                          </div>
                          <p className="text-slate-500 mt-0.5">{p.analysis}</p>
                          {p.evidence && <p className="italic text-slate-400">"{p.evidence}"</p>}
                        </li>
                      ))}
                    </ul>
                  </Card>

                  {(analysis.strengths.length > 0 || analysis.gaps.length > 0) && (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {analysis.strengths.length > 0 && (
                        <div>
                          <p className="font-semibold text-slate-700 mb-1">Pontos fortes</p>
                          <ul className="space-y-0.5 text-slate-600 list-disc pl-4">{analysis.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </div>
                      )}
                      {analysis.gaps.length > 0 && (
                        <div>
                          <p className="font-semibold text-slate-700 mb-1">Pontos de atenção</p>
                          <ul className="space-y-0.5 text-slate-600 list-disc pl-4">{analysis.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  )}

                  {analysis.interviewQuestions.length > 0 && (
                    <Card icon={<Sparkles className="w-4 h-4" />} title="Perguntas sugeridas para a entrevista">
                      <ul className="space-y-1 text-xs text-slate-600 list-disc pl-4">{analysis.interviewQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                    </Card>
                  )}

                  {(analysis.instructionsInDocument || analysis.hiddenText) && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>Este arquivo continha texto oculto ou uma tentativa de instruir a IA. A nota acima ignorou essa tentativa; revise o currículo com atenção.</span>
                    </div>
                  )}

                  <div className="text-[11px] text-slate-400 border-t border-slate-100 pt-3">
                    Lido em {formatDateTimeSP(detail.file.analyzedAt ?? detail.file.uploadedAt)}{analysis.model ? ` · modelo ${analysis.model}` : ''}
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> Este arquivo ainda não foi lido pela IA.
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => TenantApi.downloadResume(detail.file.id, detail.file.fileName)}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Baixar currículo original
                </button>
                {canUpload && analysis && (
                  <button
                    type="button"
                    onClick={reanalyze}
                    disabled={busy}
                    className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Reanalisar
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const ScoreBox: React.FC<{ label: string; value: number | null; highlight?: boolean; unknownLabel?: string }> = ({ label, value, highlight, unknownLabel }) => (
  <div className={`p-2.5 rounded-xl border text-center ${highlight ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
    <div className={`text-[10px] font-bold uppercase ${highlight ? 'text-indigo-200' : 'text-slate-400'}`}>{label}</div>
    <div className="text-lg font-bold font-mono">{value == null ? (unknownLabel ?? '—') : `${value}%`}</div>
  </div>
);

/** A IA já leu o arquivo mas faltou (ou não bateu) um dado para identificar o candidato: o RH confirma nome e e-mail antes de o candidato ser criado. */
const CompleteDataForm: React.FC<{
  fileId: string; suggestedName?: string; suggestedEmail?: string; reason?: string; onDone: () => Promise<void>;
}> = ({ fileId, suggestedName, suggestedEmail, reason, onDone }) => {
  const [name, setName] = useState(suggestedName ?? '');
  const [email, setEmail] = useState(suggestedEmail ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setBusy(true);
      setErr(null);
      await TenantApi.completeResume(fileId, name.trim(), email.trim());
      await onDone();
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Não foi possível confirmar os dados.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5">
      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Precisa de dados para criar o candidato</p>
      {reason && <p className="text-[11px] text-amber-700">{reason}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" required className="px-2.5 py-1.5 rounded-lg border border-amber-300 text-xs bg-white" />
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="E-mail" required className="px-2.5 py-1.5 rounded-lg border border-amber-300 text-xs bg-white" />
      </div>
      {err && <p className="text-[11px] text-rose-600">{err}</p>}
      <button type="submit" disabled={busy} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-60">
        {busy ? 'Confirmando…' : 'Confirmar e criar candidato'}
      </button>
    </form>
  );
};
