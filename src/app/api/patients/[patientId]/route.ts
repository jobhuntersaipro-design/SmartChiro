import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ patientId: string }> };

async function checkPatientAccess(userId: string, patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, branchId: true, doctorId: true },
  });

  if (!patient) return { patient: null, allowed: false };

  // Assigned doctor always has access
  if (patient.doctorId === userId) return { patient, allowed: true };

  // OWNER or ADMIN of the patient's branch has access
  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId: patient.branchId } },
  });

  if (membership && (membership.role === "OWNER" || membership.role === "ADMIN")) {
    return { patient, allowed: true };
  }

  return { patient, allowed: false };
}

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patientId } = await params;
  const { patient: patientRef, allowed } = await checkPatientAccess(session.user.id, patientId);

  if (!patientRef) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      doctor: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      _count: { select: { visits: true, xrays: true } },
      visits: {
        select: { id: true, visitDate: true, subjective: true },
        orderBy: { visitDate: "desc" },
        take: 5,
      },
      xrays: {
        select: { id: true, title: true, bodyRegion: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  return NextResponse.json({
    patient: {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
      phone: patient.phone,
      dateOfBirth: patient.dateOfBirth?.toISOString() ?? null,
      gender: patient.gender,
      address: patient.address,
      emergencyContact: patient.emergencyContact,
      medicalHistory: patient.medicalHistory,
      notes: patient.notes,
      doctorId: patient.doctorId,
      doctorName: patient.doctor?.name ?? "Unknown",
      branchId: patient.branchId,
      branchName: patient.branch?.name ?? "Unknown",
      totalVisits: patient._count.visits,
      totalXrays: patient._count.xrays,
      recentVisits: patient.visits.map((v) => ({
        id: v.id,
        visitDate: v.visitDate.toISOString(),
        subjective: v.subjective,
      })),
      recentXrays: patient.xrays.map((x) => ({
        id: x.id,
        title: x.title,
        bodyRegion: x.bodyRegion,
        createdAt: x.createdAt.toISOString(),
      })),
      createdAt: patient.createdAt.toISOString(),
      updatedAt: patient.updatedAt.toISOString(),
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { patientId } = await params;
  const { patient: patientRef, allowed } = await checkPatientAccess(session.user.id, patientId);

  if (!patientRef) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    firstName, lastName, email, phone, dateOfBirth,
    gender, address, emergencyContact, medicalHistory, notes, doctorId,
  } = body;

  // Validate name fields if provided
  if (firstName !== undefined && (!firstName || !firstName.trim())) {
    return NextResponse.json({ error: "First name cannot be empty" }, { status: 400 });
  }
  if (lastName !== undefined && (!lastName || !lastName.trim())) {
    return NextResponse.json({ error: "Last name cannot be empty" }, { status: 400 });
  }
  if (email !== undefined && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  // Validate doctorId if changing
  if (doctorId !== undefined) {
    const isMember = await prisma.branchMember.findUnique({
      where: { userId_branchId: { userId: doctorId, branchId: patientRef.branchId } },
    });
    if (!isMember) {
      return NextResponse.json(
        { error: "Doctor must be a member of the patient's branch" },
        { status: 400 }
      );
    }
  }

  const updateData: Record<string, unknown> = {};
  if (firstName !== undefined) updateData.firstName = firstName.trim();
  if (lastName !== undefined) updateData.lastName = lastName.trim();
  if (email !== undefined) updateData.email = email?.trim() || null;
  if (phone !== undefined) updateData.phone = phone?.trim() || null;
  if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
  if (gender !== undefined) updateData.gender = gender || null;
  if (address !== undefined) updateData.address = address?.trim() || null;
  if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact?.trim() || null;
  if (medicalHistory !== undefined) updateData.medicalHistory = medicalHistory || null;
  if (notes !== undefined) updateData.notes = notes || null;
  if (doctorId !== undefined) updateData.doctorId = doctorId;

  const updated = await prisma.patient.update({
    where: { id: patientId },
    data: updateData,
    include: {
      doctor: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    patient: {
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
      dateOfBirth: updated.dateOfBirth?.toISOString() ?? null,
      gender: updated.gender,
      address: updated.address,
      emergencyContact: updated.emergencyContact,
      medicalHistory: updated.medicalHistory,
      notes: updated.notes,
      doctorId: updated.doctorId,
      doctorName: updated.doctor?.name ?? "Unknown",
      branchId: updated.branchId,
      branchName: updated.branch?.name ?? "Unknown",
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext
) {
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

  await prisma.patient.delete({ where: { id: patientId } });

  return NextResponse.json({ success: true });
}
