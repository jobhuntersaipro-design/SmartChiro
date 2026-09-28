import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import type { ActivityItem } from "@/components/dashboard/shared/ActivityFeed";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const branchId = searchParams.get("branchId");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "8"), 20);
  const userId = session.user.id;
  const branchRole = session.user.branchRole;

  // Determine branch scope
  let branchIds: string[];
  if (branchRole === "DOCTOR") {
    branchIds = session.user.activeBranchId ? [session.user.activeBranchId] : [];
  } else if (branchId && branchId !== "all") {
    const member = await prisma.branchMember.findUnique({
      where: { userId_branchId: { userId, branchId } },
      select: { role: true },
    });
    if (!member) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    branchIds = [branchId];
  } else {
    const memberships = await prisma.branchMember.findMany({
      where: { userId },
      select: { branchId: true },
    });
    branchIds = memberships.map((m) => m.branchId);
  }

  if (branchIds.length === 0) {
    return NextResponse.json({ activities: [] });
  }

  // Three independent lookups, run together. Each selects only what the feed
  // shows — the annotation query used to load full canvasState JSON.
  const patientRef = { select: { firstName: true, lastName: true, branch: { select: { name: true } } } } as const;
  // X-ray and annotation events are clinical — front desk only sees new patients.
  const clinical = can(branchRole, "dashboard.clinicalStats");
  const [annotations, patients, xrays] = await Promise.all([
    prisma.annotation.findMany({
      // Only annotations with something drawn — an empty row is not "annotated".
      where: { shapeCount: { gt: 0 }, xray: { patient: { branchId: { in: branchIds } } } },
      select: {
        id: true,
        updatedAt: true,
        createdBy: { select: { name: true } },
        xray: { select: { patient: patientRef } },
      },
      orderBy: { updatedAt: "desc" },
      take: clinical ? limit : 0,
    }),
    prisma.patient.findMany({
      where: { branchId: { in: branchIds } },
      select: { id: true, firstName: true, lastName: true, createdAt: true, branch: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.xray.findMany({
      where: { patient: { branchId: { in: branchIds } }, status: "READY" },
      select: { id: true, createdAt: true, patient: patientRef },
      orderBy: { createdAt: "desc" },
      take: clinical ? limit : 0,
    }),
  ]);

  const activities: ActivityItem[] = [
    ...annotations.map((a) => ({
      id: `annotation-${a.id}`,
      type: "annotation" as const,
      description: `${a.createdBy.name ?? "A doctor"} annotated X-ray for ${a.xray.patient.firstName} ${a.xray.patient.lastName}`,
      timestamp: a.updatedAt.toISOString(),
      branchName: a.xray.patient.branch.name,
    })),
    ...patients.map((p) => ({
      id: `patient-${p.id}`,
      type: "patient" as const,
      description: `New patient ${p.firstName} ${p.lastName} registered`,
      timestamp: p.createdAt.toISOString(),
      branchName: p.branch.name,
    })),
    ...xrays.map((x) => ({
      id: `xray-${x.id}`,
      type: "xray" as const,
      description: `X-ray uploaded for ${x.patient.firstName} ${x.patient.lastName}`,
      timestamp: x.createdAt.toISOString(),
      branchName: x.patient.branch.name,
    })),
  ];

  // Sort by timestamp descending, take limit
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json({ activities: activities.slice(0, limit) });
}
