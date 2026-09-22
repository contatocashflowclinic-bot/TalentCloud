import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, RESUME_MIMES } from '../src/types.js';
import { AppError, ValidationError } from './errors.js';

/**
 * Private document storage on Supabase Storage (REST API, server-side service key only).
 * Files are never exposed by URL: downloads go through the API, which checks permission and tenant.
 *
 * Two buckets: `admission-docs` (proposals/admission: PDF, JPG, PNG) and `candidate-resumes` (resume screening: PDF,
 * DOCX). Each bucket only accepts its own formats, so a bucket created for one feature can never receive a file meant
 * for the other. `putFile`/`getFile`/`removeFile` default to `admission-docs`, so every existing caller keeps working
 * unchanged; new callers pass `RESUME_BUCKET` explicitly.
 */
export const ADMISSION_BUCKET = 'admission-docs';
export const RESUME_BUCKET = 'candidate-resumes';
/** 4 MB: Vercel Functions reject request bodies above 4.5 MB (the file travels through the API). */
export const MAX_FILE_BYTES = MAX_UPLOAD_BYTES;

const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'application/pdf': b => b.subarray(0, 4).toString('latin1') === '%PDF',
  'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': b => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
};
export const ALLOWED_MIME_TYPES = Object.keys(SIGNATURES);

/** Which MIME types each bucket is created to accept (Supabase Storage's own `allowed_mime_types`). */
const BUCKET_MIME_TYPES: Record<string, readonly string[]> = {
  [ADMISSION_BUCKET]: ALLOWED_MIME_TYPES,
  [RESUME_BUCKET]: RESUME_MIMES
};

/** Rejects anything that is not a real PDF/JPG/PNG within the size limit (the declared type is not trusted). Used by
 * offers/admission uploads. Resumes are validated instead by `sniffResume` (server/resumeFile.ts), which also accepts
 * DOCX and gives friendlier, format-specific messages. */
export function assertValidFile(content: unknown, mime: string): Buffer {
  if (!SIGNATURES[mime]) throw new ValidationError('Formato não permitido. Envie PDF, JPG ou PNG.');
  if (!Buffer.isBuffer(content) || content.length === 0) throw new ValidationError('Arquivo vazio ou não recebido.');
  if (content.length > MAX_FILE_BYTES) throw new ValidationError(`Arquivo maior que o limite de ${MAX_UPLOAD_MB} MB.`);
  if (!SIGNATURES[mime](content)) throw new ValidationError('O conteúdo do arquivo não corresponde ao formato informado.');
  return content;
}

export const safeFileName = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80) || 'arquivo';

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new AppError('Armazenamento de documentos não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).', 503);
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

const objectUrl = (base: string, bucket: string, path: string) =>
  `${base}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;

const bucketReady = new Map<string, Promise<void>>();

function ensureBucket(bucket: string): Promise<void> {
  let ready = bucketReady.get(bucket);
  if (!ready) {
    ready = (async () => {
      const { url, headers } = config();
      const allowedMimeTypes = BUCKET_MIME_TYPES[bucket] ?? ALLOWED_MIME_TYPES;
      const res = await fetch(`${url}/storage/v1/bucket`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: MAX_FILE_BYTES, allowed_mime_types: allowedMimeTypes })
      });
      // 400/409: bucket already exists
      if (!res.ok && res.status !== 409 && res.status !== 400) throw new AppError('Não foi possível preparar o armazenamento de documentos.', 502);
    })().catch(err => { bucketReady.delete(bucket); throw err; });
    bucketReady.set(bucket, ready);
  }
  return ready;
}

export async function putFile(path: string, content: Buffer, mime: string, bucket: string = ADMISSION_BUCKET): Promise<void> {
  await ensureBucket(bucket);
  const { url, headers } = config();
  const res = await fetch(objectUrl(url, bucket, path), { method: 'POST', headers: { ...headers, 'Content-Type': mime, 'x-upsert': 'false' }, body: new Uint8Array(content) });
  if (!res.ok) throw new AppError('Falha ao gravar o arquivo no armazenamento.', 502);
}

export async function getFile(path: string, bucket: string = ADMISSION_BUCKET): Promise<Buffer> {
  const { url, headers } = config();
  const res = await fetch(objectUrl(url, bucket, path), { headers });
  if (!res.ok) throw new AppError('Arquivo não encontrado no armazenamento.', res.status === 404 || res.status === 400 ? 404 : 502);
  return Buffer.from(await res.arrayBuffer());
}

/** Best effort: an orphan file must never block the business operation. */
export async function removeFile(path: string, bucket: string = ADMISSION_BUCKET): Promise<void> {
  try {
    const { url, headers } = config();
    await fetch(objectUrl(url, bucket, path), { method: 'DELETE', headers });
  } catch (err) {
    console.warn('[storage] falha ao remover arquivo órfão:', path, err);
  }
}
