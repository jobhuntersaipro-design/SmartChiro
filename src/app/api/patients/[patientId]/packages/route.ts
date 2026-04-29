import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nextInvoiceNumber, type LineItem } from "@/lib/billing";
import { canManagePackages, checkPatientAccess, getBranchRole } from "@/lib/branch-access";
import type { PaymentMethod } from "@/types/visit";

type RouteContext = { params: Promise<{ patientId: string }> };

const VALID_PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "BANK_TRANSFER", "EWALLET", "INSURANCE", "OTHER"];

function serialize(p: Awaited<ReturnType<typeof loadOne>>) {
  if (!p) return null;
  return {
    id: p.id,
    patientId: p.patientId,
    packageId: p.packageId,
    branchId: p.branchId,
    packageName: p.package.name,
    packageDescription: p.package.description,
    sessionsTotal: p.sessionsTotal,
    sessionsUsed: p.sessionsUsed,
    sessionsRemaining: Math.max(0, p.sessionsTotal - p.sessionsUsed),
    totalPrice: Number(p.totalPrice),
    currency: p.package.currency,
    purchasedAt: p.purchasedAt.toISOString(),
    expiresAt: p.expiresAt?.toISOString() ?? null,
    status: p.status,
    invoiceId: p.invoiceId,
    invoiceStatus: p.invoice?.status ?? null,
    invoiceAmount: p.invoice ? Number(p.invoice.amount) : null,
    createdAt: p.createdAt.toISOString(),
  };
}

async function loadOne(id: string) {
  return prisma.patientPackage.findUnique({
    where: { id },
    include: { package: true, invoice: true },
  });
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { patientId } = await params;
  const { patient, allowed } = await checkPatientAccess(session.user.id, patientId);
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const where: Record<string, unknown> = { patientId };
  if (status === "active" || status === "ACTIVE") where.status = "ACTIVE";

  const items = await prisma.patientPackage.findMany({
    where,
    orderBy: [{ status: "asc" }, { purchasedAt: "desc" }],
    include: { package: true, invoice: true },
  });

  return NextResponse.json({ patientPackages: items.map((i) => serialize(i)) });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { patientId } = await params;
  const { patient, allowed } = await checkPatientAccess(session.user.id, patientId);
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const role = await getBranchRole(session.user.id, patient.branchId);
  if (!canManagePackages(role)) {
    return NextResponse.json({ error: "Only OWNER or ADMIN can sell packages" }, { status: 403 });
  }

  const body = await req.json();
  const packageId = typeof body.packageId === "string" ? body.packageId : "";
  const markPaid = !!body.markPaid;
  const paymentMethod = body.paymentMethod as PaymentMethod | undefined;
  if (!packageId) return NextResponse.json({ error: "packageId is required" }, { status: 400 });
  if (paymentMethod && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  const tpl = await prisma.package.findUnique({ where: { id: packageId } });
  if (!tpl || tpl.branchId !== patient.branchId) {
    return NextResponse.json({ error: "Package not available in this branch" }, { status: 404 });
  }
  if (tpl.status !== "ACTIVE") {
    return NextResponse.json({ error: "Package is archived" }, { status: 409 });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const expiresAt = tpl.validityDays
        ? new Date(Date.now() + tpl.validityDays * 24 * 60 * 60 * 1000)
        : null;

      const lineItem: LineItem = {
        description: `${tpl.name} (${tpl.sessionCount} sessions)`,
        quantity: 1,
        unitPrice: Number(tpl.price),
        total: Number(tpl.price),
      };
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: await nextInvoiceNumber(tx, "PKG"),
          amount: tpl.price,
          currency: tpl.currency,
          status: markPaid ? "PAID" : "DRAFT",
          paymentMethod: markPaid ? paymentMethod ?? null : null,
          paidAt: markPaid ? new Date() : null,
          lineItems: [lineItem],
          patientId,
          branchId: patient.branchId,
          notes: `Package purchase: ${tpl.name}`,
        },
      });

      const pp = await tx.patientPackage.create({
        data: {
          patientId,
          packageId: tpl.id,
          branchId: patient.branchId,
          sessionsTotal: tpl.sessionCount,
          totalPrice: tpl.price,
          expiresAt,
          invoiceId: invoice.id,
        },
      });

      return loadOne(pp.id);
    });

    return NextResponse.json({ patientPackage: serialize(created) }, { status: 201 });
  } catch (e) {
    console.error("POST /api/patients/[id]/packages error:", e);
    return NextResponse.json({ error: "Failed to sell package" }, { status: 500 });
  }
}
