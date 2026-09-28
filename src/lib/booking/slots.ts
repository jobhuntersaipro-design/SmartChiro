import type { OperatingHoursMap } from "@/types/branch";
import type { WorkingSchedule } from "@/types/doctor";
import { clinicDayBounds, clinicInstant } from "@/lib/clinic-time";
import { DAY_KEYS_BY_WEEKDAY, hasAnyHours } from "@/lib/operating-hours";
import { hasWorkingSchedule, mergeIntervals } from "@/lib/reports/utilisation";
import { addDaysToKey, weekdayOfKey } from "@/lib/reports/range";

/**
 * Online booking slot engine (pure — no DB, no server time zone).
 *
 * Bookable window for a doctor on a clinic day = the doctor's weekly working
 * schedule (else the branch hours) ∩ the branch hours, minus recurring breaks,
 * time off and existing appointments. Slots step through the window from its
 * start by `stepMin`; a slot fits when [start, start + duration) stays inside
 * the window, overlaps nothing blocked, and starts at least `leadMin` after
 * `now`. All wall-clock maths is in the clinic zone via clinic-time.ts.
 */

/** [start, end) in minutes since clinic midnight. */
type Interval = [number, number];

export interface BookingDoctor {
  doctorId: string;
  /** Normalised `DoctorProfile.workingSchedule`; null / empty → branch hours. */
  schedule: WorkingSchedule | null;
  /** Recurring weekly breaks at this branch (clinic wall-clock). */
  breaks: { dayOfWeek: number; startMinute: number; endMinute: number }[];
  /** Leave windows. */
  timeOff: { startDate: Date; endDate: Date }[];
  /** Existing appointments that occupy the doctor (any branch). */
  busy: { start: Date; end: Date }[];
}

export interface SlotRules {
  branchHours: OperatingHoursMap;
  durationMin: number;
  stepMin: number;
  leadMin: number;
  now: Date;
}

export interface AssignedSlot {
  start: Date;
  doctorId: string;
}

const DAY_MINUTES = 24 * 60;

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function intersect(a: Interval, b: Interval): Interval | null {
  const s = Math.max(a[0], b[0]);
  const e = Math.min(a[1], b[1]);
  return e > s ? [s, e] : null;
}

/** The doctor's working window for a weekday (0 = Sunday), in clinic minutes. */
export function workingWindow(
  schedule: WorkingSchedule | null,
  branchHours: OperatingHoursMap,
  weekday: number,
): Interval | null {
  const key = DAY_KEYS_BY_WEEKDAY[weekday];
  const hours = branchHours[key];
  const branchWindow: Interval | null = hours ? [hmToMinutes(hours.open), hmToMinutes(hours.close)] : null;
  if (hasWorkingSchedule(schedule)) {
    const day = schedule[key];
    if (!day) return null;
    const own: Interval = [hmToMinutes(day.start), hmToMinutes(day.end)];
    if (own[1] <= own[0]) return null;
    // A branch with no hours set doesn't narrow the doctor's schedule.
    if (!hasAnyHours(branchHours)) return own;
    return branchWindow ? intersect(own, branchWindow) : null;
  }
  return branchWindow && branchWindow[1] > branchWindow[0] ? branchWindow : null;
}

/** Blocked minutes of one clinic day for a doctor (merged). */
function blockedFor(doctor: BookingDoctor, dateKey: string, weekday: number): Interval[] {
  const { start: dayStart } = clinicDayBounds(dateKey);
  const base = dayStart.getTime();
  const toMin = (d: Date) => (d.getTime() - base) / 60_000;
  const out: Interval[] = doctor.breaks
    .filter((b) => b.dayOfWeek === weekday)
    .map((b) => [b.startMinute, b.endMinute] as Interval);
  for (const off of doctor.timeOff) {
    const s = Math.max(0, toMin(off.startDate));
    const e = Math.min(DAY_MINUTES, toMin(off.endDate));
    if (e > s) out.push([s, e]);
  }
  for (const b of doctor.busy) {
    const s = Math.max(0, toMin(b.start));
    const e = Math.min(DAY_MINUTES, toMin(b.end));
    if (e > s) out.push([s, e]);
  }
  return mergeIntervals(out);
}

/** Slot start instants for one doctor on a clinic day ("YYYY-MM-DD"). */
export function doctorSlots(doctor: BookingDoctor, dateKey: string, rules: SlotRules): Date[] {
  const { durationMin, stepMin, leadMin, now } = rules;
  if (durationMin <= 0 || stepMin <= 0) return [];
  const weekday = weekdayOfKey(dateKey);
  const window = workingWindow(doctor.schedule, rules.branchHours, weekday);
  if (!window) return [];
  const blocked = blockedFor(doctor, dateKey, weekday);
  const earliest = now.getTime() + leadMin * 60_000;
  const [y, m, d] = dateKey.split("-").map(Number);
  const out: Date[] = [];
  for (let s = window[0]; s + durationMin <= window[1]; s += stepMin) {
    const e = s + durationMin;
    if (blocked.some(([bs, be]) => bs < e && be > s)) continue;
    const start = clinicInstant(y, m, d, Math.floor(s / 60), s % 60);
    if (start.getTime() < earliest) continue;
    out.push(start);
  }
  return out;
}

/**
 * "Any doctor": the union of every doctor's slots on the day, each slot
 * assigned to the free doctor with the fewest bookings that day (ties go to
 * the earlier doctor in `doctors`).
 */
export function anyDoctorSlots(doctors: BookingDoctor[], dateKey: string, rules: SlotRules): AssignedSlot[] {
  const { start: dayStart, end: dayEnd } = clinicDayBounds(dateKey);
  const load = (doc: BookingDoctor) =>
    doc.busy.filter((b) => b.start.getTime() >= dayStart.getTime() && b.start.getTime() < dayEnd.getTime()).length;
  const byTime = new Map<number, { doctorId: string; load: number; order: number }>();
  doctors.forEach((doc, order) => {
    const docLoad = load(doc);
    for (const start of doctorSlots(doc, dateKey, rules)) {
      const t = start.getTime();
      const current = byTime.get(t);
      if (!current || docLoad < current.load) byTime.set(t, { doctorId: doc.doctorId, load: docLoad, order });
    }
  });
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ start: new Date(t), doctorId: v.doctorId }));
}

/** Slots for one doctor (`doctorId`) or any of `doctors` ("any"). */
export function slotsFor(
  doctors: BookingDoctor[],
  doctorId: string | "any",
  dateKey: string,
  rules: SlotRules,
): AssignedSlot[] {
  if (doctorId === "any") return anyDoctorSlots(doctors, dateKey, rules);
  const doc = doctors.find((d) => d.doctorId === doctorId);
  return doc ? doctorSlots(doc, dateKey, rules).map((start) => ({ start, doctorId })) : [];
}

/** Every "YYYY-MM-DD" from `from` to `to` inclusive. */
export function dateKeysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let key = from; key <= to; key = addDaysToKey(key, 1)) out.push(key);
  return out;
}

/** First and last bookable clinic days: today … today + horizon. */
export function bookingWindowKeys(todayKey: string, horizonDays: number): { first: string; last: string } {
  return { first: todayKey, last: addDaysToKey(todayKey, Math.max(0, horizonDays)) };
}

/** Days in [from, to] with at least one slot. */
export function availableDays(
  doctors: BookingDoctor[],
  doctorId: string | "any",
  from: string,
  to: string,
  rules: SlotRules,
): string[] {
  return dateKeysBetween(from, to).filter((key) => slotsFor(doctors, doctorId, key, rules).length > 0);
}
