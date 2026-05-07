import type { LeaveType } from "@prisma/client";

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

/**
 * Expand recurring weekly break rows into concrete time slots that fall inside
 * the [windowStart, windowEnd) range. Each occurrence becomes one AvailabilitySlot.
 *
 * The math is timezone-naive: the dayOfWeek + minute-of-day pair is interpreted in
 * the *local* timezone of whatever Date arithmetic the consumer does. That matches
 * how clinics think about working hours ("Mon-Fri 12-1pm local") and avoids the
 * UTC-vs-local confusion DST otherwise creates for recurring schedules.
 */
export function expandBreakTimes(
  breaks: BreakRow[],
  windowStart: Date,
  windowEnd: Date
): AvailabilitySlot[] {
  if (windowEnd.getTime() <= windowStart.getTime()) return [];

  const out: AvailabilitySlot[] = [];

  // Iterate each calendar day in the window
  const cursor = new Date(windowStart);
  cursor.setHours(0, 0, 0, 0);
  const stop = new Date(windowEnd);

  while (cursor.getTime() < stop.getTime()) {
    const dow = cursor.getDay();
    for (const b of breaks) {
      if (b.dayOfWeek !== dow) continue;
      const startTime = new Date(cursor);
      startTime.setHours(Math.floor(b.startMinute / 60), b.startMinute % 60, 0, 0);
      const endTime = new Date(cursor);
      endTime.setHours(Math.floor(b.endMinute / 60), b.endMinute % 60, 0, 0);
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
    cursor.setDate(cursor.getDate() + 1);
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
 * Returns true if [apptStart, apptEnd) overlaps any of the doctor's break-time
 * occurrences inside the window. Used by POST /api/appointments to decide whether
 * to require the booking-on-break confirmation.
 */
export function overlapsBreak(
  doctorId: string,
  apptStart: Date,
  apptEnd: Date,
  breaks: BreakRow[]
): boolean {
  const docBreaks = breaks.filter((b) => b.userId === doctorId);
  if (docBreaks.length === 0) return false;
  // Day-of-week of the appointment start
  const dow = apptStart.getDay();
  for (const b of docBreaks) {
    if (b.dayOfWeek !== dow) continue;
    // Build break window for this specific day
    const breakStart = new Date(apptStart);
    breakStart.setHours(Math.floor(b.startMinute / 60), b.startMinute % 60, 0, 0);
    const breakEnd = new Date(apptStart);
    breakEnd.setHours(Math.floor(b.endMinute / 60), b.endMinute % 60, 0, 0);
    // Half-open overlap: a < B && b > A
    if (apptStart.getTime() < breakEnd.getTime() && apptEnd.getTime() > breakStart.getTime()) {
      return true;
    }
  }
  return false;
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
