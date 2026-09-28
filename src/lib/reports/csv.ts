import { clinicDateLabel } from "@/lib/clinic-time";
import { formatDayKey } from "@/lib/reports/range";

/**
 * CSV for report exports (RFC 4180): comma separated, CRLF line ends, fields
 * quoted when they hold a comma, quote or line break, quotes doubled. Money
 * is a plain number with 2 dp (spreadsheets sum it), dates are dd/mm/yyyy.
 */

/** A value written as-is (already formatted, never formula-guarded): money and percentages. */
export interface CsvRaw {
  raw: string;
}

export type CsvCell = string | number | CsvRaw | null | undefined;

/** Text that a spreadsheet would run as a formula (=, +, -, @, tab, CR) gets a leading apostrophe. */
function neutraliseFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function csvField(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "number"
      ? Number.isFinite(value)
        ? String(value)
        : ""
      : typeof value === "string"
        ? neutraliseFormula(value)
        : value.raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

/** MYR as "1234.50" / "-20.00" — no currency sign or thousands separator. */
export function csvMoney(amount: number): CsvRaw {
  return { raw: (Math.round(amount * 100) / 100).toFixed(2) };
}

/** dd/mm/yyyy for a "YYYY-MM-DD" key or an ISO instant (clinic day). */
export function csvDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDayKey(value);
  return clinicDateLabel(typeof value === "string" ? new Date(value) : value, "numeric");
}

/** A rate as a percentage number with 1 dp ("12.5"), blank without a denominator. */
export function csvPercent(value: number | null): CsvRaw {
  return { raw: value === null ? "" : (Math.round(value * 1000) / 10).toFixed(1) };
}

/** "smartchiro-revenue-by-doctor-2026-09-01-to-2026-09-30.csv" */
export function csvFileName(parts: string[], range: { from: string; to: string }): string {
  const slug = parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `smartchiro-${slug}-${range.from}-to-${range.to}.csv`;
}
