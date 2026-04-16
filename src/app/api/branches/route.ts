import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
