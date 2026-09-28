import { clinicDateKey, clinicInstant } from "@/lib/clinic-time";

/**
 * Recurring appointment rules (Phase 3). Pure — no database access.
 *
 * Weekdays (0 = Sunday … 6 = Saturday) and `startTime` ("HH:MM") are clinic
 * wall-clock time; `startDate` / `until` are read as clinic calendar days.
 */
export interface SeriesRule {
  weekdays: number[];
  /** "HH:MM", 24h, clinic time. */
  startTime: string;
  /** Every N weeks, counted from the (Monday-start) week that contains startDate. */
  intervalWeeks: number;
  /** Number of future occurrences to produce. */
  count?: number | null;
  /** Last clinic day (inclusive) an occurrence may fall on. */
  until?: Date | null;
  /** First clinic day an occurrence may fall on. */
  startDate: Date;
}

/** Hard cap on occurrences in one series (two years of weekly visits). */
export const MAX_SERIES_OCCURRENCES = 104;

const DAY_MS = 86_400_000;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidStartTime(value: string): boolean {
  return TIME_RE.test(value);
}

/** Days since the epoch of a "YYYY-MM-DD" key — calendar arithmetic, no zones. */
function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Day number of the Monday that starts the week containing `day`. */
function mondayOf(day: number): number {
  const weekday = new Date(day * DAY_MS).getUTCDay(); // 0 = Sunday
  return day - ((weekday + 6) % 7);
}

/**
 * Ordered occurrences (UTC instants) of a rule. Occurrences at or before `now`
 * are skipped and do not count towards `count`. Stops at `count`, the `until`
 * day, or {@link MAX_SERIES_OCCURRENCES}, whichever comes first.
 */
export function expandSeries(rule: SeriesRule, now: Date = new Date()): Date[] {
  const match = TIME_RE.exec(rule.startTime);
  const weekdays = new Set(rule.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  if (!match || weekdays.size === 0) return [];
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const interval = Math.max(1, Math.floor(rule.intervalWeeks || 1));
  const limit = Math.min(rule.count ?? MAX_SERIES_OCCURRENCES, MAX_SERIES_OCCURRENCES);
  if (limit <= 0) return [];

  const firstDay = dayNumber(clinicDateKey(rule.startDate));
  const lastDay = rule.until ? dayNumber(clinicDateKey(rule.until)) : Number.POSITIVE_INFINITY;
  const firstMonday = mondayOf(firstDay);
  // Enough days to fit the cap even at one visit per interval, plus the past we skip.
  const maxDay = firstDay + (MAX_SERIES_OCCURRENCES + 1) * 7 * interval + Math.max(0, dayNumber(clinicDateKey(now)) - firstDay);

  const out: Date[] = [];
  for (let day = firstDay; day <= lastDay && day <= maxDay && out.length < limit; day++) {
    const weekIndex = Math.floor((mondayOf(day) - firstMonday) / 7);
    if (weekIndex % interval !== 0) continue;
    const date = new Date(day * DAY_MS);
    if (!weekdays.has(date.getUTCDay())) continue;
    const at = clinicInstant(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute);
    if (at.getTime() <= now.getTime()) continue;
    out.push(at);
  }
  return out;
}
