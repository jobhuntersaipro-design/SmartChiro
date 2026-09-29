import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { billingAccess } from "@/lib/billing-access";
import { cancelInvoiceData, createInvoice, parseLineItems, toSen, type AnyInvoiceStatus } from "@/lib/invoices";
import { invoiceErrorResponse } from "@/lib/invoice-detail";

type RouteCtx = { params: Promise<{ invoiceId: string }> };

const LineItem = z.object({
  description: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  /** Accepted for older clients; totals are always recomputed. */
  total: z.number().nonnegative().optional(),
  taxable: z.boolean().optional(),
});

const Body = z
  .object({
    lineItems: z.array(LineItem).optional(),
  })
  .optional();

/**
 * Void an unpaid invoice and re-issue it as a new DRAFT (same patient, branch,
 * appointment and due date; same line items unless overridden). Totals and
 * SST are recomputed with the branch's current settings. Invoices with money
 * against them can't be re-issued — refund first.
 */
export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const { invoiceId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const original = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      branchId: true,
      patientId: true,
      appointmentId: true,
      status: true,
      amountPaid: true,
      lineItems: true,
      dueDate: true,
      notes: true,
    },
  });
  if (!original) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // RBAC: OWNER/ADMIN at the invoice's branch only.
  const role = await getUserBranchRole(user.id, original.branchId);
  if (!billingAccess(role).manage) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (original.status === "PAID") {
    return NextResponse.json({ error: "invoice_already_paid" }, { status: 422 });
  }
  if (toSen(Number(original.amountPaid)) !== 0) {
    return NextResponse.json({ error: "invoice_has_payments" }, { status: 422 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const lines = parsed.data?.lineItems ?? parseLineItems(original.lineItems);

  let newInvoice;
  try {
    newInvoice = await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: cancelInvoiceData(original.status as AnyInvoiceStatus),
      });
      return createInvoice(tx, {
        branchId: original.branchId,
        patientId: original.patientId,
        appointmentId: original.appointmentId,
        dueDate: original.dueDate,
        notes: original.notes,
        lines: lines.map(({ description, quantity, unitPrice, taxable }) => ({ description, quantity, unitPrice, taxable })),
        status: "DRAFT",
      });
    });
  } catch (err) {
    return invoiceErrorResponse(err);
  }

  return NextResponse.json(
    {
      invoice: {
        id: newInvoice.id,
        invoiceNumber: newInvoice.invoiceNumber,
        amount: Number(newInvoice.amount),
        currency: newInvoice.currency,
        status: newInvoice.status,
        dueDate: newInvoice.dueDate?.toISOString() ?? null,
        lineItems: newInvoice.lineItems,
        patientId: newInvoice.patientId,
        branchId: newInvoice.branchId,
        appointmentId: newInvoice.appointmentId,
        createdAt: newInvoice.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
