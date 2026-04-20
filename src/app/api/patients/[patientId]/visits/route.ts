import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ patientId: string }> };

const VALID_VISIT_TYPES = ["initial", "follow_up", "emergency", "reassessment", "discharge"];

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
  const type = url.searchParams.get("type");
  const sort = url.searchParams.get("sort") === "oldest" ? "asc" as const : "desc" as const;

  const where: Record<string, unknown> = { patientId };
  if (type && VALID_VISIT_TYPES.includes(type)) {
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
        xrays: {
          select: { id: true, title: true, thumbnailUrl: true, bodyRegion: true },
          where: { status: "READY" },
        },
      },
    }),
    prisma.visit.count({ where }),
  ]);

  return NextResponse.json({
    visits: visits.map((v) => ({
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
    })),
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
  if (body.visitType && !VALID_VISIT_TYPES.includes(body.visitType)) {
    return NextResponse.json(
      { error: `Invalid visit type. Must be one of: ${VALID_VISIT_TYPES.join(", ")}` },
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
      const err = validateScore(value, name);
      if (err) {
        return NextResponse.json({ error: err }, { status: 400 });
      }
    }
  }

  // Validate vitals ranges
  if (body.bloodPressureSys !== undefined && body.bloodPressureSys !== null) {
    if (body.bloodPressureSys < 50 || body.bloodPressureSys > 300) {
      return NextResponse.json({ error: "Systolic BP must be between 50 and 300" }, { status: 400 });
    }
  }
  if (body.bloodPressureDia !== undefined && body.bloodPressureDia !== null) {
    if (body.bloodPressureDia < 20 || body.bloodPressureDia > 200) {
      return NextResponse.json({ error: "Diastolic BP must be between 20 and 200" }, { status: 400 });
    }
  }
  if (body.heartRate !== undefined && body.heartRate !== null) {
    if (body.heartRate < 20 || body.heartRate > 300) {
      return NextResponse.json({ error: "Heart rate must be between 20 and 300" }, { status: 400 });
    }
  }

  const visit = await prisma.visit.create({
    data: {
      visitDate: body.visitDate ? new Date(body.visitDate) : new Date(),
      visitType: body.visitType || null,
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
      doctorId: session.user.id,
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
    include: {
      questionnaire: true,
      doctor: { select: { id: true, name: true } },
      xrays: {
        select: { id: true, title: true, thumbnailUrl: true, bodyRegion: true },
      },
    },
  });

  return NextResponse.json(
    {
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
        xrays: [],
        createdAt: visit.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
