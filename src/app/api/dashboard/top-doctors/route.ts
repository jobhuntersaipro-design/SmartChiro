import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const branchId = url.searchParams.get("branchId");
  const daysParam = parseInt(url.searchParams.get("days") ?? `${DEFAULT_DAYS}`, 10);
  const days = Math.min(Number.isFinite(daysParam) && daysParam > 0 ? daysParam : DEFAULT_DAYS, MAX_DAYS);
  const limitParam = parseInt(url.searchParams.get("limit") ?? `${DEFAULT_LIMIT}`, 10);
  const limit = Math.min(Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT, MAX_LIMIT);

  const memberships = await prisma.branchMember.findMany({
    where: { userId: session.user.id },
    select: { branchId: true },
  });
  if (memberships.length === 0) return NextResponse.json({ doctors: [] });

  const allowedBranchIds = memberships.map((m) => m.branchId);
  const targetBranchIds = branchId
    ? allowedBranchIds.includes(branchId)
      ? [branchId]
      : []
    : allowedBranchIds;
  if (targetBranchIds.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const visits = await prisma.visit.findMany({
    where: {
      visitDate: { gte: since },
      patient: { branchId: { in: targetBranchIds } },
    },
    select: {
      doctorId: true,
      invoice: { select: { amount: true, status: true } },
    },
  });

  type Bucket = { visitCount: number; revenue: number };
  const bucketByDoctor = new Map<string, Bucket>();
  for (const v of visits) {
    const b = bucketByDoctor.get(v.doctorId) ?? { visitCount: 0, revenue: 0 };
    b.visitCount += 1;
    if (v.invoice && v.invoice.status === "PAID") b.revenue += Number(v.invoice.amount);
    bucketByDoctor.set(v.doctorId, b);
  }

  const doctorIds = Array.from(bucketByDoctor.keys());
  if (doctorIds.length === 0) return NextResponse.json({ doctors: [] });

  const users = await prisma.user.findMany({
    where: { id: { in: doctorIds } },
    select: { id: true, name: true, image: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const doctors = doctorIds
    .map((id) => {
      const u = userMap.get(id);
      const b = bucketByDoctor.get(id)!;
      return {
        doctorId: id,
        name: u?.name ?? u?.email ?? "Unknown",
        image: u?.image ?? null,
        visitCount: b.visitCount,
        revenue: Math.round(b.revenue * 100) / 100,
      };
    })
    .sort((a, b) => b.visitCount - a.visitCount || b.revenue - a.revenue)
    .slice(0, limit);

  return NextResponse.json({ doctors, days, currency: "MYR" });
}
