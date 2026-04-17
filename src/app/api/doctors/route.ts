import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import type { DoctorListItem } from "@/types/doctor";

// ─── GET /api/doctors ─── List all doctors across caller's branches
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const branchId = searchParams.get("branchId");
  const search = searchParams.get("search");
  const status = searchParams.get("status"); // "active" | "inactive" | "all"

  // 1. Get all caller's branch memberships
  const callerMemberships = await prisma.branchMember.findMany({
    where: { userId: session.user.id },
    select: { branchId: true, role: true },
  });

  if (callerMemberships.length === 0) {
    return NextResponse.json({ doctors: [], total: 0 }, { status: 200 });
  }

  const callerBranchIds = callerMemberships.map((m) => m.branchId);

  // If filtering by specific branch, validate caller has access
  const targetBranchIds = branchId
    ? callerBranchIds.includes(branchId)
      ? [branchId]
      : []
    : callerBranchIds;

  if (targetBranchIds.length === 0) {
    return NextResponse.json({ doctors: [], total: 0 }, { status: 200 });
  }

  // 2. Find all BranchMembers in those branches
  const members = await prisma.branchMember.findMany({
    where: { branchId: { in: targetBranchIds } },
    include: {
      user: {
        include: {
          doctorProfile: {
            select: { specialties: true, isActive: true },
          },
        },
      },
      branch: { select: { id: true, name: true } },
    },
  });

  // 3. Group by user — a doctor can appear in multiple branches
  const doctorMap = new Map<
    string,
    {
      user: (typeof members)[0]["user"];
      branches: { id: string; name: string; role: string; memberId: string }[];
    }
  >();

  for (const m of members) {
    const existing = doctorMap.get(m.userId);
    const branchInfo = {
      id: m.branch.id,
      name: m.branch.name,
      role: m.role,
      memberId: m.id,
    };
    if (existing) {
      existing.branches.push(branchInfo);
    } else {
      doctorMap.set(m.userId, { user: m.user, branches: [branchInfo] });
    }
  }

  // 4. Apply search filter
  let entries = Array.from(doctorMap.values());

  if (search) {
    const q = search.toLowerCase();
    entries = entries.filter(
      (e) =>
        (e.user.name ?? "").toLowerCase().includes(q) ||
        e.user.email.toLowerCase().includes(q)
    );
  }

  // 5. Apply status filter
  if (status === "active") {
    entries = entries.filter(
      (e) => e.user.doctorProfile?.isActive !== false
    );
  } else if (status === "inactive") {
    entries = entries.filter(
      (e) => e.user.doctorProfile?.isActive === false
    );
  }

  // 6. Get stats for all doctors in one batch
  const userIds = entries.map((e) => e.user.id);

  const [patientCounts, visitCounts, xrayCounts] = await Promise.all([
    prisma.patient.groupBy({
      by: ["doctorId"],
      where: { doctorId: { in: userIds } },
      _count: { id: true },
    }),
    prisma.visit.groupBy({
      by: ["doctorId"],
      where: { doctorId: { in: userIds } },
      _count: { id: true },
    }),
    prisma.xray.groupBy({
      by: ["uploadedById"],
      where: { uploadedById: { in: userIds } },
      _count: { id: true },
    }),
  ]);

  const patientMap = new Map(patientCounts.map((p) => [p.doctorId, p._count.id]));
  const visitMap = new Map(visitCounts.map((v) => [v.doctorId, v._count.id]));
  const xrayMap = new Map(xrayCounts.map((x) => [x.uploadedById, x._count.id]));

  // 7. Build response
  const doctors: DoctorListItem[] = entries.map((e) => ({
    id: e.user.id,
    name: e.user.name,
    email: e.user.email,
    phone: e.user.phoneNumber,
    image: e.user.image,
    isActive: e.user.doctorProfile?.isActive !== false,
    specialties: e.user.doctorProfile?.specialties ?? [],
    branches: e.branches.map((b) => ({
      id: b.id,
      name: b.name,
      role: b.role as DoctorListItem["branches"][0]["role"],
      memberId: b.memberId,
    })),
    stats: {
      patientCount: patientMap.get(e.user.id) ?? 0,
      visitCount: visitMap.get(e.user.id) ?? 0,
      xrayCount: xrayMap.get(e.user.id) ?? 0,
    },
    createdAt: e.user.createdAt.toISOString(),
  }));

  return NextResponse.json({ doctors, total: doctors.length }, { status: 200 });
}

