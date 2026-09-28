import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { loadBranchContext } from "@/lib/branch-context";
import { isBranchManager } from "@/lib/branch-scope";
import { effectiveInvoiceStatus, type InvoiceStatus } from "@/lib/invoices";

const PAGE_SIZE = 20;
const FILTERS = ["all", "DRAFT", "SENT", "OVERDUE", "PAID", "CANCELLED"] as const;
type Filter = (typeof FILTERS)[number];

function statusWhere(filter: Filter, now: Date): Prisma.InvoiceWhereInput {
  switch (filter) {
    case "OVERDUE":
      return { status: { in: ["SENT", "OVERDUE"] }, dueDate: { lt: now } };
    case "SENT":
      return { status: { in: ["SENT", "OVERDUE"] }, OR: [{ dueDate: null }, { dueDate: { gte: now } }] };
    case "all":
      return {};
    default:
      return { status: filter };
  }
}

/**
 * Invoices for one branch (the sidebar branch unless ?branchId=), for its
 * OWNER/ADMIN. `branchId=all` (the default in "All branches") covers every
 * branch the caller owns or administers. Filters: ?status= (all | DRAFT | SENT | OVERDUE | PAID |
 * CANCELLED — overdue is derived from the due date), ?search= (invoice number
 * or patient name), ?page=. Summary figures cover the whole branch.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const context = await loadBranchContext(user.id);
  const branchParam = url.searchParams.get("branchId") ?? (context.allBranches ? "all" : context.activeBranchId);
  if (!branchParam) return NextResponse.json({ error: "no_branch" }, { status: 404 });
  let branchIds: string[];
  if (branchParam === "all") {
    branchIds = context.branches.filter((b) => isBranchManager(b.role)).map((b) => b.id);
    if (branchIds.length === 0) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  } else {
    const role = await getUserBranchRole(user.id, branchParam);
    if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (role !== "OWNER" && role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    branchIds = [branchParam];
  }
  const branchId = { in: branchIds };

  const rawFilter = url.searchParams.get("status") ?? "all";
  const filter: Filter = (FILTERS as readonly string[]).includes(rawFilter) ? (rawFilter as Filter) : "all";
  const search = url.searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const where: Prisma.InvoiceWhereInput = {
    branchId,
    ...statusWhere(filter, now),
    ...(search
      ? {
          AND: [
            {
              OR: [
                { invoiceNumber: { contains: search, mode: "insensitive" } },
                { patient: { firstName: { contains: search, mode: "insensitive" } } },
                { patient: { lastName: { contains: search, mode: "insensitive" } } },
              ],
            },
          ],
        }
      : {}),
  };

  const [rows, total, outstanding, overdue, paidThisMonth, drafts] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        currency: true,
        status: true,
        dueDate: true,
        paidAt: true,
        createdAt: true,
        appointmentId: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
        branch: { select: { name: true } },
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where: { branchId, status: { in: ["SENT", "OVERDUE"] } }, _sum: { amount: true } }),
    prisma.invoice.aggregate({
      where: { branchId, status: { in: ["SENT", "OVERDUE"] }, dueDate: { lt: now } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({ where: { branchId, status: "PAID", paidAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.invoice.count({ where: { branchId, status: "DRAFT" } }),
  ]);

  return NextResponse.json({
    invoices: rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      status: effectiveInvoiceStatus(r.status as InvoiceStatus, r.dueDate, now),
      dueDate: r.dueDate?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    summary: {
      outstanding: Number(outstanding._sum.amount ?? 0),
      overdue: Number(overdue._sum.amount ?? 0),
      overdueCount: overdue._count._all,
      paidThisMonth: Number(paidThisMonth._sum.amount ?? 0),
      draftCount: drafts,
    },
  });
}
