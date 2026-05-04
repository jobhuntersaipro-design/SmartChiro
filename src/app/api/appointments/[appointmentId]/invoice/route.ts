import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

type RouteCtx = { params: Promise<{ appointmentId: string }> };

const LineItem = z.object({
  description: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

const Body = z.object({
  amount: z.number().nonnegative(),
  dueDays: z.number().int().nonnegative().optional(),
  lineItems: z.array(LineItem).optional(),
});

function generateInvoiceNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INV-${ts}-${rand}`;
}

function formatDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

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
  const role = await getUserBranchRole(user.id, appt.branchId);
  if (role !== "OWNER" && role !== "ADMIN") {
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

  const items =
    lineItems && lineItems.length > 0
      ? lineItems
      : [
          {
            description: `Treatment session — ${formatDDMMYYYY(appt.dateTime)}`,
            quantity: 1,
            unitPrice: amount,
            total: amount,
          },
        ];

  const due = new Date();
  due.setDate(due.getDate() + (dueDays ?? 14));

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: generateInvoiceNumber(),
      amount,
      currency: "MYR",
      status: "DRAFT",
      dueDate: due,
      lineItems: items,
      patientId: appt.patientId,
      branchId: appt.branchId,
      appointmentId: appt.id,
    },
  });

  return NextResponse.json(
    {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: Number(invoice.amount),
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
