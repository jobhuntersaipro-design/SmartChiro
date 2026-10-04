import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { doctorRecordBranches } from "@/lib/auth/doctor-access";

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const { searchParams } = req.nextUrl;
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "5", 10)));

  // Visits carry SOAP text: only branches where the caller sees every
  // patient's clinical record (never front desk or a peer doctor), and never
  // the doctor's visits at another clinic.
  const branchIds = await doctorRecordBranches(session.user.id, userId, ["patient.readAll", "clinical.read"]);
  if (!branchIds) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (branchIds.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const visits = await prisma.visit.findMany({
    where: { doctorId: userId, patient: { branchId: { in: branchIds } } },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { visitDate: "desc" },
    take: limit,
  });

  return NextResponse.json({
    visits: visits.map((v) => ({
      id: v.id,
      visitDate: v.visitDate.toISOString(),
      subjective: v.subjective,
      assessment: v.assessment,
      patient: v.patient
        ? { id: v.patient.id, firstName: v.patient.firstName, lastName: v.patient.lastName }
        : null,
    })),
  });
}
