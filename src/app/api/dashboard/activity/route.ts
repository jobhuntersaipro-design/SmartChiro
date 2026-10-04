import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { dashboardScope } from "@/lib/branch-context";
import { scopedWhere } from "@/lib/branch-scope";
import { intParam } from "@/lib/clinic-time";
import type { ActivityItem } from "@/components/dashboard/shared/ActivityFeed";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const branchId = searchParams.get("branchId");
  const limit = intParam(searchParams.get("limit"), 8, 1, 20);
  const scope = await dashboardScope(session.user.id, branchId);
  if (!scope) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  if (scope.branchIds.length === 0) {
    return NextResponse.json({ activities: [] });
  }
  // Doctors see their own patients; X-ray events are clinical, so only from
  // branches where the role sees clinical stats (never front desk).
  const patientWhere = scopedWhere(scope, session.user.id);
  const clinicalScope = {
    ...scope,
    branchIds: scope.branchIds.filter((id) => can(scope.roles[id], "dashboard.clinicalStats")),
  };
  const clinicalPatientWhere = scopedWhere(clinicalScope, session.user.id);
  const clinical = clinicalScope.branchIds.length > 0;

  // Three independent lookups, run together. Each selects only what the feed
  // shows — the annotation query used to load full canvasState JSON.
  const patientRef = { select: { firstName: true, lastName: true, branch: { select: { name: true } } } } as const;
  const [annotations, patients, xrays] = await Promise.all([
    prisma.annotation.findMany({
      // Only annotations with something drawn — an empty row is not "annotated".
      where: { shapeCount: { gt: 0 }, xray: { patient: clinicalPatientWhere } },
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
      where: patientWhere,
      select: { id: true, firstName: true, lastName: true, createdAt: true, branch: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.xray.findMany({
      where: { patient: clinicalPatientWhere, status: "READY" },
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
