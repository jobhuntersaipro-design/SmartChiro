import type { BranchRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BranchSummary, DoctorStats, OwnerStats } from "@/types/dashboard";
import type { ScheduleAppointment } from "@/components/dashboard/shared/ScheduleTable";

function todayBounds() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  return { now, todayStart, todayEnd };
}

export async function loadBranches(userId: string): Promise<BranchSummary[]> {
  const memberships = await prisma.branchMember.findMany({
    where: { userId },
    select: { branchId: true },
  });
  const branchIds = memberships.map((m) => m.branchId);
  if (branchIds.length === 0) return [];

  const { todayStart, todayEnd } = todayBounds();
  const [branches, appointmentCounts] = await Promise.all([
    prisma.branch.findMany({
      where: { id: { in: branchIds } },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, image: true } } },
        },
        _count: { select: { patients: true } },
      },
    }),
    prisma.appointment.groupBy({
      by: ["branchId"],
      where: {
        branchId: { in: branchIds },
        dateTime: { gte: todayStart, lt: todayEnd },
      },
      _count: { id: true },
    }),
  ]);

  const apptCountMap = new Map(appointmentCounts.map((a) => [a.branchId, a._count.id]));
  return branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    address: branch.address,
    doctorCount: branch.members.length,
    patientCount: branch._count.patients,
    todayAppointments: apptCountMap.get(branch.id) ?? 0,
    doctors: branch.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      image: m.user.image,
    })),
  }));
}

export async function loadOwnerStats(
  userId: string,
  branchId: string | null,
): Promise<OwnerStats> {
  const { todayStart, todayEnd } = todayBounds();
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);

  const memberships = await prisma.branchMember.findMany({
    where: { userId },
    select: { branchId: true },
  });
  const userBranchIds = memberships.map((m) => m.branchId);
  const scopedBranchFilter =
    branchId && branchId !== "all" ? { branchId } : { branchId: { in: userBranchIds } };

  const [totalPatients, todayAppts, xraysThisWeek, xraysLastWeek, activeDoctors] =
    await Promise.all([
      prisma.patient.count({ where: scopedBranchFilter }),
      prisma.appointment.findMany({
        where: { ...scopedBranchFilter, dateTime: { gte: todayStart, lt: todayEnd } },
        select: { status: true },
      }),
      prisma.xray.count({
        where: { patient: scopedBranchFilter, createdAt: { gte: weekStart } },
      }),
      prisma.xray.count({
        where: {
          patient: scopedBranchFilter,
          createdAt: { gte: lastWeekStart, lt: weekStart },
        },
      }),
      prisma.branchMember.count({ where: scopedBranchFilter }),
    ]);

  const completed = todayAppts.filter((a) => a.status === "COMPLETED").length;
  const remaining = todayAppts.filter(
    (a) => a.status === "SCHEDULED" || a.status === "CHECKED_IN" || a.status === "IN_PROGRESS",
  ).length;

  return {
    totalPatients,
    todayAppointments: todayAppts.length,
    completedAppointments: completed,
    remainingAppointments: remaining,
    xraysThisWeek,
    xraysLastWeek,
    activeDoctors,
    totalBranches: branchId && branchId !== "all" ? 1 : userBranchIds.length,
  };
}

export async function loadDoctorStats(
  userId: string,
  activeBranchId: string | null,
): Promise<DoctorStats> {
  if (!activeBranchId) {
    return {
      myPatients: 0,
      todayAppointments: 0,
      remainingAppointments: 0,
      xraysThisMonth: 0,
      xraysLastMonth: 0,
      pendingAnnotations: 0,
    };
  }

  const { now, todayStart, todayEnd } = todayBounds();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const [myPatients, todayAppts, xraysThisMonth, xraysLastMonth, pendingAnnotations] =
    await Promise.all([
      prisma.patient.count({ where: { doctorId: userId, branchId: activeBranchId } }),
      prisma.appointment.findMany({
        where: {
          doctorId: userId,
          branchId: activeBranchId,
          dateTime: { gte: todayStart, lt: todayEnd },
        },
        select: { status: true },
      }),
      prisma.xray.count({ where: { uploadedById: userId, createdAt: { gte: monthStart } } }),
      prisma.xray.count({
        where: { uploadedById: userId, createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      }),
      prisma.xray.count({
        where: { uploadedById: userId, annotations: { none: {} }, status: "READY" },
      }),
    ]);

  const remaining = todayAppts.filter(
    (a) => a.status === "SCHEDULED" || a.status === "CHECKED_IN" || a.status === "IN_PROGRESS",
  ).length;

  return {
    myPatients,
    todayAppointments: todayAppts.length,
    remainingAppointments: remaining,
    xraysThisMonth,
    xraysLastMonth,
    pendingAnnotations,
  };
}

export async function loadTodaySchedule(input: {
  userId: string;
  branchRole: BranchRole | null;
  branchId: string | null;
  activeBranchId: string | null;
}): Promise<ScheduleAppointment[]> {
  const { todayStart, todayEnd } = todayBounds();
  const where: {
    dateTime: { gte: Date; lt: Date };
    doctorId?: string;
    branchId?: string | { in: string[] };
  } = { dateTime: { gte: todayStart, lt: todayEnd } };

  if (input.branchRole === "DOCTOR") {
    where.doctorId = input.userId;
    if (input.activeBranchId) where.branchId = input.activeBranchId;
  } else if (input.branchId && input.branchId !== "all") {
    where.branchId = input.branchId;
  } else {
    const memberships = await prisma.branchMember.findMany({
      where: { userId: input.userId },
      select: { branchId: true },
    });
    where.branchId = { in: memberships.map((m) => m.branchId) };
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      doctor: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
    orderBy: { dateTime: "asc" },
    take: 10,
  });

  return appointments.map((appt) => ({
    id: appt.id,
    dateTime: appt.dateTime.toISOString(),
    duration: appt.duration,
    status: appt.status,
    notes: appt.notes,
    patient: appt.patient,
    doctor: { id: appt.doctor.id, name: appt.doctor.name ?? "" },
    branch: appt.branch,
  }));
}

export async function loadDashboardHome(input: {
  userId: string;
  branchRole: BranchRole | null;
  activeBranchId: string | null;
}) {
  const isDoctor = input.branchRole === "DOCTOR";
  const [branches, ownerStats, doctorStats, appointments] = await Promise.all([
    loadBranches(input.userId),
    isDoctor ? Promise.resolve(null) : loadOwnerStats(input.userId, "all"),
    isDoctor ? loadDoctorStats(input.userId, input.activeBranchId) : Promise.resolve(null),
    loadTodaySchedule({ ...input, branchId: "all" }),
  ]);

  return { branches, ownerStats, doctorStats, appointments };
}
