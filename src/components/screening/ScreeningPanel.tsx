import React, { useEffect, useMemo, useState } from 'react';
import { Filter, CheckSquare, Square, ChevronRight, PauseCircle, Archive, Loader2, AlertTriangle, UserCheck, CheckCircle2, X } from 'lucide-react';
import { TenantApi, ApiError } from '../../services/api.js';
import type { JobOpening, ScreeningBoard, ScreeningRow, ScreeningDecisionAction } from '../../types.js';
import { FLAG_LABEL, matchesFilter, type ScreeningFilter } from '../../screening.js';
import { fitLevel, FIT_LEVEL_LABEL, type FitLevel } from '../../utils/aiEvaluation.js';
import { useScreeningAccess } from '../../hooks/useScreeningAccess.js';
import { useBackdropClose } from '../../hooks/useBackdropClose.js';
import { ResumeUploadZone } from './ResumeUploadZone.js';
import { ScreeningDetailDrawer } from './ScreeningDetailDrawer.js';

const FIT_BADGE: Record<FitLevel, string> = {
  high: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-rose-100 text-rose-800'
};

/** Texto da confirmação depois de uma decisão em lote (o que "Avançar" faz não aparece na tela de Triagem, que não mostra etapas — sem este aviso, parece que nada aconteceu). */
const ACTION_DONE_LABEL: Record<ScreeningDecisionAction, string> = {
  advance: 'avançada(s) para a próxima etapa',
  hold: 'colocada(s) em espera',
  archive: 'arquivada(s)'
};

const FILTERS: { id: ScreeningFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'high', label: 'Alta aderência' },
  { id: 'medium', label: 'Aderência média' },
  { id: 'low', label: 'Aderência baixa' },
  { id: 'second_look', label: 'Segunda olhada' },
  { id: 'review', label: 'Revisar' },
  { id: 'no_resume', label: 'Sem currículo' },
  { id: 'archived', label: 'Arquivadas' }
];

