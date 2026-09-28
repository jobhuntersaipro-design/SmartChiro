import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fromSen, toSen } from "@/lib/invoices";
import { resolveReportRequest } from "@/lib/reports/server";
import type { ReceivablesReport } from "@/types/reports";

/** Invoices that still expect money: issued, not paid in full, not cancelled. */
const OPEN_STATUSES = ["SENT", "OVERDUE", "PARTIALLY_PAID"] as const;
const OLDEST_LIMIT = 20;
const DAY_MS = 86_400_000;

type Sums = { amount: Prisma.Decimal | null; amountPaid: Prisma.Decimal | null };
const balanceOf = (s: Sums) => fromSen(toSen(Number(s.amount ?? 0)) - toSen(Number(s.amountPaid ?? 0)));

/**
 * What patients still owe, as of now (the range doesn't apply): open balance
 * of every issued, unpaid invoice; the overdue part (due date passed,
 * part-paid ones included); and the oldest overdue invoices.
 */
export async function GET(req: Request) {
  const ctx = await resolveReportRequest(req);
  if (ctx instanceof NextResponse) return ctx;
  const { now } = ctx;

  const open: Prisma.InvoiceWhereInput = { branchId: { in: ctx.branchIds }, status: { in: [...OPEN_STATUSES] } };
  const overdue: Prisma.InvoiceWhereInput = { ...open, dueDate: { lt: now } };

  const [openSum, overdueSum, oldest] = await Promise.all([
    prisma.invoice.aggregate({ where: open, _sum: { amount: true, amountPaid: true }, _count: { _all: true } }),
    prisma.invoice.aggregate({ where: overdue, _sum: { amount: true, amountPaid: true }, _count: { _all: true } }),
    prisma.invoice.findMany({
      where: overdue,
      orderBy: [{ dueDate: "asc" }, { issuedAt: "asc" }],
      take: OLDEST_LIMIT,
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        amountPaid: true,
        issuedAt: true,
        dueDate: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
        branch: { select: { name: true } },
      },
    }),
  ]);

  const body: ReceivablesReport = {
    range: ctx.rangeJson,
    scope: ctx.scope,
    asOf: now.toISOString(),
    open: { balance: balanceOf(openSum._sum), count: openSum._count._all },
    overdue: { balance: balanceOf(overdueSum._sum), count: overdueSum._count._all },
    oldestOverdue: oldest.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      patientId: i.patient.id,
      patientName: `${i.patient.firstName} ${i.patient.lastName}`,
      branchName: i.branch.name,
      issuedAt: i.issuedAt.toISOString(),
      dueDate: i.dueDate!.toISOString(),
      daysOverdue: Math.max(0, Math.floor((now.getTime() - i.dueDate!.getTime()) / DAY_MS)),
      total: Number(i.amount),
      balance: balanceOf(i),
    })),
  };
  return NextResponse.json(body);
}
