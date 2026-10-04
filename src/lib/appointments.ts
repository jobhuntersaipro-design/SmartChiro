import { prisma } from "@/lib/prisma";

/** Statuses that hold the doctor's time (a started visit too). */
export const ACTIVE_APPOINTMENT_STATUSES = ["SCHEDULED", "CHECKED_IN", "IN_PROGRESS"] as const;
/** Longest bookable visit; the conflict pre-filter relies on it. */
export const MAX_APPOINTMENT_MINUTES = 480;

/** The doctor's leave (for this branch or all branches) overlapping [start, end), or null. */
export async function findLeaveOverlap(doctorId: string, branchId: string, start: Date, end: Date) {
  return prisma.doctorTimeOff.findFirst({
    where: { userId: doctorId, OR: [{ branchId: null }, { branchId }], startDate: { lt: end }, endDate: { gt: start } },
    select: { type: true, startDate: true, endDate: true },
  });
}

/** "annual leave" from ANNUAL_LEAVE. */
export function leaveLabel(type: string): string {
  return type.toLowerCase().replace(/_/g, " ");
}

export type AppointmentConflict = {
  id: string;
  dateTime: Date;
  duration: number;
  patient: { firstName: string; lastName: string };
};

/**
 * Returns appointments that overlap [start, end) for the given doctor.
 *
 * Overlap rule: existingStart < end && existingEnd > start, where
 * existingEnd = existingStart + duration*60_000 ms. Adjacent (touching)
 * times do NOT count as conflicts.
 *
 * Excludes CANCELLED, COMPLETED, NO_SHOW status — only SCHEDULED,
 * CHECKED_IN and IN_PROGRESS occupy the doctor's time. Same-doctor only.
 */
export async function findConflictingAppointments(args: {
  doctorId: string;
  start: Date;
  end: Date;
  excludeId?: string;
}): Promise<AppointmentConflict[]> {
  const { doctorId, start, end, excludeId } = args;

  // Loose pre-filter via DB to keep the row count small. Any conflicting
  // appointment must start before `end` (which excludes far-future ones)
  // AND must start no earlier than `start - 8h` (a duration cap — clinic
  // appointments shouldn't last longer than 8h, so anything starting before
  // that window can't be ongoing at `start`).
  const candidateStart = new Date(start.getTime() - MAX_APPOINTMENT_MINUTES * 60_000);
  const candidates = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      dateTime: { gte: candidateStart, lt: end },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      dateTime: true,
      duration: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });

  // Precise overlap filter in JS using computed end times.
  const startMs = start.getTime();
  const endMs = end.getTime();
  return candidates.filter((a) => {
    const aStartMs = a.dateTime.getTime();
    const aEndMs = aStartMs + a.duration * 60_000;
    return aStartMs < endMs && aEndMs > startMs;
  });
}

/**
 * Batch form of {@link findConflictingAppointments} for many windows of one
 * doctor (recurring series): one query, same overlap rule and statuses.
 * Returns the conflicts of each window, in input order.
 */
export async function findConflictsForWindows(args: {
  doctorId: string;
  windows: { start: Date; end: Date }[];
  excludeIds?: string[];
}): Promise<AppointmentConflict[][]> {
  const { doctorId, windows, excludeIds } = args;
  if (windows.length === 0) return [];
  const minStart = Math.min(...windows.map((w) => w.start.getTime()));
  const maxEnd = Math.max(...windows.map((w) => w.end.getTime()));
  const candidates = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      dateTime: { gte: new Date(minStart - MAX_APPOINTMENT_MINUTES * 60_000), lt: new Date(maxEnd) },
      ...(excludeIds && excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    },
    select: {
      id: true,
      dateTime: true,
      duration: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });
  return windows.map(({ start, end }) =>
    candidates.filter((a) => {
      const aStartMs = a.dateTime.getTime();
      const aEndMs = aStartMs + a.duration * 60_000;
      return aStartMs < end.getTime() && aEndMs > start.getTime();
    }),
  );
}
