import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countClinicians } from "@/lib/stats-scope";
import { clinicCalendar } from "@/lib/clinic-time";
import { can } from "@/lib/permissions";
import { OFF_THE_DAY_STATUSES } from "@/lib/appointment-tabs";
import { dashboardScope } from "@/lib/branch-context";
import { scopedWhere, scopeRole } from "@/lib/branch-scope";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const branchId = searchParams.get("branchId");
  const userId = session.user.id;
  const scope = await dashboardScope(userId, branchId);
  if (!scope) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  const now = new Date();
  const cal = clinicCalendar(now);
  const todayStart = cal.dayStart;
  const todayEnd = cal.dayEnd;
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const monthStart = cal.monthStart;
  const lastMonthStart = cal.lastMonthStart;
  const lastMonthEnd = new Date(cal.monthStart.getTime() - 1);

  // The doctor view (the dashboard page picks it with the same rule): one
  // branch where the user is a DOCTOR, or "all" when they manage none.
  const doctorView =
    branchId && branchId !== "all" ? scope.roles[branchId] === "DOCTOR" : scopeRole(scope) === "DOCTOR";
  if (doctorView) {
    const doctorBranchIds = scope.branchIds.filter((id) => scope.roles[id] === "DOCTOR");
    const [myPatients, todayAppts, xraysThisMonth, xraysLastMonth, pendingAnnotations] =
      await Promise.all([
        prisma.patient.count({
          where: { doctorId: userId, branchId: { in: doctorBranchIds } },
        }),
        prisma.appointment.findMany({
          where: {
            doctorId: userId,
            branchId: { in: doctorBranchIds },
            dateTime: { gte: todayStart, lt: todayEnd },
            status: { notIn: [...OFF_THE_DAY_STATUSES] },
          },
          select: { status: true },
        }),
        prisma.xray.count({
          where: {
            uploadedById: userId,
            createdAt: { gte: monthStart },
          },
        }),
        prisma.xray.count({
          where: {
            uploadedById: userId,
            createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
          },
        }),
        prisma.xray.count({
          where: {
            uploadedById: userId,
            annotations: { none: { shapeCount: { gt: 0 } } },
            status: "READY",
          },
        }),
      ]);

    const remaining = todayAppts.filter(
      (a) => a.status === "SCHEDULED" || a.status === "CHECKED_IN" || a.status === "IN_PROGRESS"
    ).length;

    return NextResponse.json({
      myPatients,
      todayAppointments: todayAppts.length,
      remainingAppointments: remaining,
      xraysThisMonth,
      xraysLastMonth,
      pendingAnnotations,
    });
  }

  // Owner/Admin/front desk: by the role in each branch (a DOCTOR branch in
  // "all" counts only their own patients). X-ray counts are clinical stats,
  // so only from branches whose role sees them — front desk gets zeros.
  const scopedBranchFilter = scopedWhere(scope, userId);
  const clinicalBranchFilter = scopedWhere(
    { ...scope, branchIds: scope.branchIds.filter((id) => can(scope.roles[id], "dashboard.clinicalStats")) },
    userId,
  );
  const clinical = scope.branchIds.some((id) => can(scope.roles[id], "dashboard.clinicalStats"));
  const [totalPatients, todayAppts, xraysThisWeek, xraysLastWeek, activeDoctors] =
    await Promise.all([
      prisma.patient.count({ where: scopedBranchFilter }),
      prisma.appointment.findMany({
        where: {
          ...scopedBranchFilter,
          dateTime: { gte: todayStart, lt: todayEnd },
          status: { notIn: [...OFF_THE_DAY_STATUSES] },
        },
        select: { status: true },
      }),
      clinical
        ? prisma.xray.count({
            where: {
              patient: clinicalBranchFilter,
              createdAt: { gte: weekStart },
            },
          })
        : 0,
      clinical
        ? prisma.xray.count({
            where: {
              patient: clinicalBranchFilter,
              createdAt: { gte: lastWeekStart, lt: weekStart },
            },
          })
        : 0,
      countClinicians(scope.branchIds),
    ]);

  const completed = todayAppts.filter((a) => a.status === "COMPLETED").length;
  const remaining = todayAppts.filter(
    (a) => a.status === "SCHEDULED" || a.status === "CHECKED_IN" || a.status === "IN_PROGRESS"
  ).length;

  return NextResponse.json({
    totalPatients,
    todayAppointments: todayAppts.length,
    completedAppointments: completed,
    remainingAppointments: remaining,
    xraysThisWeek,
    xraysLastWeek,
    activeDoctors,
    totalBranches: scope.branchIds.length,
  });
}
