import { prisma } from "@/lib/prisma";

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
 * Excludes CANCELLED, COMPLETED, NO_SHOW status — only SCHEDULED and
 * CHECKED_IN occupy the doctor's time. Same-doctor only.
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
  const candidateStart = new Date(start.getTime() - 8 * 60 * 60 * 1000);
  const candidates = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: { in: ["SCHEDULED", "CHECKED_IN"] },
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
