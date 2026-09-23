import React, { useCallback, useRef, useState } from 'react';
import { UploadCloud, FileText, CheckCircle2, XCircle, Loader2, RotateCw, X } from 'lucide-react';
import { TenantApi, ApiError } from '../../services/api.js';
import { RESUME_LIMITS } from '../../types.js';
import { STATUS_LABEL } from '../../screening.js';

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx'];
const MAX_BYTES = 4 * 1024 * 1024;
const CONCURRENCY = 3;

type QueueStatus = 'queued' | 'uploading' | 'analyzing' | 'done' | 'needs_data' | 'error';

interface QueueItem {
  key: string;
  file: File;
  status: QueueStatus;
  message?: string;
}

const clientRejection = (file: File): string | undefined => {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some(ext => name.endsWith(ext))) return 'Formato não permitido. Envie PDF ou Word (.docx).';
  if (file.size > MAX_BYTES) return 'Arquivo maior que o limite de 4 MB.';
  if (file.size === 0) return 'Arquivo vazio.';
  return undefined;
};

/** Caixa de envio com fila de progresso. Envia (raw) e depois pede a análise, com concorrência limitada; o quadro é recarregado ao final. */
export const ResumeUploadZone: React.FC<{ jobId: string; disabled?: boolean; onFinished: () => void }> = ({ jobId, disabled, onFinished }) => {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = (key: string, over: Partial<QueueItem>) =>
    setItems(list => list.map(it => (it.key === key ? { ...it, ...over } : it)));

  const runOne = async (item: QueueItem) => {
    const rejected = clientRejection(item.file);
    if (rejected) return patch(item.key, { status: 'error', message: rejected });
    try {
      patch(item.key, { status: 'uploading' });
      const { file: uploaded } = await TenantApi.uploadResume(jobId, item.file);
      patch(item.key, { status: 'analyzing' });
      const result = await TenantApi.analyzeResume(uploaded.id);
      if (result.file.status === 'needs_data') patch(item.key, { status: 'needs_data', message: 'Faltam dados para identificar o candidato.' });
      else if (result.file.status === 'failed') patch(item.key, { status: 'error', message: result.file.failureMessage ?? STATUS_LABEL.failed });
      else if (result.notice) patch(item.key, { status: 'queued', message: result.notice }); // IA indisponível: fica aguardando
      else patch(item.key, { status: 'done' });
    } catch (err) {
      patch(item.key, { status: 'error', message: err instanceof ApiError ? err.message : 'Falha ao enviar este arquivo.' });
    }
  };

  const processQueue = useCallback(async (queue: QueueItem[]) => {
    setRunning(true);
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        await runOne(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setRunning(false);
    onFinished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, onFinished]);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, RESUME_LIMITS.perBatch);
    const queued: QueueItem[] = list.map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, status: 'queued' }));
    setItems(prev => [...queued, ...prev]);
    void processQueue(queued);
  };

  const pending = items.filter(i => i.status === 'queued' || i.status === 'uploading' || i.status === 'analyzing').length;

  return (
    <div className="space-y-3">
      <div
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
          disabled ? 'opacity-50 cursor-not-allowed border-slate-200' : dragOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-300 hover:border-indigo-300 hover:bg-slate-50'
        }`}
      >
        <UploadCloud className="w-7 h-7 mx-auto text-indigo-500 mb-2" />
        <p className="text-sm font-semibold text-slate-700">Arraste os currículos aqui, ou clique para escolher</p>
        <p className="text-xs text-slate-500 mt-1">PDF ou Word (.docx) · até 4 MB cada · até {RESUME_LIMITS.perBatch} arquivos por vez</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          disabled={disabled}
          onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      <p className="text-[11px] text-slate-400">
        Envie apenas currículos que sua organização tenha base legal para tratar. A IA lê o currículo para apoiar a triagem; ela não decide.
      </p>

      {items.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600">
              {running ? `Processando… (${pending} restando)` : `${items.length} arquivo(s) nesta sessão`}
            </span>
            <button type="button" onClick={() => setItems([])} className="text-slate-400 hover:text-slate-600 flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Limpar lista
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {items.map(it => (
              <li key={it.key} className="px-4 py-2 flex items-center gap-2.5 text-xs">
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="flex-1 truncate text-slate-700" title={it.file.name}>{it.file.name}</span>
                <StatusBadge item={it} onRetry={() => { patch(it.key, { status: 'queued', message: undefined }); void runOne({ ...it, status: 'queued' }).then(() => onFinished()); }} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const StatusBadge: React.FC<{ item: QueueItem; onRetry: () => void }> = ({ item, onRetry }) => {
  switch (item.status) {
    case 'queued':
      return <span className="text-slate-400 italic" title={item.message}>{item.message ? 'Aguardando IA' : 'Na fila'}</span>;
    case 'uploading':
    case 'analyzing':
      return <span className="flex items-center gap-1 text-indigo-600"><Loader2 className="w-3.5 h-3.5 animate-spin" />{item.status === 'uploading' ? 'Enviando…' : 'Lendo…'}</span>;
    case 'done':
      return <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" />Pronto</span>;
    case 'needs_data':
      return <span className="flex items-center gap-1 text-amber-600" title={item.message}><CheckCircle2 className="w-3.5 h-3.5" />Precisa de dados</span>;
    case 'error':
      return (
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="flex items-center gap-1 text-rose-600 min-w-0" title={item.message}>
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[28rem]">{item.message || 'Não foi possível ler'}</span>
          </span>
          <button type="button" onClick={onRetry} className="text-slate-400 hover:text-indigo-600" title="Tentar de novo">
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </span>
      );
  }
};
