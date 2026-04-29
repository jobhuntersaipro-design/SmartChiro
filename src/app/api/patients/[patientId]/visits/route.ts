import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nextInvoiceNumber, type LineItem } from "@/lib/billing";
import { VISIT_TYPES, VISIT_TYPE_LABELS } from "@/types/visit";
import type { VisitType, PaymentMethod } from "@/types/visit";

type RouteContext = { params: Promise<{ patientId: string }> };

const VALID_PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD", "BANK_TRANSFER", "EWALLET", "INSURANCE", "OTHER"];

async function checkPatientAccess(userId: string, patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, branchId: true, doctorId: true },
  });

  if (!patient) return { patient: null, allowed: false };

  if (patient.doctorId === userId) return { patient, allowed: true };

  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId: patient.branchId } },
  });

  if (membership && (membership.role === "OWNER" || membership.role === "ADMIN")) {
    return { patient, allowed: true };
  }

  return { patient, allowed: false };
}

function serializeVisit(v: Awaited<ReturnType<typeof loadVisit>>) {
  if (!v) return null;
  return {
    id: v.id,
    visitDate: v.visitDate.toISOString(),
    visitType: v.visitType,
    chiefComplaint: v.chiefComplaint,
    subjective: v.subjective,
    objective: v.objective,
    assessment: v.assessment,
    plan: v.plan,
    treatmentNotes: v.treatmentNotes,
    areasAdjusted: v.areasAdjusted,
    techniqueUsed: v.techniqueUsed,
    subluxationFindings: v.subluxationFindings,
    bloodPressureSys: v.bloodPressureSys,
    bloodPressureDia: v.bloodPressureDia,
    heartRate: v.heartRate,
    weight: v.weight,
    temperature: v.temperature,
    recommendations: v.recommendations,
    referrals: v.referrals,
    nextVisitDays: v.nextVisitDays,
    invoice: v.invoice
      ? {
          id: v.invoice.id,
          invoiceNumber: v.invoice.invoiceNumber,
          amount: Number(v.invoice.amount),
          currency: v.invoice.currency,
          status: v.invoice.status,
          paymentMethod: v.invoice.paymentMethod,
          paidAt: v.invoice.paidAt?.toISOString() ?? null,
          notes: v.invoice.notes,
        }
      : null,
    patientPackage: v.patientPackage
      ? {
          id: v.patientPackage.id,
          packageName: v.patientPackage.package.name,
          sessionsUsed: v.patientPackage.sessionsUsed,
          sessionsTotal: v.patientPackage.sessionsTotal,
        }
      : null,
    questionnaire: v.questionnaire
      ? {
          id: v.questionnaire.id,
          painLevel: v.questionnaire.painLevel,
          mobilityScore: v.questionnaire.mobilityScore,
          sleepQuality: v.questionnaire.sleepQuality,
          dailyFunction: v.questionnaire.dailyFunction,
          overallImprovement: v.questionnaire.overallImprovement,
          patientComments: v.questionnaire.patientComments,
        }
      : null,
    doctor: { id: v.doctor.id, name: v.doctor.name },
    xrays: v.xrays.map((x) => ({
      id: x.id,
      title: x.title,
      thumbnailUrl: x.thumbnailUrl,
      bodyRegion: x.bodyRegion,
    })),
    createdAt: v.createdAt.toISOString(),
  };
}

