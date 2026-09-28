import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { billingAccess } from "@/lib/billing-access";
import { clinicDateLabel } from "@/lib/clinic-time";
import { createInvoice } from "@/lib/invoices";
import { invoiceErrorResponse } from "@/lib/invoice-detail";

type RouteCtx = { params: Promise<{ appointmentId: string }> };

const LineItem = z.object({
  description: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  /** Accepted for older clients; totals are always recomputed. */
  total: z.number().nonnegative().optional(),
  taxable: z.boolean().optional(),
});

const Body = z.object({
  /** Price of the default single line when no line items are given. */
  amount: z.number().nonnegative(),
  dueDays: z.number().int().nonnegative().optional(),
  lineItems: z.array(LineItem).optional(),
});

/** dd/mm/yyyy on the clinic's calendar (the server's UTC day is wrong before 8 AM MYT). */
function formatDDMMYYYY(d: Date): string {
  return clinicDateLabel(d, "numeric");
}

/**
 * Issue an invoice for a completed appointment. The grand total (incl. SST
 * for non-Malaysian patients when the branch charges it) is computed from the
 * line items. Several invoices per appointment are allowed.
 */
export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const { appointmentId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      branchId: true,
      patientId: true,
      status: true,
      dateTime: true,
    },
  });
  if (!appt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // RBAC: OWNER/ADMIN at the branch only.
  // TODO(front-desk): FRONT_DESK may issue invoices.
  const role = await getUserBranchRole(user.id, appt.branchId);
  if (!billingAccess(role).manage) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (appt.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "appointment_not_completed" },
      { status: 422 }
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const { amount, dueDays, lineItems } = parsed.data;

  const lines =
    lineItems && lineItems.length > 0
      ? lineItems.map(({ description, quantity, unitPrice, taxable }) => ({ description, quantity, unitPrice, taxable }))
      : [
          {
            description: `Treatment session — ${formatDDMMYYYY(appt.dateTime)}`,
            quantity: 1,
            unitPrice: amount,
          },
        ];

  const due = new Date();
  due.setDate(due.getDate() + (dueDays ?? 14));

  let invoice;
  try {
    invoice = await prisma.$transaction((tx) =>
      createInvoice(tx, {
        branchId: appt.branchId,
        patientId: appt.patientId,
        appointmentId: appt.id,
        lines,
        dueDate: due,
        status: "DRAFT",
      }),
    );
  } catch (err) {
    return invoiceErrorResponse(err);
  }

  return NextResponse.json(
    {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: Number(invoice.amount),
        subtotal: Number(invoice.subtotal),
        taxAmount: Number(invoice.taxAmount ?? 0),
        taxLabel: invoice.taxLabel,
        currency: invoice.currency,
        status: invoice.status,
        dueDate: invoice.dueDate?.toISOString() ?? null,
        lineItems: invoice.lineItems,
        patientId: invoice.patientId,
        branchId: invoice.branchId,
        appointmentId: invoice.appointmentId,
        createdAt: invoice.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
