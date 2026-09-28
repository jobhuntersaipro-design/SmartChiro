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

/** Wall-clock fields of an instant in the clinic zone. `month` is 1–12, `weekday` 0 = Sunday. */
export interface ClinicParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

export function clinicParts(instant: Date, timeZone: string = CLINIC_TIME_ZONE): ClinicParts {
  const local = new Date(instant.getTime() + zoneOffsetMs(instant, timeZone));
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    weekday: local.getUTCDay(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of the clinic day containing `instant`. */
export function clinicDateKey(instant: Date = new Date(), timeZone: string = CLINIC_TIME_ZONE): string {
  const p = clinicParts(instant, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** The instant of a clinic wall-clock time (month 1–12). Device time zone plays no part. */
export function clinicInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  timeZone: string = CLINIC_TIME_ZONE,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(asUtc - zoneOffsetMs(new Date(asUtc), timeZone));
}

/** Instant for a "YYYY-MM-DD" date and optional "HH:MM" time in the clinic zone. */
export function clinicInstantFromInputs(isoDate: string, time = "00:00", timeZone: string = CLINIC_TIME_ZONE): Date {
  const [y, mo, d] = isoDate.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return clinicInstant(y, mo, d, hh || 0, mm || 0, timeZone);
}

/** "HH:MM" (24h) of an instant in the clinic zone — for <input type="time">. */
export function clinicTimeInput(instant: Date, timeZone: string = CLINIC_TIME_ZONE): string {
  const p = clinicParts(instant, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Intl formatting pinned to the clinic zone, so server and browser render identically. */
export function formatInClinic(
  instant: Date,
  options: Intl.DateTimeFormatOptions,
  locale = "en-MY",
  timeZone: string = CLINIC_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(instant);
}

/** "+08:00"-style label for the clinic zone (stable for zones without DST). */
export function clinicUtcOffsetLabel(instant: Date = new Date(), timeZone: string = CLINIC_TIME_ZONE): string {
  const mins = Math.round(zoneOffsetMs(instant, timeZone) / 60000);
  const sign = mins < 0 ? "-" : "+";
  const abs = Math.abs(mins);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** "9:30 AM" in the clinic zone. */
export function clinicTimeLabel(instant: Date, timeZone: string = CLINIC_TIME_ZONE): string {
  return formatInClinic(instant, { hour: "numeric", minute: "2-digit", hour12: true }, "en-US", timeZone);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Fixed English date labels in the clinic zone (ICU month abbreviations vary
 * by runtime, e.g. "Sep" vs "Sept", which also breaks hydration):
 * "day" → "Mon, 28 Sep 2026", "short" → "28 Sep 2026", "month" → "September 2026",
 * "numeric" → "28/09/2026".
 */
export function clinicDateLabel(
  instant: Date,
  style: "day" | "short" | "month" | "numeric" = "short",
  timeZone: string = CLINIC_TIME_ZONE,
): string {
  const p = clinicParts(instant, timeZone);
  const mon = MONTHS[p.month - 1];
  switch (style) {
    case "day":
      return `${WEEKDAYS[p.weekday]}, ${p.day} ${mon.slice(0, 3)} ${p.year}`;
    case "month":
      return `${mon} ${p.year}`;
    case "numeric":
      return `${pad2(p.day)}/${pad2(p.month)}/${p.year}`;
    default:
      return `${p.day} ${mon.slice(0, 3)} ${p.year}`;
  }
}
