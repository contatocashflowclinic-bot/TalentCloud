import React, { useRef, useState } from 'react';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { TenantApi } from '../../services/api.js';
import { JobOffer, MAX_OFFER_DOCUMENTS, OFFER_DOCUMENT_CATEGORIES, OfferDocument, OfferDocumentCategory } from '../../types.js';
import { formatDateSP } from '../../utils/dateUtils.js';
import { ConfirmDialog } from '../ConfirmDialog.js';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const formatSize = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const CATEGORY_STYLE: Record<OfferDocumentCategory, string> = {
  'Contrato assinado': 'bg-emerald-100 text-emerald-800',
  'Aditivo contratual': 'bg-purple-100 text-purple-800',
  'Carta-proposta assinada': 'bg-blue-100 text-blue-800',
  'Outros': 'bg-slate-100 text-slate-600'
};

interface Props {
  offer: JobOffer;
  /** Attach / remove (offers:edit). Everyone who can open the proposal may download. */
  canEdit: boolean;
  /** Called with the proposal returned by the server after every change. */
  onChanged: (offer: JobOffer) => void;
}

/** "Documentos" section of the proposal summary: signed contract, addenda and other attachments. */
export const OfferDocuments: React.FC<Props> = ({ offer, canEdit, onChanged }) => {
  const documents = offer.documents ?? [];
  const [category, setCategory] = useState<OfferDocumentCategory>(OFFER_DOCUMENT_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<OfferDocument | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const limitReached = documents.length >= MAX_OFFER_DOCUMENTS;

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) return setError('Formato não permitido. Envie PDF, JPG ou PNG.');
    if (file.size > MAX_FILE_BYTES) return setError('Arquivo maior que o limite de 8 MB.');
    try {
      setUploading(true);
      setError('');
      onChanged(await TenantApi.uploadOfferDocument(offer.id, file, category, description.trim() || undefined));
      setDescription('');
    } catch (err: any) {
      setError(err.message || 'Não foi possível anexar o documento.');
    } finally {
      setUploading(false);
    }
  };

  const download = async (doc: OfferDocument) => {
    try {
      setBusyId(doc.id);
      setError('');
      await TenantApi.downloadOfferDocument(offer.id, doc.id, doc.name);
    } catch (err: any) {
      setError(err.message || 'Não foi possível baixar o documento.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!confirmRemove) return;
    try {
      setBusyId(confirmRemove.id);
      setError('');
      onChanged(await TenantApi.deleteOfferDocument(offer.id, confirmRemove.id));
    } catch (err: any) {
      setError(err.message || 'Não foi possível remover o documento.');
    } finally {
      setBusyId(null);
      setConfirmRemove(null);
    }
  };

  return (
    <div>
      <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-slate-500 mb-2">Documentos ({documents.length})</h4>

      {documents.length === 0 ? (
        <div className="p-3 rounded-xl border border-dashed border-slate-200 text-slate-400 text-center">
          Nenhum documento anexado ainda.
        </div>
      ) : (
        <ul className="space-y-2">
          {documents.map(doc => (
            <li key={doc.id} className="p-3 rounded-xl border border-slate-200 bg-white">
              <div className="flex items-start gap-2.5">
                <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800 truncate" title={doc.name}>{doc.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${CATEGORY_STYLE[doc.category] ?? CATEGORY_STYLE.Outros}`}>
                      {doc.category}
                    </span>
                    <span>{formatSize(doc.size)}</span>
                    <span>· {doc.uploadedBy}</span>
                    <span>· {formatDateSP(doc.uploadedAt)}</span>
                  </div>
                  {doc.description && <div className="mt-1 text-[11px] text-slate-600">{doc.description}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => download(doc)}
                    disabled={busyId === doc.id}
                    title="Baixar"
                    aria-label={`Baixar ${doc.name}`}
                    className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1 font-medium text-slate-700 disabled:opacity-60"
                  >
                    <Download className="w-3 h-3" /> Baixar
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => setConfirmRemove(doc)}
                      disabled={busyId === doc.id}
                      title="Remover"
                      aria-label={`Remover ${doc.name}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-60"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
          <input ref={fileInput} type="file" accept={ACCEPTED_TYPES.join(',')} className="hidden" onChange={onFileChosen} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as OfferDocumentCategory)}
              aria-label="Tipo do documento"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500"
            >
              {OFFER_DOCUMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="Descrição (opcional)"
              aria-label="Descrição do documento"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-hidden focus:border-indigo-500"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              {limitReached ? `Limite de ${MAX_OFFER_DOCUMENTS} documentos atingido.` : 'PDF, JPG ou PNG · até 8 MB'}
            </span>
            <button
              onClick={() => fileInput.current?.click()}
              disabled={uploading || limitReached}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> {uploading ? 'Enviando…' : 'Anexar documento'}
            </button>
          </div>
        </div>
      )}

      {error && <div role="alert" className="mt-2 p-2 rounded-lg bg-rose-50 text-rose-700">{error}</div>}

      {confirmRemove && (
        <ConfirmDialog
          title="Remover documento"
          message={<>Remover <b>"{confirmRemove.name}"</b> desta proposta? O arquivo será apagado e não poderá ser recuperado.</>}
          confirmLabel="Remover"
          tone="danger"
          busy={busyId === confirmRemove.id}
          onConfirm={remove}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
};
