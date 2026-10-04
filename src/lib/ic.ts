/** A MyKad number, with or without dashes. */
export const MYKAD_REGEX = /^\d{6}-?\d{2}-?\d{4}$/;

/**
 * The one stored form of an IC: a MyKad as YYMMDD-PB-####, anything else
 * (passport, old IC) trimmed. "880412141234" and "880412-14-1234" are the
 * same person, so they must be stored — and checked — the same way.
 */
export function normalizeIc(raw: string | null | undefined): string | null {
  const ic = raw?.trim();
  if (!ic) return null;
  if (!MYKAD_REGEX.test(ic)) return ic;
  const d = ic.replace(/-/g, "");
  return `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

/**
 * Date of birth from a MyKad's YYMMDD. The century is the one that keeps the
 * date in the past: 27 is 2027 only while that's still to come.
 */
export function dobFromIc(ic: string, now: Date = new Date()): Date | null {
  const digits = ic.replace(/-/g, "");
  if (!/^\d{12}$/.test(digits)) return null;
  const yy = parseInt(digits.substring(0, 2), 10);
  const mm = parseInt(digits.substring(2, 4), 10);
  const dd = parseInt(digits.substring(4, 6), 10);
  const year = yy <= now.getUTCFullYear() % 100 ? 2000 + yy : 1900 + yy;
  const date = new Date(Date.UTC(year, mm - 1, dd));
  if (isNaN(date.getTime()) || date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null;
  return date > now ? new Date(Date.UTC(year - 100, mm - 1, dd)) : date;
}
