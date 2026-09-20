import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../src/types.js';
import { AppError, ValidationError } from './errors.js';

/**
 * Private document storage on Supabase Storage (REST API, server-side service key only).
 * Files are never exposed by URL: downloads go through the API, which checks permission and tenant.
 */
const BUCKET = 'admission-docs';
/** 4 MB: Vercel Functions reject request bodies above 4.5 MB (the file travels through the API). */
export const MAX_FILE_BYTES = MAX_UPLOAD_BYTES;

const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'application/pdf': b => b.subarray(0, 4).toString('latin1') === '%PDF',
  'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': b => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
};
export const ALLOWED_MIME_TYPES = Object.keys(SIGNATURES);

/** Rejects anything that is not a real PDF/JPG/PNG within the size limit (the declared type is not trusted). */
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

const objectUrl = (base: string, path: string) =>
  `${base}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

let bucketReady: Promise<void> | null = null;

function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const { url, headers } = config();
    const res = await fetch(`${url}/storage/v1/bucket`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_FILE_BYTES, allowed_mime_types: ALLOWED_MIME_TYPES })
    });
    // 400/409: bucket already exists
    if (!res.ok && res.status !== 409 && res.status !== 400) throw new AppError('Não foi possível preparar o armazenamento de documentos.', 502);
  })().catch(err => { bucketReady = null; throw err; });
  return bucketReady;
}

export async function putFile(path: string, content: Buffer, mime: string): Promise<void> {
  await ensureBucket();
  const { url, headers } = config();
  const res = await fetch(objectUrl(url, path), { method: 'POST', headers: { ...headers, 'Content-Type': mime, 'x-upsert': 'false' }, body: new Uint8Array(content) });
  if (!res.ok) throw new AppError('Falha ao gravar o arquivo no armazenamento.', 502);
}

export async function getFile(path: string): Promise<Buffer> {
  const { url, headers } = config();
  const res = await fetch(objectUrl(url, path), { headers });
  if (!res.ok) throw new AppError('Arquivo não encontrado no armazenamento.', res.status === 404 || res.status === 400 ? 404 : 502);
  return Buffer.from(await res.arrayBuffer());
}

/** Best effort: an orphan file must never block the business operation. */
export async function removeFile(path: string): Promise<void> {
  try {
    const { url, headers } = config();
    await fetch(objectUrl(url, path), { method: 'DELETE', headers });
  } catch (err) {
    console.warn('[storage] falha ao remover arquivo órfão:', path, err);
  }
}
