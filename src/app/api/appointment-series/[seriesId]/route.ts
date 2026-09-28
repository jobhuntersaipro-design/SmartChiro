import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { serializeSeries } from "@/lib/series-service";

type RouteCtx = { params: Promise<{ seriesId: string }> };

/** A series with every occurrence (all statuses), in order. Any branch member; 404 outside the branch. */
export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { seriesId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Sign in required." }, { status: 401 });

  const series = await prisma.appointmentSeries.findUnique({
    where: { id: seriesId },
    include: {
      doctor: { select: { id: true, name: true } },
      appointments: { orderBy: [{ seriesIndex: "asc" }, { dateTime: "asc" }] },
      patientPackage: { select: { id: true } },
    },
  });
  const role = series ? await getUserBranchRole(user.id, series.branchId) : null;
  if (!series || !role) return NextResponse.json({ error: "not_found", message: "Series not found." }, { status: 404 });

  const { doctor, appointments, patientPackage, ...row } = series;
  const [packageSummary, redeemed] = await Promise.all([
    patientPackage ? packageProgress(patientPackage.id) : null,
    prisma.packageRedemption.findMany({
      where: { appointmentId: { in: appointments.map((a) => a.id) }, reversedAt: null },
      select: { appointmentId: true },
    }),
  ]);
  const redeemedIds = new Set(redeemed.map((r) => r.appointmentId));
  const json = serializeSeries(row, doctor, appointments);
  json.appointments = json.appointments?.map((a) => ({ ...a, redeemed: redeemedIds.has(a.id) }));
  return NextResponse.json({
    series: json,
    counts: countByStatus(appointments.map((a) => a.status)),
    package: packageSummary,
  });
}

function countByStatus(statuses: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of statuses) out[s] = (out[s] ?? 0) + 1;
  return out;
}

async function packageProgress(id: string) {
  const p = await prisma.patientPackage.findUnique({
    where: { id },
    select: { id: true, name: true, sessionsTotal: true, sessionsUsed: true, status: true, expiresAt: true },
  });
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    sessionsTotal: p.sessionsTotal,
    sessionsUsed: p.sessionsUsed,
    sessionsLeft: Math.max(0, p.sessionsTotal - p.sessionsUsed),
    status: p.status,
    expiresAt: p.expiresAt?.toISOString() ?? null,
  };
}
