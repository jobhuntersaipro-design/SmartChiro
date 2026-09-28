import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { packageLiability } from "@/lib/reports/packages";
import { resolveReportRequest } from "@/lib/reports/server";
import type { PackagesReport } from "@/types/reports";

/**
 * Prepaid packages: what is still owed in sessions right now (active count,
 * sessions outstanding, liability = sessions left × unit value, packages
 * expiring within 30 days, per package name) and packages sold in the range
 * (cancelled sales excluded).
 */
export async function GET(req: Request) {
  const ctx = await resolveReportRequest(req);
  if (ctx instanceof NextResponse) return ctx;
  const branchId = { in: ctx.branchIds };

  const [stillActive, sold] = await Promise.all([
    // Stored ACTIVE only; used-up / expired-but-not-swept ones are dropped by effectiveStatus.
    prisma.patientPackage.findMany({
      where: { branchId, status: "ACTIVE" },
      select: { name: true, status: true, sessionsTotal: true, sessionsUsed: true, price: true, expiresAt: true },
    }),
    prisma.patientPackage.aggregate({
      where: { branchId, status: { not: "CANCELLED" }, purchasedAt: { gte: ctx.range.start, lt: ctx.range.end } },
      _count: { _all: true },
      _sum: { price: true },
    }),
  ]);

  const summary = packageLiability(stillActive, ctx.now);
  const body: PackagesReport = {
    range: ctx.rangeJson,
    scope: ctx.scope,
    asOf: ctx.now.toISOString(),
    active: summary.active,
    sessionsOutstanding: summary.sessionsOutstanding,
    liability: summary.liability,
    expiringSoon: summary.expiringSoon,
    sold: { count: sold._count._all, value: Number(sold._sum.price ?? 0) },
    byPackage: summary.byPackage,
  };
  return NextResponse.json(body);
}
