import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { displayDoctorName } from "@/lib/format";
import { normalizeWorkingSchedule, parseOperatingHours } from "@/lib/operating-hours";
import { clinicianMemberWhere } from "@/lib/stats-scope";
import { availableMinutes, utilisationRate } from "@/lib/reports/utilisation";
import { resolveReportRequest, userNames } from "@/lib/reports/server";
import type { UtilisationReport, UtilisationRow } from "@/types/reports";

/**
 * Booked ÷ available minutes per doctor over the range. Booked = appointment
 * durations in the range except cancelled ones (a no-show still held the
 * slot). Available = the doctor's weekly working schedule, or their branches'
 * opening hours when they have none, minus recurring breaks and time off.
 * A doctor with a personal schedule counts it once even across branches.
 */
export async function GET(req: Request) {
  const ctx = await resolveReportRequest(req);
  if (ctx instanceof NextResponse) return ctx;
  const { range, branchIds } = ctx;

  const [clinicians, booked] = await Promise.all([
    prisma.branchMember.findMany({ where: clinicianMemberWhere(branchIds), select: { userId: true } }),
    prisma.appointment.groupBy({
      by: ["doctorId"],
      where: {
        branchId: { in: branchIds },
        dateTime: { gte: range.start, lt: range.end },
        status: { not: "CANCELLED" },
      },
      _sum: { duration: true },
    }),
  ]);
  const doctorIds = [...new Set([...clinicians.map((c) => c.userId), ...booked.map((b) => b.doctorId)])];

  const [members, branches, breaks, timeOff] = await Promise.all([
    prisma.branchMember.findMany({
      where: { branchId: { in: branchIds }, userId: { in: doctorIds } },
      select: { userId: true, branchId: true, user: { select: { name: true, doctorProfile: { select: { workingSchedule: true } } } } },
    }),
    prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, operatingHours: true } }),
    prisma.doctorBreakTime.findMany({
      where: { branchId: { in: branchIds }, userId: { in: doctorIds } },
      select: { userId: true, dayOfWeek: true, startMinute: true, endMinute: true },
    }),
    prisma.doctorTimeOff.findMany({
      where: {
        userId: { in: doctorIds },
        startDate: { lt: range.end },
        endDate: { gt: range.start },
        OR: [{ branchId: null }, { branchId: { in: branchIds } }],
      },
      select: { userId: true, startDate: true, endDate: true },
    }),
  ]);

  // Doctors who were booked here but are no longer members still need a name.
  const formerNames = await userNames(doctorIds.filter((id) => !members.some((m) => m.userId === id)));
  const hoursByBranch = new Map(branches.map((b) => [b.id, parseOperatingHours(b.operatingHours)]));
  const bookedBy = new Map(booked.map((b) => [b.doctorId, b._sum.duration ?? 0]));

  const rows: UtilisationRow[] = doctorIds.map((doctorId) => {
    const mine = members.filter((m) => m.userId === doctorId);
    const user = mine[0]?.user;
    const availability = availableMinutes({
      range,
      schedule: normalizeWorkingSchedule(user?.doctorProfile?.workingSchedule),
      branchHours: mine.map((m) => hoursByBranch.get(m.branchId) ?? {}),
      breaks: breaks.filter((b) => b.userId === doctorId),
      timeOff: timeOff.filter((t) => t.userId === doctorId),
    });
    const bookedMinutes = bookedBy.get(doctorId) ?? 0;
    return {
      doctorId,
      name: displayDoctorName(user?.name ?? formerNames.get(doctorId)),
      bookedMinutes,
      availableMinutes: availability.availableMinutes,
      rate: utilisationRate(bookedMinutes, availability.availableMinutes),
      hoursSource: availability.source,
    };
  });
  rows.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || a.name.localeCompare(b.name));

  const totalBooked = rows.reduce((s, r) => s + r.bookedMinutes, 0);
  const totalAvailable = rows.reduce((s, r) => s + r.availableMinutes, 0);
  const body: UtilisationReport = {
    range: ctx.rangeJson,
    scope: ctx.scope,
    totals: { bookedMinutes: totalBooked, availableMinutes: totalAvailable, rate: utilisationRate(totalBooked, totalAvailable) },
    byDoctor: rows,
  };
  return NextResponse.json(body);
}
