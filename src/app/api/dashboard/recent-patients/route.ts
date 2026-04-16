import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const activeBranchId = session.user.activeBranchId;

  if (!activeBranchId) {
    return NextResponse.json({ patients: [] });
  }

  const patients = await prisma.patient.findMany({
    where: {
      doctorId: userId,
      branchId: activeBranchId,
    },
    include: {
      _count: { select: { xrays: true } },
      visits: {
        orderBy: { visitDate: "desc" },
        take: 1,
        select: { visitDate: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  return NextResponse.json({
    patients: patients.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      lastVisitDate: p.visits[0]?.visitDate.toISOString() ?? null,
      xrayCount: p._count.xrays,
    })),
  });
}
