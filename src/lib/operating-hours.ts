import type { DayHours, OperatingHoursMap } from "@/types/branch";
import type { DaySchedule, WorkingSchedule } from "@/types/doctor";
import { clinicParts } from "@/lib/clinic-time";

/**
 * Branch opening hours and doctor working schedules.
 *
 * `Branch.operatingHours` is a free String column. The UI writes JSON
 * (`{"mon":{"open":"09:00","close":"18:00"}}`, missing day = closed), but
 * older rows and seeds hold free text such as "Mon-Fri 9am-6pm, Sat 9am-1pm".
 * Every reader goes through `parseOperatingHours`, which accepts both.
 */

export type DayKey = keyof OperatingHoursMap;

/** Indexed by weekday, 0 = Sunday (matches `clinicParts().weekday`). */
export const DAY_KEYS_BY_WEEKDAY: readonly DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Display order, Monday first. */
export const WEEK_ORDER: readonly DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const SHORT_LABELS: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

const LONG_LABELS: Record<DayKey, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

const HM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** "mon", "Monday", "TUES", "thurs" → "mon" / "tue" / "thu". */
function toDayKey(raw: string): DayKey | null {
  const k = raw.trim().toLowerCase().slice(0, 3);
  return (WEEK_ORDER as readonly string[]).includes(k) ? (k as DayKey) : null;
}

function toMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function toHm(minutes: number): string {
  const clamped = Math.min(Math.max(minutes, 0), 23 * 60 + 59);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

function normalizeHm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = HM_RE.exec(value.trim());
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function validRange(open: string | null, close: string | null): DayHours | null {
  if (!open || !close) return null;
  return toMinutes(open) < toMinutes(close) ? { open, close } : null;
}

// ─── JSON format ───

function fromJson(value: unknown): OperatingHoursMap {
  const out: OperatingHoursMap = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [rawKey, rawDay] of Object.entries(value as Record<string, unknown>)) {
    const key = toDayKey(rawKey);
    if (!key || !rawDay || typeof rawDay !== "object") continue;
    const day = rawDay as Record<string, unknown>;
    const range = validRange(normalizeHm(day.open ?? day.start), normalizeHm(day.close ?? day.end));
    if (range) out[key] = range;
  }
  return out;
}

// ─── Legacy free text ───

const DAY_TOKEN_RE =
  /\b(daily|every\s*day|everyday|weekdays?|weekends?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/gi;
const RANGE_SEPARATOR_RE = /^\s*(?:-|–|—|to|until|through|thru)\s*$/i;
const TIME_RANGE_RE =
  /(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i;

function daysForToken(token: string): DayKey[] {
  const t = token.toLowerCase().replace(/\s+/g, "");
  if (t === "daily" || t === "everyday") return [...WEEK_ORDER];
  if (t.startsWith("weekday")) return ["mon", "tue", "wed", "thu", "fri"];
  if (t.startsWith("weekend")) return ["sat", "sun"];
  const key = toDayKey(t);
  return key ? [key] : [];
}

function expandDayRange(from: DayKey, to: DayKey): DayKey[] {
  const start = WEEK_ORDER.indexOf(from);
  const end = WEEK_ORDER.indexOf(to);
  const out: DayKey[] = [];
  for (let i = start; ; i = (i + 1) % 7) {
    out.push(WEEK_ORDER[i]);
    if (i === end) break;
  }
  return out;
}

/** Days named in a fragment: "Mon-Fri", "Mon & Wed", "Sat to Mon", "Weekdays". */
function parseDays(text: string): DayKey[] {
  const tokens = [...text.matchAll(DAY_TOKEN_RE)];
  const days = new Set<DayKey>();
  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i];
    const next = tokens[i + 1];
    const currentDays = daysForToken(current[0]);
    if (next && currentDays.length === 1) {
      const between = text.slice(current.index! + current[0].length, next.index);
      const nextDays = daysForToken(next[0]);
      if (RANGE_SEPARATOR_RE.test(between) && nextDays.length === 1) {
        expandDayRange(currentDays[0], nextDays[0]).forEach((d) => days.add(d));
        i++;
        continue;
      }
    }
    currentDays.forEach((d) => days.add(d));
  }
  return WEEK_ORDER.filter((d) => days.has(d));
}

