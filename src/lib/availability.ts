import type { LeaveType } from "@prisma/client";
import { clinicInstant, clinicParts } from "@/lib/clinic-time";

export type AvailabilityKind = "TIME_OFF" | "BREAK_TIME";

export interface AvailabilitySlot {
  doctorId: string;
  kind: AvailabilityKind;
  /** ISO start time (inclusive). For TIME_OFF this is the start of the leave window. */
  start: string;
  /** ISO end time (exclusive). */
  end: string;
  /** For TIME_OFF only — the leave reason. */
  leaveType?: LeaveType;
  /** For BREAK_TIME only — optional human label like "Lunch". */
  label?: string;
}

export interface BreakRow {
  userId: string;
  branchId: string;
  dayOfWeek: number; // 0..6 (Sun..Sat)
  startMinute: number;
  endMinute: number;
  label: string | null;
}

export interface TimeOffRow {
  userId: string;
  branchId: string | null;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  notes: string | null;
}

/** The instant a break's minute-of-day falls on, for a clinic calendar day (month 1–12). */
function breakInstant(year: number, month: number, day: number, minuteOfDay: number): Date {
  return clinicInstant(year, month, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
}

/**
 * Expand recurring weekly break rows into concrete time slots that fall inside
 * the [windowStart, windowEnd) range. Each occurrence becomes one AvailabilitySlot.
 *
 * `dayOfWeek` + minute-of-day are clinic wall-clock time ("Mon-Fri 12-1pm" in the
 * clinic's zone), resolved with the clinic-time helpers so the result doesn't
 * depend on the server's time zone (UTC on Vercel).
 */
export function expandBreakTimes(
  breaks: BreakRow[],
  windowStart: Date,
  windowEnd: Date
): AvailabilitySlot[] {
  if (windowEnd.getTime() <= windowStart.getTime()) return [];

  const out: AvailabilitySlot[] = [];

  // Iterate each clinic calendar day in the window
  const first = clinicParts(windowStart);
  for (let offset = 0; ; offset++) {
    const dayStart = clinicInstant(first.year, first.month, first.day + offset);
    if (dayStart.getTime() >= windowEnd.getTime()) break;
    const { year, month, day, weekday } = clinicParts(dayStart);
    for (const b of breaks) {
      if (b.dayOfWeek !== weekday) continue;
      const startTime = breakInstant(year, month, day, b.startMinute);
      const endTime = breakInstant(year, month, day, b.endMinute);
      // Clip to window bounds
      if (endTime.getTime() <= windowStart.getTime()) continue;
      if (startTime.getTime() >= windowEnd.getTime()) continue;
      out.push({
        doctorId: b.userId,
        kind: "BREAK_TIME",
        start: new Date(Math.max(startTime.getTime(), windowStart.getTime())).toISOString(),
        end: new Date(Math.min(endTime.getTime(), windowEnd.getTime())).toISOString(),
        label: b.label ?? undefined,
      });
    }
  }

  return out;
}

/**
 * Convert a list of time-off rows into AvailabilitySlots clipped to the calendar window.
 */
export function expandTimeOff(
  rows: TimeOffRow[],
  windowStart: Date,
  windowEnd: Date
): AvailabilitySlot[] {
  const out: AvailabilitySlot[] = [];
  for (const r of rows) {
    const start = r.startDate.getTime();
    const end = r.endDate.getTime();
    if (end <= windowStart.getTime()) continue;
    if (start >= windowEnd.getTime()) continue;
    out.push({
      doctorId: r.userId,
      kind: "TIME_OFF",
      start: new Date(Math.max(start, windowStart.getTime())).toISOString(),
      end: new Date(Math.min(end, windowEnd.getTime())).toISOString(),
      leaveType: r.type,
    });
  }
  return out;
}

/**
 * The doctor's break that [apptStart, apptEnd) overlaps on the appointment's
 * clinic day, or null. Used by POST /api/appointments to decide whether to
 * require the booking-on-break confirmation.
 */
export function findOverlappingBreak(
  doctorId: string,
  apptStart: Date,
  apptEnd: Date,
  breaks: BreakRow[]
): BreakRow | null {
  const { year, month, day, weekday } = clinicParts(apptStart);
  for (const b of breaks) {
    if (b.userId !== doctorId || b.dayOfWeek !== weekday) continue;
    const breakStart = breakInstant(year, month, day, b.startMinute);
    const breakEnd = breakInstant(year, month, day, b.endMinute);
    // Half-open overlap: a < B && b > A
    if (apptStart.getTime() < breakEnd.getTime() && apptEnd.getTime() > breakStart.getTime()) {
      return b;
    }
  }
  return null;
}

/** True if [apptStart, apptEnd) overlaps one of the doctor's breaks (clinic time). */
export function overlapsBreak(
  doctorId: string,
  apptStart: Date,
  apptEnd: Date,
  breaks: BreakRow[]
): boolean {
  return findOverlappingBreak(doctorId, apptStart, apptEnd, breaks) !== null;
}

/**
 * Returns true if the doctor is on time-off (any leave type) at the apptStart instant.
 */
export function isOnTimeOff(
  doctorId: string,
  apptStart: Date,
  rows: TimeOffRow[]
): boolean {
  const t = apptStart.getTime();
  return rows.some(
    (r) =>
      r.userId === doctorId &&
      r.startDate.getTime() <= t &&
      r.endDate.getTime() > t
  );
}