async function loadVisit(visitId: string) {
  return prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      questionnaire: true,
      doctor: { select: { id: true, name: true } },
      invoice: true,
      patientPackage: { include: { package: true } },
      xrays: {
        select: { id: true, title: true, thumbnailUrl: true, bodyRegion: true },
        where: { status: "READY" },
      },
    },
  });
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patientId } = await params;
  const { patient, allowed } = await checkPatientAccess(session.user.id, patientId);

  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");
  const type = url.searchParams.get("type") as VisitType | null;
  const sort = url.searchParams.get("sort") === "oldest" ? ("asc" as const) : ("desc" as const);

  const where: Record<string, unknown> = { patientId };
  if (type && VISIT_TYPES.includes(type)) {
    where.visitType = type;
  }

  const [visits, total] = await Promise.all([
    prisma.visit.findMany({
      where,
      orderBy: { visitDate: sort },
      skip: offset,
      take: limit,
      include: {
        questionnaire: true,
        doctor: { select: { id: true, name: true } },
        invoice: true,
        patientPackage: { include: { package: true } },
        xrays: {
          select: { id: true, title: true, thumbnailUrl: true, bodyRegion: true },
          where: { status: "READY" },
        },
      },
    }),
    prisma.visit.count({ where }),
  ]);

  return NextResponse.json({
    visits: visits.map((v) => serializeVisit(v)),
    total,
    limit,
    offset,
  });
}

