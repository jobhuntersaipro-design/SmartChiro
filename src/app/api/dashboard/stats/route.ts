import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

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
            annotations: { none: {} },
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
  const branchFilter = branchId && branchId !== "all" ? { branchId } : {};

  // Get user's branch IDs for scoping
  const memberships = await prisma.branchMember.findMany({
    where: { userId },
    select: { branchId: true },
  });
  const userBranchIds = memberships.map((m) => m.branchId);

  const scopedBranchFilter =
    branchId && branchId !== "all"
      ? { branchId }
      : { branchId: { in: userBranchIds } };

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
      prisma.xray.count({
        where: {
          patient: scopedBranchFilter,
          createdAt: { gte: weekStart },
        },
      }),
      prisma.xray.count({
        where: {
          patient: scopedBranchFilter,
          createdAt: { gte: lastWeekStart, lt: weekStart },
        },
      }),
      prisma.branchMember.count({
        where: scopedBranchFilter.branchId
          ? typeof scopedBranchFilter.branchId === "string"
            ? { branchId: scopedBranchFilter.branchId }
            : { branchId: scopedBranchFilter.branchId }
          : { branchId: { in: userBranchIds } },
      }),
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
