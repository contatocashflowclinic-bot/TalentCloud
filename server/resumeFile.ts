import { unzipSync } from 'fflate';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, type ResumeMime } from '../src/types.js';
import { ValidationError } from './errors.js';

/**
 * Leitura segura de currículos. O tipo do arquivo vem do CONTEÚDO (o navegador nem sempre informa o tipo do Word, e o nome não
 * prova nada). PDF é enviado como está ao Gemini, que também lê PDF escaneado; Word (.docx) é convertido em texto aqui, porque o
 * Gemini não lê Word.
 */
export const PDF_MIME = 'application/pdf' as const;
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const;

/** Limites contra arquivo compactado malicioso ("zip bomb"): quantidade de entradas e tamanho descompactado. */
const MAX_ZIP_ENTRIES = 5_000;
const MAX_XML_PART_BYTES = 8 * 1024 * 1024;
const MAX_XML_TOTAL_BYTES = 20 * 1024 * 1024;
/** O texto do currículo que vai para a IA é limitado: um currículo de verdade cabe com folga. */
export const MAX_RESUME_TEXT_CHARS = 30_000;

export const FRIENDLY = {
  empty: 'Arquivo vazio ou não recebido.',
  format: 'Formato não permitido. Envie o currículo em PDF ou Word (.docx).',
  oldWord: 'Este arquivo é um Word antigo (.doc). Abra no Word e use "Salvar como" para gerar um .docx ou um PDF.',
  encrypted: 'O PDF está protegido por senha. Envie uma versão sem senha.',
  macros: 'O documento Word contém macros e não é aceito. Salve uma cópia sem macros (.docx) ou em PDF.',
  notWord: 'O arquivo compactado não é um documento Word (.docx).',
  corrupted: 'O arquivo está corrompido ou incompleto. Abra-o no computador e salve de novo.',
  tooBig: `Arquivo maior que o limite de ${MAX_UPLOAD_MB} MB.`,
  zipTooComplex: 'O documento Word tem estrutura grande demais para ser lido com segurança.'
} as const;

export interface SniffedResume {
  kind: 'pdf' | 'docx';
  mime: ResumeMime;
}

const OLE_HEADER = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** Nomes das entradas do .zip sem descompactar nada (só lê o índice do arquivo). */
function zipEntryNames(buf: Buffer): string[] {
  const names: string[] = [];
  try {
    unzipSync(buf, {
      filter: file => {
        names.push(file.name);
        return false;
      }
    });
  } catch {
    throw new ValidationError(FRIENDLY.corrupted);
  }
  return names;
}

/** Aceita só PDF e .docx reais dentro do limite de tamanho; qualquer outra coisa recebe uma mensagem que diz o que fazer. */
export function sniffResume(content: unknown): SniffedResume {
  if (!Buffer.isBuffer(content) || content.length === 0) throw new ValidationError(FRIENDLY.empty);
  if (content.length > MAX_UPLOAD_BYTES) throw new ValidationError(FRIENDLY.tooBig);

  if (content.subarray(0, 1024).includes('%PDF-')) {
    // PDF criptografado traz /Encrypt no dicionário do trailer: o Gemini não consegue abri-lo
    if (/\/Encrypt[\s<\d]/.test(content.toString('latin1'))) throw new ValidationError(FRIENDLY.encrypted);
    return { kind: 'pdf', mime: PDF_MIME };
  }
  if (content.subarray(0, 8).equals(OLE_HEADER)) throw new ValidationError(FRIENDLY.oldWord);
  if (content.subarray(0, 4).equals(ZIP_HEADER)) {
    const names = zipEntryNames(content);
    if (names.length > MAX_ZIP_ENTRIES) throw new ValidationError(FRIENDLY.zipTooComplex);
    if (names.some(n => /vbaProject\.bin$/i.test(n))) throw new ValidationError(FRIENDLY.macros);
    if (!names.includes('word/document.xml')) throw new ValidationError(FRIENDLY.notWord);
    return { kind: 'docx', mime: DOCX_MIME };
  }
  throw new ValidationError(FRIENDLY.format);
}

export const resumeExtension = (mime: ResumeMime): string => (mime === PDF_MIME ? '.pdf' : '.docx');

