/**
 * Typed dd/mm/yyyy date entry. Values are calendar dates ("YYYY-MM-DD"), not
 * instants — no time zone is involved in parsing or formatting. Client-safe.
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n: number) => String(n).padStart(2, "0");

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/** True for a real calendar date written as "YYYY-MM-DD". */
export function isIsoDate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  return isRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** "YYYY-MM-DD" → "dd/mm/yyyy"; anything else → "". */
export function formatDateInput(iso: string | null | undefined): string {
  if (!iso || !isIsoDate(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export type DateParseResult =
  | { ok: true; iso: string }
  | { ok: false; reason: "empty" | "format" | "year" | "invalid" };

/**
 * Parse what the user typed. Accepts `dd/mm/yyyy`, `d/m/yyyy`, `dd-mm-yyyy`,
 * `dd.mm.yyyy` and `ddmmyyyy`. Two-digit years are rejected (is "90" 1990 or
 * 2090?) and impossible dates like 31/02/2026 fail as "invalid".
 */
export function parseDateInput(text: string): DateParseResult {
  const t = text.trim();
  if (!t) return { ok: false, reason: "empty" };

  let day: string, month: string, year: string;
  const sep = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d+)$/.exec(t);
  if (sep) {
    [, day, month, year] = sep;
  } else if (/^\d{8}$/.test(t)) {
    day = t.slice(0, 2);
    month = t.slice(2, 4);
    year = t.slice(4);
  } else if (/^\d{6}$/.test(t) || /^\d{1,2}[/.\-\s]\d{1,2}[/.\-\s]?$/.test(t)) {
    return { ok: false, reason: "year" };
  } else {
    return { ok: false, reason: "format" };
  }

  if (year.length !== 4) return { ok: false, reason: "year" };
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (y < 1000 || !isRealDate(y, m, d)) return { ok: false, reason: "invalid" };
  return { ok: true, iso: `${year}-${pad2(m)}-${pad2(d)}` };
}

export interface DateBounds {
  /** Earliest allowed "YYYY-MM-DD" (inclusive). */
  min?: string;
  /** Latest allowed "YYYY-MM-DD" (inclusive). */
  max?: string;
}

/** ISO dates compare correctly as strings. */
export function dateOutOfRange(iso: string, { min, max }: DateBounds): "before_min" | "after_max" | null {
  if (min && isIsoDate(min) && iso < min) return "before_min";
  if (max && isIsoDate(max) && iso > max) return "after_max";
  return null;
}

export interface DateInputValidation {
  /** "YYYY-MM-DD" when valid, "" when empty or invalid. */
  iso: string;
  /** User-facing message, or null when the text is empty or valid. */
  error: string | null;
}

/** Parse + range-check typed text into the value a form should hold. */
export function validateDateInput(text: string, bounds: DateBounds = {}): DateInputValidation {
  const parsed = parseDateInput(text);
  if (!parsed.ok) {
    switch (parsed.reason) {
      case "empty":
        return { iso: "", error: null };
      case "year":
        return { iso: "", error: "Enter the full year, e.g. 05/01/1990" };
      case "invalid":
        return { iso: "", error: `${text.trim()} is not a real date` };
      default:
        return { iso: "", error: "Enter a date as dd/mm/yyyy" };
    }
  }
  const range = dateOutOfRange(parsed.iso, bounds);
  if (range === "before_min") {
    return { iso: "", error: `Date must be on or after ${formatDateInput(bounds.min)}` };
  }
  if (range === "after_max") {
    return { iso: "", error: `Date must be on or before ${formatDateInput(bounds.max)}` };
  }
  return { iso: parsed.iso, error: null };
}

/** Calendar-picker bridge: "YYYY-MM-DD" → local-midnight Date (or undefined). */
export function dateFromIso(iso: string | null | undefined): Date | undefined {
  if (!iso || !isIsoDate(iso)) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Calendar-picker bridge: the local calendar date of a picked Date → "YYYY-MM-DD". */
export function isoFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
