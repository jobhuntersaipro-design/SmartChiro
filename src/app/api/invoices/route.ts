import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { can } from "@/lib/permissions";
import { loadBranchContext } from "@/lib/branch-context";
import { billingAccess } from "@/lib/billing-access";
import { clinicCalendar } from "@/lib/clinic-time";
import { createInvoice, effectiveInvoiceStatus, fromSen, toSen, type AnyInvoiceStatus } from "@/lib/invoices";
import { dueDateFromInput, invoiceErrorResponse, loadInvoiceDetail, serializeInvoiceDetail } from "@/lib/invoice-detail";

const PAGE_SIZE = 20;
const FILTERS = ["all", "DRAFT", "SENT", "OVERDUE", "PARTIALLY_PAID", "PAID", "CANCELLED"] as const;
type Filter = (typeof FILTERS)[number];
const OPEN_STATUSES: AnyInvoiceStatus[] = ["SENT", "OVERDUE", "PARTIALLY_PAID"];

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

type MoneySum = { amount: Prisma.Decimal | null; amountPaid: Prisma.Decimal | null };
const balanceOf = (sum: MoneySum) => fromSen(toSen(Number(sum.amount ?? 0)) - toSen(Number(sum.amountPaid ?? 0)));

/**
 * Invoices for one branch (the sidebar branch unless ?branchId=), for its
 * OWNER/ADMIN/FRONT_DESK. `branchId=all` (the default in "All branches") covers
 * every branch where the caller manages invoices. Filters: ?status= (all |
 * DRAFT | SENT | OVERDUE | PARTIALLY_PAID | PAID | CANCELLED — overdue is
 * derived from the due date), ?search= (invoice number or patient name),
 * ?page=. Summary figures cover the scoped branches: outstanding is the
 * unpaid balance of open invoices, and "paid this month" counts payments
 * received this clinic month, net of refunds.
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
    branchIds = context.branches.filter((b) => can(b.role, "invoice.manage")).map((b) => b.id);
    if (branchIds.length === 0) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  } else {
    const role = await getUserBranchRole(user.id, branchParam);
    if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!can(role, "invoice.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    branchIds = [branchParam];
  }
  const branchId = { in: branchIds };

  const rawFilter = url.searchParams.get("status") ?? "all";
  const filter: Filter = (FILTERS as readonly string[]).includes(rawFilter) ? (rawFilter as Filter) : "all";
  const search = url.searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const now = new Date();
  const monthStart = clinicCalendar(now).monthStart;

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
        amountPaid: true,
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
    prisma.invoice.aggregate({ where: { branchId, status: { in: OPEN_STATUSES } }, _sum: { amount: true, amountPaid: true } }),
    prisma.invoice.aggregate({
      where: { branchId, status: { in: ["SENT", "OVERDUE"] }, dueDate: { lt: now } },
      _sum: { amount: true, amountPaid: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({ where: { branchId, receivedAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.invoice.count({ where: { branchId, status: "DRAFT" } }),
  ]);

  return NextResponse.json({
    invoices: rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      amountPaid: Number(r.amountPaid),
      balance: balanceOf(r),
      status: effectiveInvoiceStatus(r.status as AnyInvoiceStatus, r.dueDate, now),
      dueDate: r.dueDate?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    summary: {
      outstanding: balanceOf(outstanding._sum),
      overdue: balanceOf(overdue._sum),
      overdueCount: overdue._count._all,
      paidThisMonth: Number(paidThisMonth._sum.amount ?? 0),
      draftCount: drafts,
    },
  });
}

const Line = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.number().positive().max(10_000),
  unitPrice: z.number().nonnegative().max(1_000_000),
  taxable: z.boolean().optional(),
});

const CreateBody = z.object({
  patientId: z.string().min(1),
  /** Defaults to the patient's branch; must match it when given. */
  branchId: z.string().min(1).optional(),
  lines: z.array(Line).min(1).max(50),
  /** Clinic date "YYYY-MM-DD"; the invoice is due by the end of that day. */
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  appointmentId: z.string().min(1).nullable().optional(),
  status: z.enum(["DRAFT", "SENT"]).optional(),
});

/**
 * Manual invoice (no appointment needed): patient, line items (description,
 * quantity, unit price, taxable), optional due date, notes, status and
 * appointment link. SST comes from the branch settings and the patient's
 * nationality. OWNER/ADMIN of the patient's branch.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 422 });
  }
  const body = parsed.data;

  const patient = await prisma.patient.findUnique({ where: { id: body.patientId }, select: { id: true, branchId: true } });
  if (!patient) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const branchId = body.branchId ?? patient.branchId;

  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // TODO(front-desk): FRONT_DESK may create invoices.
  if (!billingAccess(role).manage) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (patient.branchId !== branchId) return NextResponse.json({ error: "patient_not_in_branch" }, { status: 422 });

  if (body.appointmentId) {
    const appt = await prisma.appointment.findUnique({
      where: { id: body.appointmentId },
      select: { patientId: true, branchId: true },
    });
    if (!appt || appt.patientId !== patient.id || appt.branchId !== branchId) {
      return NextResponse.json({ error: "appointment_mismatch" }, { status: 422 });
    }
  }

  let invoiceId: string;
  try {
    const created = await prisma.$transaction((tx) =>
      createInvoice(tx, {
        branchId,
        patientId: patient.id,
        lines: body.lines,
        dueDate: body.dueDate ? dueDateFromInput(body.dueDate) : null,
        notes: body.notes?.trim() || null,
        appointmentId: body.appointmentId ?? null,
        status: body.status,
      }),
    );
    invoiceId = created.id;
  } catch (err) {
    return invoiceErrorResponse(err);
  }

  const detail = await loadInvoiceDetail(invoiceId);
  return NextResponse.json({ invoice: serializeInvoiceDetail(detail!) }, { status: 201 });
}
