import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const branchId = url.searchParams.get("branchId");
  const daysParam = parseInt(url.searchParams.get("days") ?? `${DEFAULT_DAYS}`, 10);
  const days = Math.min(Number.isFinite(daysParam) && daysParam > 0 ? daysParam : DEFAULT_DAYS, MAX_DAYS);

  const memberships = await prisma.branchMember.findMany({
    where: { userId: session.user.id },
    select: { branchId: true, role: true },
  });
  if (memberships.length === 0) return NextResponse.json({ series: [], total: 0, currency: "MYR" });

  const allowedBranchIds = memberships.map((m) => m.branchId);
  const targetBranchIds = branchId
    ? allowedBranchIds.includes(branchId)
      ? [branchId]
      : []
    : allowedBranchIds;
  if (targetBranchIds.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const invoices = await prisma.invoice.findMany({
    where: {
      branchId: { in: targetBranchIds },
      status: "PAID",
      paidAt: { gte: start },
    },
    select: { amount: true, paidAt: true },
  });

  // Bucket by YYYY-MM-DD
  const byDay = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }

  let total = 0;
  for (const inv of invoices) {
    if (!inv.paidAt) continue;
    const key = inv.paidAt.toISOString().slice(0, 10);
    if (!byDay.has(key)) continue;
    const amt = Number(inv.amount);
    byDay.set(key, (byDay.get(key) ?? 0) + amt);
    total += amt;
  }

  const series = Array.from(byDay, ([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }));

  return NextResponse.json({ series, total: Math.round(total * 100) / 100, currency: "MYR", days });
}