export const ScreeningPanel: React.FC<{
  job: JobOpening;
  onDataChanged?: () => void;
  /** Candidatura sem currículo lido pela Triagem (ex.: veio do portal, ou foi avaliada antes desta funcionalidade existir):
   * abre o resumo já existente da candidatura em vez de não fazer nada ao clicar na linha. */
  onOpenApplication?: (applicationId: string) => void;
}> = ({ job, onDataChanged, onOpenApplication }) => {
  const { canUpload, canDecide } = useScreeningAccess();
  const [board, setBoard] = useState<ScreeningBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allowanceNotice, setAllowanceNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<ScreeningFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'warn'; message: string } | null>(null);

  const load = async () => {
    try {
      const [b, allowance] = await Promise.all([
        TenantApi.getScreeningBoard(job.id),
        canUpload ? TenantApi.getScreeningAllowance() : Promise.resolve(null)
      ]);
      setBoard(b);
      setError(null);
      if (allowance && !allowance.available) setAllowanceNotice(allowance.message ?? 'A IA não está disponível agora.');
      else if (allowance?.remaining != null) setAllowanceNotice(`Restam ${allowance.remaining} análises com IA este mês para a sua organização.`);
      else setAllowanceNotice(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a triagem desta vaga.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); void load(); }, [job.id]);

  const refresh = () => { void load(); onDataChanged?.(); };

  const rows = useMemo(() => (board ? board.rows.filter(r => matchesFilter(r, filter)) : []), [board, filter]);

  const toggle = (id: string) =>
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const selectByFilter = (f: ScreeningFilter) => {
    if (!board) return;
    setSelected(new Set(board.rows.filter(r => matchesFilter(r, f)).map(r => r.applicationId)));
  };

  const selectedRows = rows.filter(r => selected.has(r.applicationId));

  const runDecision = async (action: ScreeningDecisionAction, reason?: string) => {
    if (selectedRows.length === 0) return;
    const nameOf = new Map(selectedRows.map(r => [r.applicationId, r.candidateName]));
    try {
      setBusyAction(true);
      setFeedback(null);
      const results = await TenantApi.decideScreening(
        job.id, action,
        selectedRows.map(r => ({ applicationId: r.applicationId, fromStageId: r.stageId })),
        reason
      );
      const ok = results.filter(r => r.ok);
      const failed = results.filter(r => !r.ok);
      if (failed.length === 0) {
        setFeedback({ tone: 'success', message: `${ok.length} candidatura(s) ${ACTION_DONE_LABEL[action]}.` });
      } else {
        const detail = failed.map(r => `${nameOf.get(r.applicationId) ?? r.applicationId}: ${r.message ?? 'falha desconhecida'}`).join(' · ');
        setFeedback({
          tone: 'warn',
          message: ok.length > 0
            ? `${ok.length} candidatura(s) ${ACTION_DONE_LABEL[action]}. ${failed.length} não puderam ser processadas — ${detail}`
            : `Nenhuma candidatura pôde ser processada — ${detail}`
        });
      }
      setSelected(new Set());
      setArchiving(false);
      refresh();
    } catch (err) {
      setFeedback({ tone: 'warn', message: err instanceof ApiError ? err.message : 'Falha ao aplicar a decisão.' });
    } finally {
      setBusyAction(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-slate-400 text-xs">Carregando triagem…</div>;
  if (error && !board) return <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">{error}</div>;
  if (!board) return null;

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
            feedback.tone === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <span className="flex items-start gap-1.5">
            {feedback.tone === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
            {feedback.message}
          </span>
          <button onClick={() => setFeedback(null)} className="shrink-0 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {board.criteria.blockers.length > 0 && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs space-y-1">
          <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> A triagem não pode rodar ainda:</p>
          <ul className="list-disc pl-5">{board.criteria.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </div>
      )}
      {board.criteria.warnings.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          {board.criteria.warnings.join(' ')}
        </div>
      )}

      {canUpload && board.criteria.blockers.length === 0 && (
        <>
          {allowanceNotice && <p className="text-[11px] text-slate-500">{allowanceNotice}</p>}
          <ResumeUploadZone jobId={job.id} onFinished={refresh} />
        </>
      )}

      {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">{error}</div>}

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
              filter === f.id ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {canDecide && (
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <button onClick={() => selectByFilter('high')} className="text-indigo-600 hover:underline">Selecionar Alta aderência</button>
          <button onClick={() => selectByFilter('second_look')} className="text-indigo-600 hover:underline">Selecionar Segunda olhada</button>
          {selected.size > 0 && <button onClick={() => setSelected(new Set())} className="text-slate-400 hover:underline">Limpar seleção</button>}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 text-[10px] uppercase tracking-wide">
              {canDecide && <th className="w-8 px-3 py-2" />}
              <th className="text-left px-3 py-2">Candidato</th>
              <th className="text-left px-3 py-2">Aderência</th>
              <th className="text-left px-3 py-2">Requisitos</th>
              <th className="text-left px-3 py-2">Selos</th>
              <th className="w-8 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map(row => (
              <ScreeningTableRow
                key={row.applicationId}
                row={row}
                canDecide={canDecide}
                checked={selected.has(row.applicationId)}
                onToggle={() => toggle(row.applicationId)}
                clickable={!!row.file || !!onOpenApplication}
                onOpen={() => (row.file ? setOpenFileId(row.file.id) : onOpenApplication?.(row.applicationId))}
              />
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-slate-400">Nenhuma candidatura neste filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {board.pending.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs">
          <p className="font-semibold text-slate-600 mb-1.5">Arquivos ainda sem candidatura ({board.pending.length})</p>
          <ul className="space-y-1">
            {board.pending.map(f => (
              <li key={f.id} className="flex items-center justify-between text-slate-500">
                <span className="truncate">{f.fileName}</span>
                <PendingBadge status={f.status} failureMessage={f.failureMessage} onComplete={f.status === 'needs_data' ? () => setOpenFileId(f.id) : undefined} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {canDecide && selectedRows.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3 text-xs">
          <span className="font-semibold">{selectedRows.length} selecionada(s)</span>
          <button disabled={busyAction} onClick={() => void runDecision('advance')} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1 disabled:opacity-60">
            <ChevronRight className="w-3.5 h-3.5" /> Avançar
          </button>
          <button disabled={busyAction} onClick={() => void runDecision('hold')} className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 flex items-center gap-1 disabled:opacity-60">
            <PauseCircle className="w-3.5 h-3.5" /> Manter em espera
          </button>
          <button disabled={busyAction} onClick={() => setArchiving(true)} className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 flex items-center gap-1 disabled:opacity-60">
            <Archive className="w-3.5 h-3.5" /> Arquivar
          </button>
          {busyAction && <Loader2 className="w-4 h-4 animate-spin" />}
        </div>
      )}

      {archiving && (
        <ArchiveReasonModal
          count={selectedRows.length}
          busy={busyAction}
          onCancel={() => setArchiving(false)}
          onConfirm={reason => void runDecision('archive', reason)}
        />
      )}

      {openFileId && (
        <ScreeningDetailDrawer fileId={openFileId} canUpload={canUpload} onClose={() => setOpenFileId(null)} onChanged={refresh} />
      )}
    </div>
  );
};

const ScreeningTableRow: React.FC<{
  row: ScreeningRow; canDecide: boolean; checked: boolean; onToggle: () => void; onOpen: () => void; clickable: boolean;
}> = ({ row, canDecide, checked, onToggle, onOpen, clickable }) => {
  const level = row.evaluation ? fitLevel(row.evaluation.overallFitScore) : null;
  const requirements = row.file?.summary?.requirements;
  return (
    <tr
      className={`${clickable ? 'hover:bg-slate-50/80 cursor-pointer' : 'cursor-default'} ${row.applicationStatus === 'rejected' ? 'opacity-60' : ''}`}
      onClick={clickable ? onOpen : undefined}
    >
      {canDecide && (
        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
          <button onClick={onToggle} className="text-slate-400 hover:text-indigo-600">
            {checked ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
          </button>
        </td>
      )}
      <td className="px-3 py-2.5">
        <div className="font-semibold text-slate-800">{row.candidateName}</div>
        <div className="text-slate-400">{row.currentRole || '—'}{row.yearsOfExperience ? ` · ${row.yearsOfExperience}a` : ''}</div>
      </td>
      <td className="px-3 py-2.5">
        {row.evaluation && level ? (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${FIT_BADGE[level]}`}>
            {row.evaluation.overallFitScore}% · {FIT_LEVEL_LABEL[level]}
          </span>
        ) : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-3 py-2.5 text-slate-500">
        {requirements ? `${requirements.met} de ${requirements.total}` : '—'}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {row.flags.map(f => (
            <span key={f} title={FLAG_LABEL[f].hint} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
              {FLAG_LABEL[f].label}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2.5 text-slate-300">{clickable && <ChevronRight className="w-3.5 h-3.5" />}</td>
    </tr>
  );
};

const PendingBadge: React.FC<{ status: string; failureMessage?: string; onComplete?: () => void }> = ({ status, failureMessage, onComplete }) => {
  if (status === 'needs_data' && onComplete) {
    return (
      <button onClick={onComplete} className="text-amber-600 hover:underline flex items-center gap-1 font-semibold">
        <UserCheck className="w-3 h-3" /> Completar dados
      </button>
    );
  }
  return <span title={failureMessage} className="text-slate-400">{status === 'failed' ? 'Não foi possível ler' : status === 'analyzing' ? 'Lendo…' : 'Aguardando'}</span>;
};

const ArchiveReasonModal: React.FC<{ count: number; busy: boolean; onCancel: () => void; onConfirm: (reason: string) => void }> = ({ count, busy, onCancel, onConfirm }) => {
  const backdrop = useBackdropClose(onCancel);
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" {...backdrop}>
      <div className="bg-white rounded-2xl w-full max-w-sm border border-slate-200 shadow-xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-slate-900">Arquivar {count} candidatura(s)</h3>
        <p className="text-xs text-slate-500">O motivo fica registrado no histórico da candidatura.</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="Ex.: Perfil fora dos requisitos técnicos da vaga."
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
        />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-medium text-xs disabled:opacity-60">Cancelar</button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={busy || !reason.trim()}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs disabled:opacity-60"
          >
            {busy ? 'Aguarde…' : 'Arquivar'}
          </button>
        </div>
      </div>
    </div>
  );
};
