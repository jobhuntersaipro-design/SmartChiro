import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { billingAccess } from "@/lib/billing-access";
import { PAYMENT_METHODS, recordPayment } from "@/lib/invoices";
import {
  invoiceErrorResponse,
  loadInvoiceDetail,
  parseReceivedAt,
  serializeInvoiceDetail,
  serializePayment,
} from "@/lib/invoice-detail";

type RouteCtx = { params: Promise<{ invoiceId: string }> };

const Body = z.object({
  /** Ringgit. Negative records a refund (needs refundReason). */
  amount: z.number().finite().refine((v) => v !== 0, "amount must not be zero"),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(100).nullable().optional(),
  /** "YYYY-MM-DD" (clinic day, current clinic time) or an ISO timestamp; defaults to now. */
  receivedAt: z.string().max(40).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  refundReason: z.string().trim().max(500).nullable().optional(),
});

/** Allow a little clock skew between the front desk's device and the server. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Record a payment against an invoice (deposit, instalment or one part of a
 * split payment), or a refund when `amount` is negative. Each gets its own
 * receipt number; the invoice's amountPaid, status and paidAt move in the
 * same transaction. Overpayment and payments on cancelled invoices → 422.
 * Payments: OWNER/ADMIN. Refunds: OWNER/ADMIN only.
 */
export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const { invoiceId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { branchId: true } });
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const access = billingAccess(await getUserBranchRole(user.id, invoice.branchId));
  if (!access.read) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 422 });
  }
  const body = parsed.data;
  const isRefund = body.amount < 0;
  // TODO(front-desk): FRONT_DESK may record payments (manage) but not refunds.
  if (isRefund ? !access.refund : !access.manage) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (isRefund && !body.refundReason) return NextResponse.json({ error: "refund_reason_required" }, { status: 422 });

  const now = new Date();
  const receivedAt = parseReceivedAt(body.receivedAt, now);
  if (!receivedAt) return NextResponse.json({ error: "validation", field: "receivedAt" }, { status: 422 });
  if (receivedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return NextResponse.json({ error: "received_in_future" }, { status: 422 });
  }

  let paymentId: string;
  try {
    const result = await prisma.$transaction((tx) =>
      recordPayment(tx, {
        invoiceId,
        amount: body.amount,
        method: body.method,
        reference: body.reference ?? null,
        receivedAt,
        receivedById: user.id,
        notes: body.notes ?? null,
        refundReason: body.refundReason ?? null,
      }),
    );
    paymentId = result.payment.id;
  } catch (err) {
    return invoiceErrorResponse(err);
  }

  const detail = await loadInvoiceDetail(invoiceId);
  const payment = detail!.payments.find((p) => p.id === paymentId)!;
  return NextResponse.json(
    { payment: serializePayment(payment), invoice: serializeInvoiceDetail(detail!) },
    { status: 201 },
  );
}
