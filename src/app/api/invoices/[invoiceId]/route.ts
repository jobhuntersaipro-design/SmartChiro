import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { can } from "@/lib/permissions";
import { canTransitionInvoice, effectiveInvoiceStatus, type InvoiceStatus } from "@/lib/invoices";

type RouteCtx = { params: Promise<{ invoiceId: string }> };

const Body = z.object({ status: z.enum(["SENT", "PAID", "CANCELLED"]) });

/** Mark an invoice sent, paid (stamps paidAt) or cancelled. OWNER/ADMIN/FRONT_DESK of its branch. */
export async function PATCH(req: Request, ctx: RouteCtx): Promise<Response> {
  const { invoiceId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { branchId: true, status: true, dueDate: true },
  });
  if (!invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const role = await getUserBranchRole(user.id, invoice.branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!can(role, "invoice.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 422 });
  const next = parsed.data.status;

  const current = effectiveInvoiceStatus(invoice.status as InvoiceStatus, invoice.dueDate);
  if (!canTransitionInvoice(current, next)) {
    return NextResponse.json({ error: "invalid_transition", from: current, to: next }, { status: 422 });
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: next, ...(next === "PAID" ? { paidAt: new Date() } : {}) },
    select: { id: true, status: true, paidAt: true, dueDate: true },
  });
  return NextResponse.json({
    invoice: {
      ...updated,
      status: effectiveInvoiceStatus(updated.status as InvoiceStatus, updated.dueDate),
      paidAt: updated.paidAt?.toISOString() ?? null,
      dueDate: updated.dueDate?.toISOString() ?? null,
    },
  });
}
