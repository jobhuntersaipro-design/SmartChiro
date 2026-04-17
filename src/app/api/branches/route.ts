import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeStats = req.nextUrl.searchParams.get("include") === "stats";

  if (!includeStats) {
    // Basic list — backwards compatible
    const memberships = await prisma.branchMember.findMany({
      where: { userId: session.user.id },
      include: {
        branch: {
          include: {
            _count: { select: { members: true, patients: true } },
          },
        },
      },
      orderBy: { branch: { name: "asc" } },
    });

    const branches = memberships.map((m) => ({
      id: m.branch.id,
      name: m.branch.name,
      address: m.branch.address,
      phone: m.branch.phone,
      email: m.branch.email,
      memberCount: m.branch._count.members,
      patientCount: m.branch._count.patients,
      userRole: m.role,
      createdAt: m.branch.createdAt.toISOString(),
    }));

    return NextResponse.json({ branches });
  }

  // With stats: full branch info + doctor list + appointment counts
  const memberships = await prisma.branchMember.findMany({
    where: { userId: session.user.id },
    include: {
      branch: {
        include: {
          _count: { select: { members: true, patients: true } },
          members: {
            include: {
              user: { select: { id: true, name: true, image: true } },
            },
          },
        },
      },
    },
    orderBy: { branch: { name: "asc" } },
  });

  const branchIds = memberships.map((m) => m.branch.id);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

  const [todayCounts, weekCounts] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["branchId"],
      where: { branchId: { in: branchIds }, dateTime: { gte: todayStart, lt: todayEnd } },
      _count: { id: true },
    }),
    prisma.appointment.groupBy({
      by: ["branchId"],
      where: { branchId: { in: branchIds }, dateTime: { gte: weekStart, lt: weekEnd } },
      _count: { id: true },
    }),
  ]);

  const todayMap = new Map(todayCounts.map((a) => [a.branchId, a._count.id]));
  const weekMap = new Map(weekCounts.map((a) => [a.branchId, a._count.id]));

  const branches = memberships.map((m) => {
    const b = m.branch;
    return {
      id: b.id,
      name: b.name,
      address: b.address,
      city: b.city,
      state: b.state,
      zip: b.zip,
      phone: b.phone,
      email: b.email,
      website: b.website,
      operatingHours: b.operatingHours,
      treatmentRooms: b.treatmentRooms,
      clinicType: b.clinicType,
      doctorCount: b._count.members,
      patientCount: b._count.patients,
      todayAppointments: todayMap.get(b.id) ?? 0,
      weekAppointments: weekMap.get(b.id) ?? 0,
      doctors: b.members.map((mem) => ({
        id: mem.user.id,
        name: mem.user.name,
        image: mem.user.image,
      })),
      userRole: m.role,
      createdAt: b.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ branches });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    name, address, city, state, zip, phone, email,
    operatingHours, treatmentRooms,
    website,
    billingContactName, billingContactEmail, billingContactPhone,
  } = body;

  // ─── Required field validation ───
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Clinic name is required" }, { status: 400 });
  }
  if (!phone || typeof phone !== "string" || !phone.trim()) {
    return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
  }
  // Strip non-digit chars (keep +) and check at least 7 digits
  const phoneDigits = phone.replace(/[^\d]/g, "");
  if (phoneDigits.length < 7) {
    return NextResponse.json({ error: "Invalid phone number — must have at least 7 digits" }, { status: 400 });
  }
  if (!email || typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }
  if (!address || typeof address !== "string" || !address.trim()) {
    return NextResponse.json({ error: "Street address is required" }, { status: 400 });
  }
  if (!city || typeof city !== "string" || !city.trim()) {
    return NextResponse.json({ error: "City is required" }, { status: 400 });
  }
  if (!state || typeof state !== "string" || !state.trim()) {
    return NextResponse.json({ error: "State is required" }, { status: 400 });
  }
  if (!zip || typeof zip !== "string" || !zip.trim()) {
    return NextResponse.json({ error: "ZIP code is required" }, { status: 400 });
  }

  // ─── Optional field validation ───
  if (billingContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingContactEmail)) {
    return NextResponse.json({ error: "Invalid billing contact email format" }, { status: 400 });
  }
  if (website && !/^https?:\/\/.+/.test(website)) {
    return NextResponse.json({ error: "Website must start with http:// or https://" }, { status: 400 });
  }
  if (treatmentRooms !== undefined && treatmentRooms !== null && treatmentRooms !== "") {
    const rooms = typeof treatmentRooms === "string" ? parseInt(treatmentRooms, 10) : treatmentRooms;
    if (isNaN(rooms) || rooms < 0) {
      return NextResponse.json({ error: "Treatment rooms must be a positive number" }, { status: 400 });
    }
  }
  if (billingContactPhone) {
    const billingPhoneDigits = billingContactPhone.replace(/[^\d]/g, "");
    if (billingPhoneDigits.length < 7) {
      return NextResponse.json({ error: "Invalid billing phone number — must have at least 7 digits" }, { status: 400 });
    }
  }

  const userId = session.user.id;

  try {
    // Auto-set ownerName from session user
    const sessionUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    const branch = await prisma.branch.create({
      data: {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        zip: zip.trim(),
        phone: phone.trim(),
        email: email.trim(),
        ownerName: sessionUser?.name || null,
        operatingHours: operatingHours?.trim() || null,
        treatmentRooms: treatmentRooms ? (typeof treatmentRooms === "string" ? parseInt(treatmentRooms, 10) || null : treatmentRooms) : null,
        website: website?.trim() || null,
        billingContactName: billingContactName?.trim() || null,
        billingContactEmail: billingContactEmail?.trim() || null,
        billingContactPhone: billingContactPhone?.trim() || null,
        members: {
          create: {
            userId,
            role: "OWNER",
          },
        },
      },
    });

    // Set as active branch if user doesn't have one
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { activeBranchId: true },
    });

    if (!user?.activeBranchId) {
      await prisma.user.update({
        where: { id: userId },
        data: { activeBranchId: branch.id },
      });
    }

    return NextResponse.json({ branch }, { status: 201 });
  } catch (error) {
    console.error("POST /api/branches error:", error);
    return NextResponse.json({ error: "Failed to create clinic." }, { status: 500 });
  }
}
