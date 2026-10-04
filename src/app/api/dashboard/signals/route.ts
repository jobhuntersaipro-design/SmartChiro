import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clinicCalendar, clinicDateKey } from "@/lib/clinic-time";
import { ACTIVE_PATIENT_STATUS } from "@/lib/stats-scope";
import type { OwnerSignals } from "@/types/dashboard";

/** A patient is due for recall once this many days pass without a visit. */
const RECALL_AFTER_DAYS = 30;

const OPEN_STATUSES = ["SCHEDULED", "CHECKED_IN", "IN_PROGRESS"] as const;

/**
 * Owner signals for the dashboard: money in today, no-shows today, stale
 * bookings and patients due for recall. Scoped like /api/dashboard/stats
 * (`?branchId=all` or one branch the caller belongs to), but only across
 * branches where the caller is OWNER or ADMIN — revenue isn't a doctor view.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const branchId = new URL(req.url).searchParams.get("branchId");
  const memberships = await prisma.branchMember.findMany({
    where: { userId: session.user.id, role: { in: ["OWNER", "ADMIN"] } },
    select: { branchId: true },
  });
  const managedIds = memberships.map((m) => m.branchId);
  if (managedIds.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (branchId && branchId !== "all" && !managedIds.includes(branchId)) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }
  const branchIds = branchId && branchId !== "all" ? [branchId] : managedIds;

  const now = new Date();
  const cal = clinicCalendar(now);
  const recallCutoff = cal.addDays(-RECALL_AFTER_DAYS);
  const scope = { branchId: { in: branchIds } };

  const recallWhere: Prisma.PatientWhereInput = {
    ...scope,
    status: ACTIVE_PATIENT_STATUS,
    visits: { some: {}, none: { visitDate: { gte: recallCutoff } } },
    appointments: { none: { dateTime: { gte: now }, status: { in: [...OPEN_STATUSES] } } },
  };

  const [paid, noShowsToday, staleAppointments, oldestStale, recallDue, recallVisits] = await Promise.all([
    // Money actually received today (deposits and part payments included,
    // refunds netted off), not invoices that happened to reach PAID today.
    prisma.payment.aggregate({
      where: { ...scope, receivedAt: { gte: cal.dayStart, lt: cal.dayEnd } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.appointment.count({
      where: { ...scope, status: "NO_SHOW", dateTime: { gte: cal.dayStart, lt: cal.dayEnd } },
    }),
    prisma.appointment.count({
      where: { ...scope, status: "SCHEDULED", dateTime: { lt: now } },
    }),
    // The list opens on the oldest one (it shows a week before to a month after a date).
    prisma.appointment.findFirst({
      where: { ...scope, status: "SCHEDULED", dateTime: { lt: now } },
      orderBy: { dateTime: "asc" },
      select: { dateTime: true },
    }),
    prisma.patient.count({ where: recallWhere }),
    // Most recently lapsed first — the likeliest to come back when called.
    prisma.visit.findMany({
      where: { patient: recallWhere },
      orderBy: { visitDate: "desc" },
      distinct: ["patientId"],
      take: 3,
      select: {
        visitDate: true,
        patient: { select: { id: true, firstName: true, lastName: true, marketingConsent: true } },
      },
    }),
  ]);

  const body: OwnerSignals = {
    revenueToday: Number(paid._sum.amount ?? 0),
    paymentsToday: paid._count._all,
    noShowsToday,
    staleAppointments,
    oldestStaleDate: oldestStale ? clinicDateKey(oldestStale.dateTime) : null,
    recallDue,
    recallSample: recallVisits.map((v) => ({
      id: v.patient.id,
      name: `${v.patient.firstName} ${v.patient.lastName}`,
      lastVisit: v.visitDate.toISOString(),
      marketingConsent: v.patient.marketingConsent,
    })),
  };
  return NextResponse.json(body);
}
