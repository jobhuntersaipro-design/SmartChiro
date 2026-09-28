import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { branchIdsForParam } from "@/lib/branch-context";
import { clinicCalendar } from "@/lib/clinic-time";

export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const branchId = url.searchParams.get("branchId");
  if (!branchId) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  // "all" = every branch the caller belongs to (the "All branches" list).
  if (branchId !== "all" && !(await getUserBranchRole(user.id, branchId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const branchIds = await branchIdsForParam(user.id, branchId);
  if (branchIds.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const doctorIdsParam = url.searchParams.get("doctorIds");
  const doctorIds = doctorIdsParam ? doctorIdsParam.split(",").filter(Boolean) : null;

  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (
    (start && Number.isNaN(startDate!.getTime())) ||
    (end && Number.isNaN(endDate!.getTime()))
  ) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const baseWhere = {
    branchId: { in: branchIds },
    ...(doctorIds ? { doctorId: { in: doctorIds } } : {}),
    ...(startDate || endDate
      ? {
          dateTime: {
            ...(startDate ? { gte: startDate } : {}),
            ...(endDate ? { lt: endDate } : {}),
          },
        }
      : {}),
  };

  const now = new Date();
  const { dayStart, dayEnd } = clinicCalendar(now);

  const [
    grouped,
    todayCount,
    upcomingCount,
    staleCount,
  ] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: true,
    }),
    prisma.appointment.count({
      where: {
        ...baseWhere,
        dateTime: { gte: dayStart, lt: dayEnd },
        status: { in: ["SCHEDULED", "CHECKED_IN", "IN_PROGRESS"] },
      },
    }),
    prisma.appointment.count({
      where: {
        ...baseWhere,
        dateTime: { gt: now },
        status: { in: ["SCHEDULED", "CHECKED_IN", "IN_PROGRESS"] },
      },
    }),
    prisma.appointment.count({
      where: {
        ...baseWhere,
        dateTime: { lt: now },
        status: "SCHEDULED",
      },
    }),
  ]);

  const counts = {
    all: 0,
    today: todayCount,
    upcoming: upcomingCount,
    completed: 0,
    cancelled: 0,
    noshow: 0,
    stale: staleCount,
  };

  for (const row of grouped) {
    const c = row._count as number;
    counts.all += c;
    if (row.status === "COMPLETED") counts.completed = c;
    else if (row.status === "CANCELLED") counts.cancelled = c;
    else if (row.status === "NO_SHOW") counts.noshow = c;
  }

  return NextResponse.json({ counts });
}
