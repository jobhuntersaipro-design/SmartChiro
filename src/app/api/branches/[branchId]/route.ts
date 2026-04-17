import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ branchId: string }> };

export async function GET(
  req: NextRequest,
  { params }: RouteContext
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId } = await params;
  const includeStats = req.nextUrl.searchParams.get("include") === "stats";

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { patients: true } },
    },
  });

  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const callerMembership = branch.members.find((m) => m.userId === session.user!.id);
  if (!callerMembership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const base = {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    city: branch.city,
    state: branch.state,
    zip: branch.zip,
    phone: branch.phone,
    email: branch.email,
    website: branch.website,
    operatingHours: branch.operatingHours,
    treatmentRooms: branch.treatmentRooms,
    clinicType: branch.clinicType,
    ownerName: branch.ownerName,
    licenseNumber: branch.licenseNumber,
    specialties: branch.specialties,
    insuranceProviders: branch.insuranceProviders,
    billingContactName: branch.billingContactName,
    billingContactEmail: branch.billingContactEmail,
    billingContactPhone: branch.billingContactPhone,
    members: branch.members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
    })),
    userRole: callerMembership.role,
    patientCount: branch._count.patients,
    createdAt: branch.createdAt.toISOString(),
    updatedAt: branch.updatedAt.toISOString(),
  };

  if (!includeStats) {
    return NextResponse.json({ branch: base });
  }

  // With stats: appointment counts + xray counts per doctor
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const doctorIds = branch.members.map((m) => m.userId);

  const [todayAppts, weekAppts, completedToday, xraysThisMonth, doctorPatientCounts, doctorXrayCounts] = await Promise.all([
    prisma.appointment.count({
      where: { branchId, dateTime: { gte: todayStart, lt: todayEnd } },
    }),
    prisma.appointment.count({
      where: { branchId, dateTime: { gte: weekStart, lt: weekEnd } },
    }),
    prisma.appointment.count({
      where: { branchId, dateTime: { gte: todayStart, lt: todayEnd }, status: "COMPLETED" },
    }),
    prisma.xray.count({
      where: { patient: { branchId }, createdAt: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.patient.groupBy({
      by: ["doctorId"],
      where: { branchId, doctorId: { in: doctorIds } },
      _count: { id: true },
    }),
    prisma.xray.groupBy({
      by: ["uploadedById"],
      where: {
        patient: { branchId },
        uploadedById: { in: doctorIds },
        createdAt: { gte: monthStart, lt: monthEnd },
      },
      _count: { id: true },
    }),
  ]);

  const patientCountMap = new Map(doctorPatientCounts.map((d) => [d.doctorId, d._count.id]));
  const xrayCountMap = new Map(doctorXrayCounts.map((d) => [d.uploadedById, d._count.id]));

  return NextResponse.json({
    branch: {
      ...base,
      members: base.members.map((m) => ({
        ...m,
        patientCount: patientCountMap.get(m.userId) ?? 0,
        xrayCountThisMonth: xrayCountMap.get(m.userId) ?? 0,
      })),
    },
    stats: {
      doctorCount: branch.members.length,
      patientCount: branch._count.patients,
      todayAppointments: todayAppts,
      weekAppointments: weekAppts,
      completedToday,
      xraysThisMonth,
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

  const { branchId } = await params;

  // Check branch exists
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  // Check caller is OWNER or ADMIN
  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId } },
  });

  if (!membership || membership.role === "DOCTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // Validation
  if (body.name !== undefined && (!body.name || typeof body.name !== "string" || !body.name.trim())) {
    return NextResponse.json({ error: "Branch name cannot be empty" }, { status: 400 });
  }
  if (body.email !== undefined && body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }
  if (body.phone !== undefined && body.phone) {
    const digits = body.phone.replace(/[^\d]/g, "");
    if (digits.length < 7) {
      return NextResponse.json({ error: "Invalid phone number — must have at least 7 digits" }, { status: 400 });
    }
  }
  if (body.billingContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.billingContactEmail)) {
    return NextResponse.json({ error: "Invalid billing contact email format" }, { status: 400 });
  }
  if (body.website && !/^https?:\/\/.+/.test(body.website)) {
    return NextResponse.json({ error: "Website must start with http:// or https://" }, { status: 400 });
  }

  // Build update object — string fields
  const stringFields = [
    "name", "address", "city", "state", "zip", "phone", "email",
    "ownerName", "licenseNumber", "operatingHours", "clinicType",
    "website", "insuranceProviders", "specialties",
    "billingContactName", "billingContactEmail", "billingContactPhone",
  ] as const;

  const updateData: Record<string, unknown> = {};
  for (const field of stringFields) {
    if (body[field] !== undefined) {
      updateData[field] = typeof body[field] === "string" ? body[field].trim() || null : null;
    }
  }

  // treatmentRooms — integer
  if (body.treatmentRooms !== undefined) {
    if (body.treatmentRooms === null || body.treatmentRooms === "") {
      updateData.treatmentRooms = null;
    } else {
      const rooms = typeof body.treatmentRooms === "string"
        ? parseInt(body.treatmentRooms, 10)
        : body.treatmentRooms;
      if (isNaN(rooms) || rooms < 0) {
        return NextResponse.json({ error: "Treatment rooms must be a positive number" }, { status: 400 });
      }
      updateData.treatmentRooms = rooms;
    }
  }

  const updated = await prisma.branch.update({
    where: { id: branchId },
    data: updateData,
  });

  return NextResponse.json({
    branch: {
      id: updated.id,
      name: updated.name,
      address: updated.address,
      city: updated.city,
      state: updated.state,
      zip: updated.zip,
      phone: updated.phone,
      email: updated.email,
      website: updated.website,
      operatingHours: updated.operatingHours,
      treatmentRooms: updated.treatmentRooms,
      clinicType: updated.clinicType,
      ownerName: updated.ownerName,
      licenseNumber: updated.licenseNumber,
      specialties: updated.specialties,
      insuranceProviders: updated.insuranceProviders,
      billingContactName: updated.billingContactName,
      billingContactEmail: updated.billingContactEmail,
      billingContactPhone: updated.billingContactPhone,
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

  const { branchId } = await params;

  // Check branch exists
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  // Check caller is OWNER
  const membership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId } },
  });

  if (!membership || membership.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.branch.delete({ where: { id: branchId } });

  return NextResponse.json({ success: true });
}