// ─── POST /api/doctors ─── Create doctor account
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Validate required fields
  if (!body.name || typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) {
    return NextResponse.json({ error: "Name is required (1-100 chars)" }, { status: 400 });
  }
  if (!body.email || typeof body.email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }
  if (!body.password || typeof body.password !== "string" || body.password.length < 8) {
    return NextResponse.json({ error: "Password is required (min 8 chars)" }, { status: 400 });
  }
  if (!body.branchId || typeof body.branchId !== "string") {
    return NextResponse.json({ error: "Branch is required" }, { status: 400 });
  }

  // Validate role
  const role = body.role ?? "DOCTOR";
  if (!["DOCTOR", "ADMIN"].includes(role)) {
    return NextResponse.json({ error: "Role must be DOCTOR or ADMIN" }, { status: 400 });
  }

  // Caller must be OWNER or ADMIN of the specified branch
  const callerMembership = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId: session.user.id, branchId: body.branchId } },
  });

  if (!callerMembership || (callerMembership.role !== "OWNER" && callerMembership.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden: must be branch owner or admin" }, { status: 403 });
  }

  try {
    // Check if user with this email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
      include: {
        branchMemberships: { where: { branchId: body.branchId } },
      },
    });

    if (existingUser) {
      // Already in this branch
      if (existingUser.branchMemberships.length > 0) {
        return NextResponse.json({ error: "Already a member of this branch" }, { status: 409 });
      }

      // Exists but not in branch — add them
      await prisma.branchMember.create({
        data: {
          userId: existingUser.id,
          branchId: body.branchId,
          role,
        },
      });

      // Return the doctor
      const doctor = await buildDoctorListItem(existingUser.id);
      return NextResponse.json({ doctor, existed: true }, { status: 200 });
    }

    // Create new user + membership + optional profile in transaction
    const passwordHash = await hash(body.password, 12);

    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: body.email.toLowerCase(),
          name: body.name.trim(),
          password: passwordHash,
          phoneNumber: body.phone ?? null,
          emailVerified: new Date(), // owner-created accounts skip verification
        },
      });

      await tx.branchMember.create({
        data: {
          userId: user.id,
          branchId: body.branchId,
          role,
        },
      });

      // Create DoctorProfile if any profile fields provided
      const hasProfileFields =
        body.licenseNumber || body.specialties?.length || body.education || body.yearsExperience;

      if (hasProfileFields) {
        await tx.doctorProfile.create({
          data: {
            userId: user.id,
            licenseNumber: body.licenseNumber ?? null,
            specialties: body.specialties ?? [],
            education: body.education ?? null,
            yearsExperience: body.yearsExperience ?? null,
          },
        });
      }

      return user;
    });

    const doctor = await buildDoctorListItem(newUser.id);
    return NextResponse.json({ doctor }, { status: 201 });
  } catch (error) {
    console.error("POST /api/doctors error:", error);
    return NextResponse.json({ error: "Failed to create doctor" }, { status: 500 });
  }
}

// Helper to build DoctorListItem from userId
async function buildDoctorListItem(userId: string): Promise<DoctorListItem> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      doctorProfile: { select: { specialties: true, isActive: true } },
      branchMemberships: {
        include: { branch: { select: { id: true, name: true } } },
      },
    },
  });

  const [patientCount, visitCount, xrayCount] = await Promise.all([
    prisma.patient.count({ where: { doctorId: userId } }),
    prisma.visit.count({ where: { doctorId: userId } }),
    prisma.xray.count({ where: { uploadedById: userId } }),
  ]);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phoneNumber,
    image: user.image,
    isActive: user.doctorProfile?.isActive !== false,
    specialties: user.doctorProfile?.specialties ?? [],
    branches: user.branchMemberships.map((m) => ({
      id: m.branch.id,
      name: m.branch.name,
      role: m.role,
      memberId: m.id,
    })),
    stats: { patientCount, visitCount, xrayCount },
    createdAt: user.createdAt.toISOString(),
  };
}
