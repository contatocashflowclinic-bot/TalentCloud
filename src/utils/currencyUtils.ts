/** Brazilian money mask helpers: the input's raw digits are read as cents, filling in from the right. */

/** Reais amount -> integer cents, e.g. 1234.5 -> 123450. */
export const reaisToCents = (value: number | null | undefined): number => Math.round((value ?? 0) * 100);

/** Integer cents -> reais amount, e.g. 123450 -> 1234.5. */
export const centsToReais = (cents: number): number => cents / 100;

/** Keeps only digits from raw user input and reads them as integer cents. */
export const digitsToCents = (raw: string): number => {
  const digits = raw.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
};

/** Integer cents -> Brazilian-formatted amount text, e.g. 123450 -> "1.234,50". */
export const centsToBRLText = (cents: number): string =>
  centsToReais(cents).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Parses a Brazilian-formatted amount typed by a person, e.g. "1.234,50" -> 1234.5. */
export const parseBRLText = (text: string): number => centsToReais(digitsToCents(text));
