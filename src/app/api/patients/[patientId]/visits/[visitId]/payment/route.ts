import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nextInvoiceNumber, type LineItem } from "@/lib/billing";
import type { InvoiceStatus, PaymentMethod, VisitType } from "@/types/visit";
import { VISIT_TYPE_LABELS } from "@/types/visit";

type RouteContext = { params: Promise<{ patientId: string; visitId: string }> };

const VALID_INVOICE_STATUSES: InvoiceStatus[] = ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"];
const VALID_PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "BANK_TRANSFER", "EWALLET", "INSURANCE", "OTHER"];

async function checkVisitAccess(userId: string, patientId: string, visitId: string) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      patient: { select: { branchId: true } },
      invoice: true,
    },
  });
  if (!visit || visit.patientId !== patientId) return { visit: null, allowed: false };
  if (visit.doctorId === userId) return { visit, allowed: true };
  const m = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId: visit.patient.branchId } },
  });
  if (m && (m.role === "OWNER" || m.role === "ADMIN" || m.role === "DOCTOR")) {
    return { visit, allowed: true };
  }
  return { visit, allowed: false };
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { patientId, visitId } = await params;
  const { visit, allowed } = await checkVisitAccess(session.user.id, patientId, visitId);
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (visit.patientPackageId) {
    return NextResponse.json(
      { error: "This visit was redeemed from a package and cannot be billed separately." },
      { status: 409 }
    );
  }

  const body = await req.json();
  const status = body.status as InvoiceStatus | undefined;
  const amount = body.amount;
  const paymentMethod = body.paymentMethod as PaymentMethod | undefined;
  const notes = body.notes;
  const paidAtRaw = body.paidAt;

  if (status && !VALID_INVOICE_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (paymentMethod && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }
  if (amount != null && (typeof amount !== "number" || amount < 0)) {
    return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
  }

  const targetStatus: InvoiceStatus = status ?? "DRAFT";
  const paidAt =
    targetStatus === "PAID"
      ? paidAtRaw
        ? new Date(paidAtRaw)
        : visit.invoice?.paidAt ?? new Date()
      : null;

  try {
    let invoice;
    if (visit.invoice) {
      invoice = await prisma.invoice.update({
        where: { id: visit.invoice.id },
        data: {
          status: targetStatus,
          ...(amount != null ? { amount } : {}),
          paymentMethod: targetStatus === "PAID" ? paymentMethod ?? visit.invoice.paymentMethod ?? null : null,
          paidAt,
          ...(notes !== undefined ? { notes: notes || null } : {}),
        },
      });
    } else {
      const fee = Number(amount ?? 0);
      if (fee <= 0) {
        return NextResponse.json(
          { error: "amount is required to create a new invoice" },
          { status: 400 }
        );
      }
      const visitTypeLabel = visit.visitType
        ? VISIT_TYPE_LABELS[visit.visitType as VisitType]
        : "Visit";
      const lineItem: LineItem = {
        description: `${visitTypeLabel} — ${visit.visitDate.toISOString().slice(0, 10)}`,
        quantity: 1,
        unitPrice: fee,
        total: fee,
      };
      invoice = await prisma.$transaction(async (tx) => {
        const inv = await tx.invoice.create({
          data: {
            invoiceNumber: await nextInvoiceNumber(tx),
            amount: fee,
            currency: "MYR",
            status: targetStatus,
            paymentMethod: targetStatus === "PAID" ? paymentMethod ?? null : null,
            paidAt,
            lineItems: [lineItem],
            patientId,
            branchId: visit.patient.branchId,
            notes: notes || null,
          },
        });
        await tx.visit.update({ where: { id: visitId }, data: { invoiceId: inv.id } });
        return inv;
      });
    }

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: Number(invoice.amount),
        currency: invoice.currency,
        status: invoice.status,
        paymentMethod: invoice.paymentMethod,
        paidAt: invoice.paidAt?.toISOString() ?? null,
        notes: invoice.notes,
      },
    });
  } catch (e) {
    console.error("PATCH /api/patients/[id]/visits/[id]/payment error:", e);
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }
}