function to24h(hour: number, meridiem: string | undefined): number {
  if (!meridiem) return hour;
  const pm = meridiem.toLowerCase().startsWith("p");
  if (hour === 12) return pm ? 12 : 0;
  return pm ? hour + 12 : hour;
}

/** "9am-6pm", "09:00-18:00", "9-6", "1-5pm" → minutes since midnight. */
function parseTimeRange(text: string): { open: number; close: number } | null {
  const m = TIME_RANGE_RE.exec(text);
  if (!m) return null;
  const [, oh, om, omer, ch, cm, cmer] = m;
  const openMin = Number(om ?? 0);
  const closeMin = Number(cm ?? 0);
  const close = to24h(Number(ch), cmer) * 60 + closeMin;
  let open = to24h(Number(oh), omer) * 60 + openMin;
  // "1-5pm": an open time without am/pm takes the closing meridiem when that still opens first.
  if (!omer && cmer) {
    const shared = to24h(Number(oh), cmer) * 60 + openMin;
    if (shared < close) open = shared;
  }
  let closeAdjusted = close;
  // "9-6" / "9am-6": a bare closing hour before the opening one is afternoon.
  if (!cmer && closeAdjusted <= open && Number(ch) < 12) closeAdjusted += 12 * 60;
  // "…-12am" means midnight.
  if (closeAdjusted === 0 && open > 0) closeAdjusted = 24 * 60 - 1;
  if (open >= closeAdjusted || closeAdjusted >= 24 * 60) return null;
  return { open, close: closeAdjusted };
}

function fromFreeText(text: string): OperatingHoursMap {
  const out: OperatingHoursMap = {};
  if (/24\s*\/\s*7|24\s*hours/i.test(text)) {
    for (const d of WEEK_ORDER) out[d] = { open: "00:00", close: "23:59" };
    return out;
  }
  // Segments without a time ("Mon, Wed, Fri 9-5") carry their days to the next timed one.
  let pending: DayKey[] = [];
  for (const segment of text.split(/[,;\n|]+/)) {
    const range = TIME_RANGE_RE.exec(segment);
    const dayText = range ? segment.slice(0, range.index) + segment.slice(range.index + range[0].length) : segment;
    const days = [...pending, ...parseDays(dayText)];
    if (/\bclosed\b/i.test(segment)) {
      days.forEach((d) => delete out[d]);
      pending = [];
      continue;
    }
    if (!range) {
      pending = days;
      continue;
    }
    pending = [];
    const times = parseTimeRange(segment.slice(range.index));
    if (!times) continue;
    for (const d of days) out[d] = { open: toHm(times.open), close: toHm(times.close) };
  }
  return out;
}

// ─── Public API ───

/** Parse `Branch.operatingHours` — JSON or legacy free text. Unreadable input gives `{}`. */
export function parseOperatingHours(raw: string | null | undefined): OperatingHoursMap {
  const text = raw?.trim();
  if (!text) return {};
  if (text.startsWith("{")) {
    try {
      return fromJson(JSON.parse(text));
    } catch {
      return {};
    }
  }
  return fromFreeText(text);
}

export function hasAnyHours(map: OperatingHoursMap): boolean {
  return WEEK_ORDER.some((d) => !!map[d]);
}

/** Hours for a weekday (0 = Sunday), or null when closed. */
export function hoursForDay(map: OperatingHoursMap, weekday0Sun: number): DayHours | null {
  return map[DAY_KEYS_BY_WEEKDAY[weekday0Sun]] ?? null;
}

