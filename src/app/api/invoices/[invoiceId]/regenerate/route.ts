import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import type { Prisma } from "@prisma/client";

type RouteCtx = { params: Promise<{ invoiceId: string }> };

const LineItem = z.object({
  description: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  total: z.number().nonnegative(),
});

const Body = z
  .object({
    lineItems: z.array(LineItem).optional(),
  })
  .optional();

function generateInvoiceNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INV-${ts}-${rand}`;
}

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
      amount: true,
      currency: true,
      lineItems: true,
      dueDate: true,
    },
  });
  if (!original) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // RBAC: OWNER/ADMIN at the invoice's branch only.
  const role = await getUserBranchRole(user.id, original.branchId);
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (original.status === "PAID") {
    return NextResponse.json({ error: "invoice_already_paid" }, { status: 422 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const overrideItems = parsed.data?.lineItems;

  const lineItems = (overrideItems ?? (original.lineItems as Prisma.InputJsonValue));

  const newInvoice = await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "CANCELLED" },
    });
    return tx.invoice.create({
      data: {
        invoiceNumber: generateInvoiceNumber(),
        amount: original.amount,
        currency: original.currency,
        status: "DRAFT",
        dueDate: original.dueDate ?? null,
        lineItems,
        patientId: original.patientId,
        branchId: original.branchId,
        appointmentId: original.appointmentId,
      },
    });
  });

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
