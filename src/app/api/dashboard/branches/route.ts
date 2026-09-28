import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cliniciansByBranch } from "@/lib/stats-scope";
import { clinicCalendar } from "@/lib/clinic-time";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Get user's branches
  const memberships = await prisma.branchMember.findMany({
    where: { userId },
    select: { branchId: true, role: true },
  });

  const branchIds = memberships.map((m) => m.branchId);

  const now = new Date();
  const { dayStart: todayStart, dayEnd: todayEnd } = clinicCalendar(now);

  const branches = await prisma.branch.findMany({
    where: { id: { in: branchIds } },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
      _count: {
        select: {
          patients: true,
        },
      },
    },
  });

  // Get today's appointment counts per branch
  const appointmentCounts = await prisma.appointment.groupBy({
    by: ["branchId"],
    where: {
      branchId: { in: branchIds },
      dateTime: { gte: todayStart, lt: todayEnd },
    },
    _count: { id: true },
  });

  const apptCountMap = new Map(
    appointmentCounts.map((a) => [a.branchId, a._count.id])
  );

  const clinicians = await cliniciansByBranch(branches.map((b) => b.id));

  const result = branches.map((branch) => {
    const clinicianIds = new Set(clinicians.get(branch.id) ?? []);
    const doctors = branch.members.filter((m) => clinicianIds.has(m.user.id));
    return {
      id: branch.id,
      name: branch.name,
      address: branch.address,
      doctorCount: doctors.length,
      patientCount: branch._count.patients,
      todayAppointments: apptCountMap.get(branch.id) ?? 0,
      doctors: doctors.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        image: m.user.image,
      })),
    };
  });

  return NextResponse.json({ branches: result });
}