function validateScore(value: unknown, name: string): string | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10) {
    return `${name} must be an integer between 0 and 10`;
  }
  return null;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patientId } = await params;
  const { patient, allowed } = await checkPatientAccess(session.user.id, patientId);

  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // Validate visit type
  if (body.visitType && !VISIT_TYPES.includes(body.visitType)) {
    return NextResponse.json(
      { error: `Invalid visit type. Must be one of: ${VISIT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate questionnaire
  if (body.questionnaire) {
    const q = body.questionnaire;
    const fields = [
      ["painLevel", q.painLevel],
      ["mobilityScore", q.mobilityScore],
      ["sleepQuality", q.sleepQuality],
      ["dailyFunction", q.dailyFunction],
      ["overallImprovement", q.overallImprovement],
    ] as const;
    for (const [name, value] of fields) {
      const err = validateScore(value, name);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }
  }

  // Validate vitals
  if (body.bloodPressureSys != null && (body.bloodPressureSys < 50 || body.bloodPressureSys > 300)) {
    return NextResponse.json({ error: "Systolic BP must be between 50 and 300" }, { status: 400 });
  }
  if (body.bloodPressureDia != null && (body.bloodPressureDia < 20 || body.bloodPressureDia > 200)) {
    return NextResponse.json({ error: "Diastolic BP must be between 20 and 200" }, { status: 400 });
  }
  if (body.heartRate != null && (body.heartRate < 20 || body.heartRate > 300)) {
    return NextResponse.json({ error: "Heart rate must be between 20 and 300" }, { status: 400 });
  }

  // Billing validation
  const billing = body.billing ?? { mode: "none" };
  if (billing.mode && !["none", "per_visit", "package"].includes(billing.mode)) {
    return NextResponse.json({ error: "Invalid billing mode" }, { status: 400 });
  }
  if (billing.mode === "per_visit") {
    const fee = Number(billing.fee);
    if (!Number.isFinite(fee) || fee < 0) {
      return NextResponse.json({ error: "Visit fee must be a non-negative number" }, { status: 400 });
    }
    if (billing.paymentMethod && !VALID_PAYMENT_METHODS.includes(billing.paymentMethod)) {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }
  }
  if (billing.mode === "package") {
    if (typeof billing.patientPackageId !== "string" || !billing.patientPackageId) {
      return NextResponse.json({ error: "patientPackageId is required when mode=package" }, { status: 400 });
    }
  }

  try {
    const visit = await prisma.$transaction(async (tx) => {
      let invoiceId: string | null = null;
      let patientPackageId: string | null = null;

      if (billing.mode === "per_visit" && Number(billing.fee) > 0) {
        const fee = Number(billing.fee);
        const visitTypeLabel = body.visitType
          ? VISIT_TYPE_LABELS[body.visitType as VisitType]
          : "Visit";
        const lineItem: LineItem = {
          description: `${visitTypeLabel} — ${new Date(body.visitDate ?? Date.now()).toISOString().slice(0, 10)}`,
          quantity: 1,
          unitPrice: fee,
          total: fee,
        };
        const status = billing.markPaid ? "PAID" : "DRAFT";
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: await nextInvoiceNumber(tx),
            amount: fee,
            currency: "MYR",
            status,
            paymentMethod: billing.markPaid && billing.paymentMethod ? billing.paymentMethod : null,
            paidAt: status === "PAID" ? new Date() : null,
            lineItems: [lineItem],
            patientId,
            branchId: patient.branchId,
          },
        });
        invoiceId = invoice.id;
      }

      if (billing.mode === "package") {
        const pp = await tx.patientPackage.findUnique({
          where: { id: billing.patientPackageId },
        });
        if (!pp || pp.patientId !== patientId) {
          throw new Error("PACKAGE_NOT_FOUND");
        }
        if (pp.status !== "ACTIVE") {
          throw new Error("PACKAGE_NOT_ACTIVE");
        }
        if (pp.sessionsUsed >= pp.sessionsTotal) {
          throw new Error("PACKAGE_EXHAUSTED");
        }
        if (pp.expiresAt && pp.expiresAt < new Date()) {
          throw new Error("PACKAGE_EXPIRED");
        }
        const newUsed = pp.sessionsUsed + 1;
        await tx.patientPackage.update({
          where: { id: pp.id },
          data: {
            sessionsUsed: newUsed,
            status: newUsed >= pp.sessionsTotal ? "COMPLETED" : "ACTIVE",
          },
        });
        patientPackageId = pp.id;
      }

      const created = await tx.visit.create({
        data: {
          visitDate: body.visitDate ? new Date(body.visitDate) : new Date(),
          visitType: body.visitType ?? null,
          chiefComplaint: body.chiefComplaint || null,
          subjective: body.subjective || null,
          objective: body.objective || null,
          assessment: body.assessment || null,
          plan: body.plan || null,
          treatmentNotes: body.treatmentNotes || null,
          areasAdjusted: body.areasAdjusted || null,
          techniqueUsed: body.techniqueUsed || null,
          subluxationFindings: body.subluxationFindings || null,
          bloodPressureSys: body.bloodPressureSys ?? null,
          bloodPressureDia: body.bloodPressureDia ?? null,
          heartRate: body.heartRate ?? null,
          weight: body.weight ?? null,
          temperature: body.temperature ?? null,
          recommendations: body.recommendations || null,
          referrals: body.referrals || null,
          nextVisitDays: body.nextVisitDays ?? null,
          patientId,
          doctorId: session.user.id!,
          invoiceId,
          patientPackageId,
          ...(body.questionnaire
            ? {
                questionnaire: {
                  create: {
                    painLevel: body.questionnaire.painLevel,
                    mobilityScore: body.questionnaire.mobilityScore,
                    sleepQuality: body.questionnaire.sleepQuality,
                    dailyFunction: body.questionnaire.dailyFunction,
                    overallImprovement: body.questionnaire.overallImprovement,
                    patientComments: body.questionnaire.patientComments || null,
                  },
                },
              }
            : {}),
        },
      });

      return loadVisit(created.id);
    });

    return NextResponse.json({ visit: serializeVisit(visit) }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create visit";
    if (msg === "PACKAGE_NOT_FOUND") return NextResponse.json({ error: "Package not found for this patient" }, { status: 404 });
    if (msg === "PACKAGE_NOT_ACTIVE") return NextResponse.json({ error: "Package is not active" }, { status: 409 });
    if (msg === "PACKAGE_EXHAUSTED") return NextResponse.json({ error: "Package has no sessions remaining" }, { status: 409 });
    if (msg === "PACKAGE_EXPIRED") return NextResponse.json({ error: "Package has expired" }, { status: 409 });
    console.error("POST /api/patients/[id]/visits error:", e);
    return NextResponse.json({ error: "Failed to create visit" }, { status: 500 });
  }
}
