import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  // Gather recent activities from multiple tables
  const activities: ActivityItem[] = [];

  // Recent annotations
  const annotations = await prisma.annotation.findMany({
    where: {
      xray: { patient: { branchId: { in: branchIds } } },
    },
    include: {
      createdBy: { select: { name: true } },
      xray: {
        include: {
          patient: { select: { firstName: true, lastName: true, branch: { select: { name: true } } } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  for (const a of annotations) {
    activities.push({
      id: `annotation-${a.id}`,
      type: "annotation",
      description: `${a.createdBy.name ?? "A doctor"} annotated X-ray for ${a.xray.patient.firstName} ${a.xray.patient.lastName}`,
      timestamp: a.updatedAt.toISOString(),
      branchName: a.xray.patient.branch.name,
    });
  }

  // Recent patients
  const patients = await prisma.patient.findMany({
    where: { branchId: { in: branchIds } },
    include: {
      branch: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  for (const p of patients) {
    activities.push({
      id: `patient-${p.id}`,
      type: "patient",
      description: `New patient ${p.firstName} ${p.lastName} registered`,
      timestamp: p.createdAt.toISOString(),
      branchName: p.branch.name,
    });
  }

  // Recent X-ray uploads
  const xrays = await prisma.xray.findMany({
    where: {
      patient: { branchId: { in: branchIds } },
      status: "READY",
    },
    include: {
      patient: { select: { firstName: true, lastName: true, branch: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  for (const x of xrays) {
    activities.push({
      id: `xray-${x.id}`,
      type: "xray",
      description: `X-ray uploaded for ${x.patient.firstName} ${x.patient.lastName}`,
      timestamp: x.createdAt.toISOString(),
      branchName: x.patient.branch.name,
    });
  }

  // Sort by timestamp descending, take limit
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json({ activities: activities.slice(0, limit) });
}
