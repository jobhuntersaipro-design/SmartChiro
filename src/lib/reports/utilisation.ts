import type { OperatingHoursMap } from "@/types/branch";
import type { WorkingSchedule } from "@/types/doctor";
import { clinicInstant } from "@/lib/clinic-time";
import { DAY_KEYS_BY_WEEKDAY } from "@/lib/operating-hours";
import { addDaysToKey, weekdayOfKey, type DayRange } from "@/lib/reports/range";
import { rate } from "@/lib/reports/rates";

/**
 * Available minutes for utilisation (pure): the doctor's weekly working
 * schedule — or, without one, their branches' opening hours — for every
 * clinic day in the range, minus recurring breaks and time off.
 */

/** [start, end) in minutes since clinic midnight. */
type Interval = [number, number];

const DAY_MINUTES = 24 * 60;

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** Sorted, non-overlapping union. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

const length = (intervals: Interval[]) => intervals.reduce((sum, [s, e]) => sum + (e - s), 0);

/** Minutes of `work` (merged) not covered by `blocked` (merged). */
export function minutesLeft(work: Interval[], blocked: Interval[]): number {
  let overlap = 0;
  for (const [ws, we] of work) {
    for (const [bs, be] of blocked) overlap += Math.max(0, Math.min(we, be) - Math.max(ws, bs));
  }
  return length(work) - overlap;
}

export function hasWorkingSchedule(schedule: WorkingSchedule | null | undefined): schedule is WorkingSchedule {
  return !!schedule && Object.values(schedule).some((day) => !!day);
}

export interface AvailabilityInput {
  range: DayRange;
  /** Normalised `DoctorProfile.workingSchedule` (short day keys). */
  schedule: WorkingSchedule | null;
  /** Opening hours of the doctor's branches in scope; their union is the fallback. */
  branchHours: OperatingHoursMap[];
  /** Recurring weekly breaks (clinic wall-clock). */
  breaks: { dayOfWeek: number; startMinute: number; endMinute: number }[];
  /** Leave windows (instants). */
  timeOff: { startDate: Date; endDate: Date }[];
}

export interface Availability {
  availableMinutes: number;
  source: "schedule" | "branch_hours" | "none";
}

function workFor(input: AvailabilityInput, weekday: number, useSchedule: boolean): Interval[] {
  const key = DAY_KEYS_BY_WEEKDAY[weekday];
  if (useSchedule) {
    const slot = input.schedule?.[key];
    return slot ? mergeIntervals([[hmToMinutes(slot.start), hmToMinutes(slot.end)]]) : [];
  }
  return mergeIntervals(
    input.branchHours.flatMap((map) => {
      const h = map[key];
      return h ? [[hmToMinutes(h.open), hmToMinutes(h.close)] as Interval] : [];
    }),
  );
}

export function availableMinutes(input: AvailabilityInput): Availability {
  const useSchedule = hasWorkingSchedule(input.schedule);
  const hasHours = input.branchHours.some((map) => Object.values(map).some(Boolean));
  const source = useSchedule ? "schedule" : hasHours ? "branch_hours" : "none";
  if (source === "none") return { availableMinutes: 0, source };

  let total = 0;
  for (let key = input.range.from; key <= input.range.to; key = addDaysToKey(key, 1)) {
    const weekday = weekdayOfKey(key);
    const work = workFor(input, weekday, useSchedule);
    if (work.length === 0) continue;
    const [y, m, d] = key.split("-").map(Number);
    const dayStart = clinicInstant(y, m, d).getTime();
    const blocked: Interval[] = input.breaks
      .filter((b) => b.dayOfWeek === weekday)
      .map((b) => [b.startMinute, b.endMinute] as Interval);
    for (const off of input.timeOff) {
      const s = Math.max(0, (off.startDate.getTime() - dayStart) / 60_000);
      const e = Math.min(DAY_MINUTES, (off.endDate.getTime() - dayStart) / 60_000);
      if (e > s) blocked.push([s, e]);
    }
    total += minutesLeft(work, mergeIntervals(blocked));
  }
  return { availableMinutes: Math.round(total), source };
}

export function utilisationRate(bookedMinutes: number, available: number): number | null {
  return rate(bookedMinutes, available);
}