/**
 * True when [start, start + duration) lies inside the opening window of the
 * clinic day `start` falls on (clinic time zone, not the server's).
 */
export function isWithinHours(map: OperatingHoursMap, start: Date, durationMin: number): boolean {
  const p = clinicParts(start);
  const hours = hoursForDay(map, p.weekday);
  if (!hours) return false;
  const startMin = p.hour * 60 + p.minute;
  const endMin = startMin + durationMin;
  return startMin >= toMinutes(hours.open) && endMin <= toMinutes(hours.close);
}

/** "09:00" → "9:00 AM". */
export function formatTime12(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatDayHours(hours: DayHours): string {
  return `${formatTime12(hours.open)}–${formatTime12(hours.close)}`;
}

/** "Mon 9:00 AM–6:00 PM" or "Closed on Sunday" for a weekday (0 = Sunday). */
export function describeDayHours(map: OperatingHoursMap, weekday0Sun: number): string {
  const key = DAY_KEYS_BY_WEEKDAY[weekday0Sun];
  const hours = map[key];
  return hours ? `${SHORT_LABELS[key]} ${formatDayHours(hours)}` : `Closed on ${LONG_LABELS[key]}`;
}

/**
 * Booking gate: when the branch has hours and [start, start + duration) is
 * outside them, the hours line for that clinic day ("Mon 9:00 AM–6:00 PM",
 * "Closed on Sunday"); otherwise null. Branches without hours never block.
 */
export function outsideHoursSummary(
  rawHours: string | null | undefined,
  start: Date,
  durationMin: number,
): string | null {
  const map = parseOperatingHours(rawHours);
  if (!hasAnyHours(map) || isWithinHours(map, start, durationMin)) return null;
  return describeDayHours(map, clinicParts(start).weekday);
}

/** The weekly hours in one line — "Mon–Fri 9:00 AM–6:00 PM, Sat 9:00 AM–1:00 PM". Null when no hours. */
export function summarizeOperatingHours(map: OperatingHoursMap): string | null {
  const groups: { days: DayKey[]; hours: DayHours }[] = [];
  for (const d of WEEK_ORDER) {
    const hours = map[d];
    if (!hours) continue;
    const last = groups[groups.length - 1];
    const prevDay = last ? last.days[last.days.length - 1] : null;
    const consecutive = prevDay !== null && WEEK_ORDER.indexOf(prevDay) === WEEK_ORDER.indexOf(d) - 1;
    if (last && consecutive && last.hours.open === hours.open && last.hours.close === hours.close) {
      last.days.push(d);
    } else {
      groups.push({ days: [d], hours });
    }
  }
  if (groups.length === 0) return null;
  return groups
    .map(({ days, hours }) => {
      const label =
        days.length === 1
          ? SHORT_LABELS[days[0]]
          : `${SHORT_LABELS[days[0]]}–${SHORT_LABELS[days[days.length - 1]]}`;
      return `${label} ${formatDayHours(hours)}`;
    })
    .join(", ");
}

/**
 * `DoctorProfile.workingSchedule` with short day keys. Older rows (and seeds)
 * used `monday…sunday`; the UI and PATCH validator use `mon…sun`.
 */
export function normalizeWorkingSchedule(json: unknown): WorkingSchedule | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const out: WorkingSchedule = {};
  for (const [rawKey, rawDay] of Object.entries(json as Record<string, unknown>)) {
    const key = toDayKey(rawKey);
    if (!key) continue;
    if (!rawDay || typeof rawDay !== "object") {
      out[key] = null;
      continue;
    }
    const day = rawDay as Record<string, unknown>;
    const start = normalizeHm(day.start ?? day.open);
    const end = normalizeHm(day.end ?? day.close);
    const slot: DaySchedule | null = start && end ? { start, end } : null;
    out[key] = slot;
  }
  return out;
}
