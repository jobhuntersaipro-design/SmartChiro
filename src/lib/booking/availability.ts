import type { Prisma, TreatmentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CLINICIAN_ROLES } from "@/lib/clinician";
import { clinicDateKey, clinicDayBounds } from "@/lib/clinic-time";
import { normalizeWorkingSchedule, parseOperatingHours } from "@/lib/operating-hours";
import { defaultDurationFor } from "@/lib/treatment-colors";
import { displayDoctorName } from "@/lib/format";
import { addDaysToKey } from "@/lib/reports/range";
import { bookingWindowKeys, type BookingDoctor, type SlotRules } from "@/lib/booking/slots";

/** Statuses that keep a doctor busy. */
export const BUSY_STATUSES = ["SCHEDULED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"] as const;

type Db = typeof prisma | Prisma.TransactionClient;

/** Branch columns the booking flow reads. */
export const BOOKING_BRANCH_SELECT = {
  id: true,
  name: true,
  address: true,
  city: true,
  state: true,
  phone: true,
  logo: true,
  operatingHours: true,
  bookingEnabled: true,
  bookingSlug: true,
  bookingLeadMinutes: true,
  bookingHorizonDays: true,
  bookingSlotMinutes: true,
  bookingTreatments: true,
  bookingDoctorIds: true,
  bookingNote: true,
} satisfies Prisma.BranchSelect;

export type BookingBranch = Prisma.BranchGetPayload<{ select: typeof BOOKING_BRANCH_SELECT }>;

/** Enabled branch for a public slug, or null (unknown or switched off). */
export async function findBookableBranch(slug: string, db: Db = prisma): Promise<BookingBranch | null> {
  const branch = await db.branch.findUnique({ where: { bookingSlug: slug }, select: BOOKING_BRANCH_SELECT });
  return branch && branch.bookingEnabled ? branch : null;
}

export interface BookableDoctor {
  id: string;
  name: string;
  image: string | null;
  schedule: ReturnType<typeof normalizeWorkingSchedule>;
}

/**
 * Clinicians the page may book: the branch's chosen doctors (every clinician
 * when none are chosen), minus inactive doctor profiles. Stable order by name.
 */
export async function loadBookableDoctors(branch: BookingBranch, db: Db = prisma): Promise<BookableDoctor[]> {
  const members = await db.branchMember.findMany({
    where: {
      branchId: branch.id,
      role: { in: CLINICIAN_ROLES },
      ...(branch.bookingDoctorIds.length > 0 ? { userId: { in: branch.bookingDoctorIds } } : {}),
    },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
          doctorProfile: { select: { workingSchedule: true, isActive: true } },
        },
      },
    },
  });
  return members
    .filter((m) => m.user.doctorProfile?.isActive !== false)
    .map((m) => ({
      id: m.user.id,
      name: displayDoctorName(m.user.name, "Doctor"),
      image: m.user.image,
      schedule: normalizeWorkingSchedule(m.user.doctorProfile?.workingSchedule),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface BookingAvailability {
  doctors: BookingDoctor[];
  rules: SlotRules;
  /** First / last clinic day that can be booked. */
  window: { first: string; last: string };
}

/**
 * Everything the slot engine needs for [fromKey, toKey] (clinic days), for the
 * given doctors. One query per table (breaks, time off, appointments).
 */
export async function loadBookingAvailability(args: {
  branch: BookingBranch;
  doctors: BookableDoctor[];
  fromKey: string;
  toKey: string;
  treatment: TreatmentType;
  now?: Date;
  db?: Db;
}): Promise<BookingAvailability> {
  const { branch, doctors, fromKey, toKey, treatment } = args;
  const now = args.now ?? new Date();
  const db = args.db ?? prisma;
  const ids = doctors.map((d) => d.id);
  const rangeStart = clinicDayBounds(fromKey).start;
  const rangeEnd = clinicDayBounds(toKey).end;

  const [breaks, timeOff, appointments] =
    ids.length === 0
      ? [[], [], []]
      : await Promise.all([
          db.doctorBreakTime.findMany({
            where: { branchId: branch.id, userId: { in: ids } },
            select: { userId: true, dayOfWeek: true, startMinute: true, endMinute: true },
          }),
          db.doctorTimeOff.findMany({
            where: {
              userId: { in: ids },
              OR: [{ branchId: branch.id }, { branchId: null }],
              startDate: { lt: rangeEnd },
              endDate: { gt: rangeStart },
            },
            select: { userId: true, startDate: true, endDate: true },
          }),
          // Any branch: a doctor working in two branches is busy in both.
          db.appointment.findMany({
            where: {
              doctorId: { in: ids },
              status: { in: [...BUSY_STATUSES] },
              dateTime: { gte: new Date(rangeStart.getTime() - 8 * 3600_000), lt: rangeEnd },
            },
            select: { doctorId: true, dateTime: true, duration: true },
          }),
        ]);

  return {
    doctors: doctors.map((d) => ({
      doctorId: d.id,
      schedule: d.schedule,
      breaks: breaks.filter((b) => b.userId === d.id),
      timeOff: timeOff.filter((t) => t.userId === d.id),
      busy: appointments
        .filter((a) => a.doctorId === d.id)
        .map((a) => ({ start: a.dateTime, end: new Date(a.dateTime.getTime() + a.duration * 60_000) })),
    })),
    rules: {
      branchHours: parseOperatingHours(branch.operatingHours),
      durationMin: defaultDurationFor(treatment),
      stepMin: branch.bookingSlotMinutes,
      leadMin: branch.bookingLeadMinutes,
      now,
    },
    window: bookingWindowKeys(clinicDateKey(now), branch.bookingHorizonDays),
  };
}

/** Clamp [from, to] to the bookable window; null when nothing is left. */
export function clampToWindow(
  from: string,
  to: string,
  window: { first: string; last: string },
): { from: string; to: string } | null {
  const f = from < window.first ? window.first : from;
  const t = to > window.last ? window.last : to;
  return f <= t ? { from: f, to: t } : null;
}

/** The bookable window for a branch at `now`. */
export function windowFor(branch: Pick<BookingBranch, "bookingHorizonDays">, now: Date = new Date()) {
  return bookingWindowKeys(clinicDateKey(now), branch.bookingHorizonDays);
}

/** "YYYY-MM" → first and last day keys of the month. */
export function monthKeys(month: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const from = `${m[1]}-${m[2]}-01`;
  const nextMonth = Number(m[2]) === 12 ? `${Number(m[1]) + 1}-01-01` : `${m[1]}-${String(Number(m[2]) + 1).padStart(2, "0")}-01`;
  return { from, to: addDaysToKey(nextMonth, -1) };
}
