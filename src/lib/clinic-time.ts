/**
 * The clinic's calendar ("today", "this week", "this month") as UTC instants
 * for database queries. The server runs in UTC (Vercel), so building
 * boundaries with `new Date(y, m, d)` gave the UTC day — before 8 am in
 * Malaysia the dashboard showed yesterday's schedule.
 *
 * Uses the zone's offset at `now`; exact for zones without daylight saving
 * (Asia/Kuala_Lumpur, the default).
 */
export const CLINIC_TIME_ZONE = process.env.CLINIC_TIME_ZONE || "Asia/Kuala_Lumpur";

/** Milliseconds the zone is ahead of UTC at `instant`. */
export function zoneOffsetMs(instant: Date, timeZone: string = CLINIC_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export interface ClinicCalendar {
  dayStart: Date;
  dayEnd: Date;
  /** Sunday 00:00 of the current week. */
  weekStart: Date;
  monthStart: Date;
  nextMonthStart: Date;
  lastMonthStart: Date;
  /** 00:00 of the clinic day `n` days from today. */
  addDays: (n: number) => Date;
}

export function clinicCalendar(now: Date = new Date(), timeZone: string = CLINIC_TIME_ZONE): ClinicCalendar {
  const offset = zoneOffsetMs(now, timeZone);
  const local = new Date(now.getTime() + offset); // UTC fields read as clinic wall-clock
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const at = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day) - offset);
  return {
    dayStart: at(y, m, d),
    dayEnd: at(y, m, d + 1),
    weekStart: at(y, m, d - local.getUTCDay()),
    monthStart: at(y, m, 1),
    nextMonthStart: at(y, m + 1, 1),
    lastMonthStart: at(y, m - 1, 1),
    addDays: (n) => at(y, m, d + n),
  };
}

/** Clinic-day bounds for a "YYYY-MM-DD" date. */
export function clinicDayBounds(isoDate: string, timeZone: string = CLINIC_TIME_ZONE): { start: Date; end: Date } {
  const [y, mo, d] = isoDate.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(y, mo - 1, d, 12));
  const offset = zoneOffsetMs(noonUtc, timeZone);
  return { start: new Date(Date.UTC(y, mo - 1, d) - offset), end: new Date(Date.UTC(y, mo - 1, d + 1) - offset) };
}
