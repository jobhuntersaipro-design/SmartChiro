import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { billingAccess } from "@/lib/billing-access";
import {
  PAYMENT_METHODS,
  canTransitionInvoice,
  effectiveInvoiceStatus,
  fromSen,
  cancelInvoiceLocked,
  issueDraftData,
  InvoiceError,
  recordPayment,
  toSen,
  type AnyInvoiceStatus,
} from "@/lib/invoices";
import { invoiceErrorResponse, loadInvoiceDetail, serializeInvoiceDetail, serializePayment } from "@/lib/invoice-detail";
import { paywall } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ invoiceId: string }> };

/** Invoice detail: line items, tax snapshot, payments, balance and the branch's tax details. */
export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { invoiceId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const invoice = await loadInvoiceDetail(invoiceId);
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const role = await getUserBranchRole(user.id, invoice.branchId);
  if (!billingAccess(role).read) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ invoice: serializeInvoiceDetail(invoice) });
}

const Body = z.object({
  status: z.enum(["SENT", "PAID", "CANCELLED"]),
  /** Used when marking paid: the balance is recorded as one payment. */
  method: z.enum(PAYMENT_METHODS).optional(),
  reference: z.string().trim().max(100).nullable().optional(),
});

/**
 * Mark an invoice sent, paid or cancelled. "Paid" records a payment for the
 * outstanding balance (method from the body, default cash) so the payment
 * history and receipts stay complete. OWNER/ADMIN of its branch.
 */
export async function PATCH(req: Request, ctx: RouteCtx): Promise<Response> {
  const { invoiceId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const blocked = await paywall(user.id);
  if (blocked) return blocked;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { branchId: true, status: true, dueDate: true, amount: true, amountPaid: true },
  });
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getUserBranchRole(user.id, invoice.branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!billingAccess(role).manage) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 422 });
  const { status: next, method, reference } = parsed.data;

  const current = effectiveInvoiceStatus(invoice.status as AnyInvoiceStatus, invoice.dueDate);
  if (!canTransitionInvoice(current, next)) {
    return NextResponse.json({ error: "invalid_transition", from: current, to: next }, { status: 422 });
  }
  const balanceSen = toSen(Number(invoice.amount)) - toSen(Number(invoice.amountPaid));
  if (next === "CANCELLED" && toSen(Number(invoice.amountPaid)) !== 0) {
    return NextResponse.json({ error: "invoice_has_payments" }, { status: 422 });
  }

  let paymentId: string | null = null;
  try {
    if (next === "PAID" && balanceSen > 0) {
      const result = await prisma.$transaction((tx) =>
        recordPayment(tx, {
          invoiceId,
          amount: fromSen(balanceSen),
          method: method ?? "CASH",
          reference: reference ?? null,
          receivedById: user.id,
        }),
      );
      paymentId = result.payment.id;
    } else if (next === "CANCELLED") {
      await prisma.$transaction((tx) => cancelInvoiceLocked(tx, invoiceId));
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "Invoice" WHERE "id" = ${invoiceId} FOR UPDATE`;
        const row = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { status: true, branchId: true, issuedAt: true } });
        if (row.status === "CANCELLED") throw new InvoiceError("invoice_cancelled");
        // Sending a draft issues it (issue date, and a new number across a year end).
        const issued = row.status === "DRAFT" ? await issueDraftData(tx, row) : {};
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: next, ...(next === "PAID" ? { paidAt: new Date() } : {}), ...issued },
        });
      });
    }
  } catch (err) {
    return invoiceErrorResponse(err);
  }

  const updated = await loadInvoiceDetail(invoiceId);
  const detail = serializeInvoiceDetail(updated!);
  const recorded = paymentId ? updated!.payments.find((p) => p.id === paymentId) : undefined;
  return NextResponse.json({
    invoice: detail,
    ...(recorded ? { payment: serializePayment(recorded) } : {}),
  });
}
