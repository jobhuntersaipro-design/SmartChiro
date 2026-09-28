import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countClinicians } from "@/lib/stats-scope";
import { clinicCalendar } from "@/lib/clinic-time";
import { can } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const branchId = searchParams.get("branchId");
  const userId = session.user.id;
  const branchRole = session.user.branchRole;

  const now = new Date();
  const cal = clinicCalendar(now);
  const todayStart = cal.dayStart;
  const todayEnd = cal.dayEnd;
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const monthStart = cal.monthStart;
  const lastMonthStart = cal.lastMonthStart;
  const lastMonthEnd = new Date(cal.monthStart.getTime() - 1);

  if (branchRole === "DOCTOR") {
    const activeBranchId = session.user.activeBranchId;
    if (!activeBranchId) {
      return NextResponse.json({
        myPatients: 0,
        todayAppointments: 0,
        remainingAppointments: 0,
        xraysThisMonth: 0,
        xraysLastMonth: 0,
        pendingAnnotations: 0,
      });
    }

    const [myPatients, todayAppts, xraysThisMonth, xraysLastMonth, pendingAnnotations] =
      await Promise.all([
        prisma.patient.count({
          where: { doctorId: userId, branchId: activeBranchId },
        }),
        prisma.appointment.findMany({
          where: {
            doctorId: userId,
            branchId: activeBranchId,
            dateTime: { gte: todayStart, lt: todayEnd },
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

  // Owner/Admin — optionally filtered by branchId
  // Get user's branch IDs for scoping
  const memberships = await prisma.branchMember.findMany({
    where: { userId },
    select: { branchId: true },
  });
  const userBranchIds = memberships.map((m) => m.branchId);
  if (branchId && branchId !== "all" && !userBranchIds.includes(branchId)) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const scopedBranchFilter =
    branchId && branchId !== "all"
      ? { branchId }
      : { branchId: { in: userBranchIds } };

  // X-ray counts are clinical stats — front desk gets zeros.
  const clinical = can(branchRole, "dashboard.clinicalStats");
  const [totalPatients, todayAppts, xraysThisWeek, xraysLastWeek, activeDoctors] =
    await Promise.all([
      prisma.patient.count({ where: scopedBranchFilter }),
      prisma.appointment.findMany({
        where: {
          ...scopedBranchFilter,
          dateTime: { gte: todayStart, lt: todayEnd },
        },
        select: { status: true },
      }),
      clinical
        ? prisma.xray.count({
            where: {
              patient: scopedBranchFilter,
              createdAt: { gte: weekStart },
            },
          })
        : 0,
      clinical
        ? prisma.xray.count({
            where: {
              patient: scopedBranchFilter,
              createdAt: { gte: lastWeekStart, lt: weekStart },
            },
          })
        : 0,
      countClinicians(branchId && branchId !== "all" ? [branchId] : userBranchIds),
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
    totalBranches: branchId && branchId !== "all" ? 1 : userBranchIds.length,
  });
}
