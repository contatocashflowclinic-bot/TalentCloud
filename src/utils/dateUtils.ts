/**
 * Utilitários de Data e Hora no Padrão Brasileiro (pt-BR)
 * Fuso Horário Oficial: América/São Paulo (Horário de Brasília - UTC-3)
 */

export const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';
export const BRAZIL_LOCALE = 'pt-BR';

/**
 * Normaliza qualquer entrada (string ISO, timestamp numérico ou Date)
 */
function parseDate(input: string | number | Date | null | undefined): Date | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formata apenas a data no padrão brasileiro: DD/MM/AAAA (Fuso São Paulo)
 * Ex: 18/09/2026
 */
export function formatDateSP(input: string | number | Date | null | undefined): string {
  // Data de calendário (AAAA-MM-DD: início da proposta, admissão, prazos) não tem fuso: lida como meia-noite UTC,
  // apareceria um dia antes no horário de São Paulo.
  const calendarDate = typeof input === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(input) : null;
  if (calendarDate) return `${calendarDate[3]}/${calendarDate[2]}/${calendarDate[1]}`;

  const d = parseDate(input);
  if (!d) return '--/--/----';
  return new Intl.DateTimeFormat(BRAZIL_LOCALE, {
    timeZone: SAO_PAULO_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(d);
}

/**
 * Formata apenas a hora no fuso de São Paulo: HH:MM ou HH:MM:SS
 * Ex: 14:30 ou 14:30:15
 */
export function formatTimeSP(
  input: string | number | Date | null | undefined,
  includeSeconds = false
): string {
  const d = parseDate(input);
  if (!d) return '--:--';
  return new Intl.DateTimeFormat(BRAZIL_LOCALE, {
    timeZone: SAO_PAULO_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    hour12: false
  }).format(d);
}

/**
 * Formata data e hora no padrão brasileiro: DD/MM/AAAA às HH:MM (Fuso São Paulo)
 * Ex: 18/09/2026 às 14:30
 */
export function formatDateTimeSP(
  input: string | number | Date | null | undefined,
  includeSeconds = false
): string {
  const d = parseDate(input);
  if (!d) return '--/--/---- --:--';
  const dateStr = formatDateSP(d);
  const timeStr = formatTimeSP(d, includeSeconds);
  return `${dateStr} às ${timeStr}`;
}

/**
 * Formata data por extenso em português: "18 de setembro de 2026"
 */
export function formatLongDateSP(input: string | number | Date | null | undefined): string {
  const d = parseDate(input);
  if (!d) return '';
  return new Intl.DateTimeFormat(BRAZIL_LOCALE, {
    timeZone: SAO_PAULO_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(d);
}

/**
 * Formata data e hora completa com indicação explícita do horário de São Paulo
 * Ex: 18/09/2026 às 14:30 (Horário de São Paulo - SP)
 */
export function formatFullDateTimeWithTimezoneSP(
  input: string | number | Date | null | undefined
): string {
  const d = parseDate(input);
  if (!d) return '';
  return `${formatDateTimeSP(d)} (Horário de Brasília / São Paulo - SP)`;
}

/**
 * ISO -> valor de <input type="datetime-local">, no horário de São Paulo (o mesmo que o resto do app exibe,
 * não importa o fuso do navegador da pessoa).
 */
export function toDateTimeLocalSP(input: string | number | Date | null | undefined): string {
  const d = parseDate(input);
  if (!d) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: SAO_PAULO_TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d).map(p => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Valor de <input type="datetime-local"> (sem fuso) -> ISO, lido como horário de São Paulo (UTC-3 fixo, sem horário de verão desde 2019). */
export function fromDateTimeLocalSP(value: string): string {
  return value ? new Date(`${value}:00-03:00`).toISOString() : '';
}

/** Chave de dia (AAAA-MM-DD) no horário de São Paulo — para agrupar/comparar por dia independente do fuso do navegador. */
export function spDateKey(input: string | number | Date | null | undefined): string {
  return toDateTimeLocalSP(input).slice(0, 10);
}

/**
 * Converte data relativa amigável em português
 */
export function formatRelativeTimeSP(input: string | number | Date | null | undefined): string {
  const d = parseDate(input);
  if (!d) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'Agora mesmo';
  if (diffMinutes < 60) return `Há ${diffMinutes} min`;
  if (diffHours < 24) return `Há ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `Há ${diffDays} dias`;
  return formatDateSP(d);
}
