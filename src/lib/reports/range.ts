import { clinicDateKey, clinicDayBounds } from "@/lib/clinic-time";

/**
 * Report date ranges. A range is a run of whole clinic days (Asia/Kuala_Lumpur)
 * written as "YYYY-MM-DD" keys, `to` inclusive; queries use the half-open
 * instant window [start, end). Pure and client-safe.
 */

export type RangePreset = "today" | "week" | "month" | "lastMonth" | "last90" | "custom";

export const RANGE_PRESETS: { id: Exclude<RangePreset, "custom">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "last90", label: "Last 90 days" },
];

/** Longest range a report accepts (days). */
export const MAX_RANGE_DAYS = 366;

export interface DayRange {
  from: string;
  to: string;
}

export interface ReportRange extends DayRange {
  /** Instant of `from` 00:00 clinic time. */
  start: Date;
  /** Instant of the day after `to`, 00:00 clinic time (exclusive). */
  end: Date;
  days: number;
}

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** Day number of a "YYYY-MM-DD" key (days since 1970-01-01), or null when it isn't a real date. */
export function keyToDayNumber(key: string): number | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t / DAY_MS;
}

export function dayNumberToKey(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDaysToKey(key: string, days: number): string {
  const n = keyToDayNumber(key);
  if (n === null) throw new Error(`Invalid date key: ${key}`);
  return dayNumberToKey(n + days);
}

/** 0 = Sunday … 6 = Saturday for a date key. */
export function weekdayOfKey(key: string): number {
  const n = keyToDayNumber(key);
  if (n === null) throw new Error(`Invalid date key: ${key}`);
  return new Date(n * DAY_MS).getUTCDay();
}

/** The Monday on or before `key`. */
export function mondayOf(key: string): string {
  return addDaysToKey(key, -((weekdayOfKey(key) + 6) % 7));
}

function monthBounds(year: number, month: number): DayRange {
  // month is 1–12; Date.UTC normalises month overflow / day 0.
  const first = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from: first, to: last };
}

/** Clinic-day range for a preset, relative to `now`. Weeks start on Monday; months are whole months. */
export function presetRange(preset: Exclude<RangePreset, "custom">, now: Date = new Date()): DayRange {
  const today = clinicDateKey(now);
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const monday = mondayOf(today);
      return { from: monday, to: addDaysToKey(monday, 6) };
    }
    case "month":
      return monthBounds(y, m);
    case "lastMonth":
      return monthBounds(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
    case "last90":
      return { from: addDaysToKey(today, -89), to: today };
  }
}

/** Which preset a range matches (for highlighting the picker), else "custom". */
export function detectPreset(range: DayRange, now: Date = new Date()): RangePreset {
  for (const { id } of RANGE_PRESETS) {
    const p = presetRange(id, now);
    if (p.from === range.from && p.to === range.to) return id;
  }
  return "custom";
}

export type ParseRangeResult = { ok: true; range: ReportRange } | { ok: false; error: string; message: string };

/**
 * `?from=&to=` → a validated range. Both missing = this month. One missing =
 * a single day. Rejects bad dates, from after to and ranges longer than
 * MAX_RANGE_DAYS.
 */
export function parseRange(from: string | null | undefined, to: string | null | undefined, now: Date = new Date()): ParseRangeResult {
  const fallback = presetRange("month", now);
  const f = from?.trim() || (to?.trim() ? to.trim() : fallback.from);
  const t = to?.trim() || (from?.trim() ? from.trim() : fallback.to);
  const fn = keyToDayNumber(f);
  const tn = keyToDayNumber(t);
  if (fn === null || tn === null) {
    return { ok: false, error: "invalid_range", message: "Dates must be real calendar days as YYYY-MM-DD." };
  }
  if (fn > tn) return { ok: false, error: "invalid_range", message: "The start date is after the end date." };
  const days = tn - fn + 1;
  if (days > MAX_RANGE_DAYS) {
    return { ok: false, error: "range_too_long", message: `Pick a range of at most ${MAX_RANGE_DAYS} days.` };
  }
  return { ok: true, range: { from: f, to: t, start: clinicDayBounds(f).start, end: clinicDayBounds(t).end, days } };
}

/** "dd/mm/yyyy" for a "YYYY-MM-DD" key. */
export function formatDayKey(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

/** "01/09/2026 – 30/09/2026", or one date for a single day. */
export function formatRangeLabel(range: DayRange): string {
  return range.from === range.to ? formatDayKey(range.from) : `${formatDayKey(range.from)} – ${formatDayKey(range.to)}`;
}