// ---- Word (.docx) → texto ---------------------------------------------------------------------------------------------------
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (whole, e: string) => {
    if (e[0] !== '#') return ENTITIES[e] ?? whole;
    const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/** Cabeçalho, corpo e rodapé: contatos e caixas de texto costumam ficar em cabeçalho/rodapé. Só descompacta o que é lido. */
function readParts(buf: Buffer): Array<{ name: string; xml: string }> {
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buf, {
      filter: file => {
        if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(file.name)) return false;
        total += file.originalSize;
        if (file.originalSize > MAX_XML_PART_BYTES || total > MAX_XML_TOTAL_BYTES) throw new ValidationError(FRIENDLY.zipTooComplex);
        return true;
      }
    });
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(FRIENDLY.corrupted);
  }
  const rank = (name: string) => (name.includes('header') ? 0 : name.includes('footer') ? 2 : 1);
  return Object.entries(files)
    .map(([name, data]) => ({ name, xml: Buffer.from(data).toString('utf8') }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

const TOKEN = /<(\/)?([A-Za-z][A-Za-z0-9:._-]*)([^>]*?)(\/)?>|([^<]+)/g;

interface Run {
  buf: string;
  hidden: boolean;
  white: boolean;
}

/**
 * Converte o XML do Word em texto. Trechos marcados como ocultos (`w:vanish`) NÃO chegam à IA (o RH também não os vê) e são
 * contados; texto branco chega, mas é contado, porque pode ser legítimo (nome sobre faixa escura) ou uma tentativa de esconder
 * instruções. O texto de alterações rastreadas apagadas (`w:delText`) é ignorado.
 */
function partToText(xml: string, stats: { hidden: number; white: number }): string {
  const stack: Run[] = [{ buf: '', hidden: false, white: false }];
  const top = () => stack[stack.length - 1];
  let inText = false;

  for (const m of xml.matchAll(TOKEN)) {
    const [, closing, tag, attrs = '', selfClosing, text] = m;
    if (text !== undefined) {
      if (inText) top().buf += decodeEntities(text);
      continue;
    }
    switch (tag) {
      case 'w:r':
        if (closing) {
          if (stack.length > 1) {
            const run = stack.pop()!;
            if (run.hidden) stats.hidden += run.buf.trim().length;
            else {
              if (run.white) stats.white += run.buf.trim().length;
              top().buf += run.buf;
            }
          }
        } else if (!selfClosing) stack.push({ buf: '', hidden: false, white: false });
        break;
      case 'w:t': inText = !closing && !selfClosing; break;
      case 'w:vanish': if (!closing && stack.length > 1 && !/w:val="(0|false)"/i.test(attrs)) top().hidden = true; break;
      case 'w:color': if (!closing && stack.length > 1 && /w:val="ffffff"/i.test(attrs)) top().white = true; break;
      case 'w:tab': if (!closing) top().buf += '\t'; break;
      case 'w:br':
      case 'w:cr': if (!closing) top().buf += '\n'; break;
      case 'w:noBreakHyphen': if (!closing) top().buf += '-'; break;
      // Fim de parágrafo: linha em branco entre parágrafos (a leitura da IA fica mais clara com as seções separadas).
      case 'w:p': if (closing) top().buf += '\n\n'; break;
      case 'w:tc': if (closing) top().buf += '\t'; break;
      case 'w:tr': if (closing) top().buf += '\n'; break;
    }
  }
  while (stack.length > 1) {
    const run = stack.pop()!;
    if (!run.hidden) top().buf += run.buf;
  }
  return stack[0].buf;
}

const tidy = (s: string) =>
  s
    .split('\n')
    .map(line => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export interface DocxText {
  text: string;
  /** Havia texto oculto (não enviado à IA) ou muito texto em branco no arquivo. */
  hiddenText: boolean;
  truncated: boolean;
}

export function docxToText(buf: Buffer): DocxText {
  const stats = { hidden: 0, white: 0 };
  let text = readParts(buf)
    .map(part => tidy(partToText(part.xml, stats)))
    .filter(Boolean)
    .join('\n\n');
  const truncated = text.length > MAX_RESUME_TEXT_CHARS;
  if (truncated) text = text.slice(0, MAX_RESUME_TEXT_CHARS);
  return { text, hiddenText: stats.hidden > 0 || stats.white >= 40, truncated };
}
