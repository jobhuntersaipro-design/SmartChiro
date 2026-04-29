import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManagePackages, getBranchRole } from "@/lib/branch-access";
import type { PatientPackageStatus } from "@/types/package";
import type { PaymentMethod } from "@/types/visit";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_STATUSES: PatientPackageStatus[] = ["ACTIVE", "COMPLETED", "EXPIRED", "CANCELLED"];
const VALID_PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "BANK_TRANSFER", "EWALLET", "INSURANCE", "OTHER"];

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const pp = await prisma.patientPackage.findUnique({
    where: { id },
    include: { package: true, invoice: true },
  });
  if (!pp) return NextResponse.json({ error: "Patient package not found" }, { status: 404 });

  const role = await getBranchRole(session.user.id, pp.branchId);
  if (!canManagePackages(role)) {
    return NextResponse.json({ error: "Only OWNER or ADMIN can update packages" }, { status: 403 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (body.status) data.status = body.status;
  if (body.expiresAt === null) data.expiresAt = null;
  else if (typeof body.expiresAt === "string") data.expiresAt = new Date(body.expiresAt);

  // Optionally mark associated invoice as paid
  if (body.markInvoicePaid && pp.invoiceId) {
    if (body.paymentMethod && !VALID_PAYMENT_METHODS.includes(body.paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }
    await prisma.invoice.update({
      where: { id: pp.invoiceId },
      data: {
        status: "PAID",
        paymentMethod: body.paymentMethod ?? null,
        paidAt: new Date(),
      },
    });
  }

  const updated = await prisma.patientPackage.update({
    where: { id },
    data,
    include: { package: true, invoice: true },
  });

  return NextResponse.json({
    patientPackage: {
      id: updated.id,
      patientId: updated.patientId,
      packageId: updated.packageId,
      branchId: updated.branchId,
      packageName: updated.package.name,
      packageDescription: updated.package.description,
      sessionsTotal: updated.sessionsTotal,
      sessionsUsed: updated.sessionsUsed,
      sessionsRemaining: Math.max(0, updated.sessionsTotal - updated.sessionsUsed),
      totalPrice: Number(updated.totalPrice),
      currency: updated.package.currency,
      purchasedAt: updated.purchasedAt.toISOString(),
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      status: updated.status,
      invoiceId: updated.invoiceId,
      invoiceStatus: updated.invoice?.status ?? null,
      invoiceAmount: updated.invoice ? Number(updated.invoice.amount) : null,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}
