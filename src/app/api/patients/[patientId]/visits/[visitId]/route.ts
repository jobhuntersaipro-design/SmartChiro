import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VISIT_TYPES } from "@/types/visit";

type RouteContext = { params: Promise<{ patientId: string; visitId: string }> };

async function checkVisitAccess(userId: string, patientId: string, visitId: string) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    select: { id: true, patientId: true, doctorId: true, patient: { select: { branchId: true } } },
  });

  if (!visit || visit.patientId !== patientId) return { visit: null, allowed: false };

  // Visit's doctor always has access
  if (visit.doctorId === userId) return { visit, allowed: true };

  // OWNER or ADMIN of patient's branch has access
  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId: visit.patient.branchId } },
  });

  if (membership && (membership.role === "OWNER" || membership.role === "ADMIN")) {
    return { visit, allowed: true };
  }

  return { visit, allowed: false };
}

function validateScore(value: unknown, name: string): string | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10) {
    return `${name} must be an integer between 0 and 10`;
  }
  return null;
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patientId, visitId } = await params;
  const { visit: visitRef, allowed } = await checkVisitAccess(session.user.id, patientId, visitId);

  if (!visitRef) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  if (body.visitType && !VISIT_TYPES.includes(body.visitType)) {
    return NextResponse.json(
      { error: `Invalid visit type. Must be one of: ${VISIT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate questionnaire scores if provided
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
      if (value !== undefined) {
        const err = validateScore(value, name);
        if (err) {
          return NextResponse.json({ error: err }, { status: 400 });
        }
      }
    }
  }

  const updateData: Record<string, unknown> = {};
  const stringFields = [
    "visitType", "chiefComplaint", "subjective", "objective", "assessment",
    "plan", "treatmentNotes", "areasAdjusted", "techniqueUsed",
    "subluxationFindings", "recommendations", "referrals",
  ];
  for (const field of stringFields) {
    if (body[field] !== undefined) updateData[field] = body[field] || null;
  }

  const numberFields = ["bloodPressureSys", "bloodPressureDia", "heartRate", "nextVisitDays"];
  for (const field of numberFields) {
    if (body[field] !== undefined) updateData[field] = body[field] ?? null;
  }

  const floatFields = ["weight", "temperature"];
  for (const field of floatFields) {
    if (body[field] !== undefined) updateData[field] = body[field] ?? null;
  }

  if (body.visitDate) updateData.visitDate = new Date(body.visitDate);

  // Handle questionnaire upsert
  if (body.questionnaire) {
    const q = body.questionnaire;
    updateData.questionnaire = {
      upsert: {
        create: {
          painLevel: q.painLevel,
          mobilityScore: q.mobilityScore,
          sleepQuality: q.sleepQuality,
          dailyFunction: q.dailyFunction,
          overallImprovement: q.overallImprovement,
          patientComments: q.patientComments || null,
        },
        update: {
          ...(q.painLevel !== undefined && { painLevel: q.painLevel }),
          ...(q.mobilityScore !== undefined && { mobilityScore: q.mobilityScore }),
          ...(q.sleepQuality !== undefined && { sleepQuality: q.sleepQuality }),
          ...(q.dailyFunction !== undefined && { dailyFunction: q.dailyFunction }),
          ...(q.overallImprovement !== undefined && { overallImprovement: q.overallImprovement }),
          ...(q.patientComments !== undefined && { patientComments: q.patientComments || null }),
        },
      },
    };
  }

  const visit = await prisma.visit.update({
    where: { id: visitId },
    data: updateData,
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

  return NextResponse.json({
    visit: {
      id: visit.id,
      visitDate: visit.visitDate.toISOString(),
      visitType: visit.visitType,
      chiefComplaint: visit.chiefComplaint,
      subjective: visit.subjective,
      objective: visit.objective,
      assessment: visit.assessment,
      plan: visit.plan,
      treatmentNotes: visit.treatmentNotes,
      areasAdjusted: visit.areasAdjusted,
      techniqueUsed: visit.techniqueUsed,
      subluxationFindings: visit.subluxationFindings,
      bloodPressureSys: visit.bloodPressureSys,
      bloodPressureDia: visit.bloodPressureDia,
      heartRate: visit.heartRate,
      weight: visit.weight,
      temperature: visit.temperature,
      recommendations: visit.recommendations,
      referrals: visit.referrals,
      nextVisitDays: visit.nextVisitDays,
      invoice: visit.invoice
        ? {
            id: visit.invoice.id,
            invoiceNumber: visit.invoice.invoiceNumber,
            amount: Number(visit.invoice.amount),
            currency: visit.invoice.currency,
            status: visit.invoice.status,
            paymentMethod: visit.invoice.paymentMethod,
            paidAt: visit.invoice.paidAt?.toISOString() ?? null,
            notes: visit.invoice.notes,
          }
        : null,
      patientPackage: visit.patientPackage
        ? {
            id: visit.patientPackage.id,
            packageName: visit.patientPackage.package.name,
            sessionsUsed: visit.patientPackage.sessionsUsed,
            sessionsTotal: visit.patientPackage.sessionsTotal,
          }
        : null,
      questionnaire: visit.questionnaire
        ? {
            id: visit.questionnaire.id,
            painLevel: visit.questionnaire.painLevel,
            mobilityScore: visit.questionnaire.mobilityScore,
            sleepQuality: visit.questionnaire.sleepQuality,
            dailyFunction: visit.questionnaire.dailyFunction,
            overallImprovement: visit.questionnaire.overallImprovement,
            patientComments: visit.questionnaire.patientComments,
          }
        : null,
      doctor: { id: visit.doctor.id, name: visit.doctor.name },
      xrays: visit.xrays.map((x) => ({
        id: x.id,
        title: x.title,
        thumbnailUrl: x.thumbnailUrl,
        bodyRegion: x.bodyRegion,
      })),
      createdAt: visit.createdAt.toISOString(),
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patientId, visitId } = await params;
  const { visit, allowed } = await checkVisitAccess(session.user.id, patientId, visitId);

  if (!visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.visit.delete({ where: { id: visitId } });

  return NextResponse.json({ success: true });
}
