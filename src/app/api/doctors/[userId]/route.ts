import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { DoctorDetail, DoctorProfile, WorkingSchedule } from "@/types/doctor";
import type { BranchRole } from "@prisma/client";

type RouteContext = { params: Promise<{ userId: string }> };

// ─── GET /api/doctors/[userId] ───
export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const includeDetail = req.nextUrl.searchParams.get("include") === "detail";

  // Fetch user with profile and branch memberships
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      doctorProfile: true,
      branchMemberships: {
        include: { branch: { select: { id: true, name: true } } },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Must be a doctor in at least one branch
  if (user.branchMemberships.length === 0) {
    return NextResponse.json(
      { error: "User is not a doctor in any branch" },
      { status: 404 }
    );
  }

  // Caller must share at least one branch with target (or be the target)
  if (session.user.id !== userId) {
    const callerBranches = await prisma.branchMember.findMany({
      where: { userId: session.user.id },
      select: { branchId: true },
    });
    const callerBranchIds = new Set(callerBranches.map((m) => m.branchId));
    const shared = user.branchMemberships.some((m) =>
      callerBranchIds.has(m.branchId)
    );
    if (!shared) {
      return NextResponse.json(
        { error: "Forbidden: no shared branch" },
        { status: 403 }
      );
    }
  }

  // Get stats
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const statQueries: Promise<number>[] = [
    prisma.patient.count({ where: { doctorId: userId } }),
    prisma.visit.count({ where: { doctorId: userId } }),
    prisma.xray.count({ where: { uploadedById: userId } }),
  ];

  if (includeDetail) {
    statQueries.push(
      prisma.visit.count({
        where: { doctorId: userId, visitDate: { gte: monthStart } },
      })
    );
  }

  const statResults = await Promise.all(statQueries);
  const patientCount = statResults[0];
  const totalVisits = statResults[1];
  const totalXrays = statResults[2];
  const visitsThisMonth = includeDetail ? statResults[3] : undefined;
  const avgVisitsPerPatient = includeDetail && patientCount > 0
    ? Math.round((totalVisits / patientCount) * 10) / 10
    : includeDetail ? 0 : undefined;

  const profile: DoctorProfile | null = user.doctorProfile
    ? {
        licenseNumber: user.doctorProfile.licenseNumber,
        specialties: user.doctorProfile.specialties,
        yearsExperience: user.doctorProfile.yearsExperience,
        education: user.doctorProfile.education,
        workingSchedule: user.doctorProfile.workingSchedule as WorkingSchedule | null,
        treatmentRoom: user.doctorProfile.treatmentRoom,
        consultationFee: user.doctorProfile.consultationFee
          ? Number(user.doctorProfile.consultationFee)
          : null,
        bio: user.doctorProfile.bio,
        languages: user.doctorProfile.languages,
        insurancePlans: user.doctorProfile.insurancePlans,
        isActive: user.doctorProfile.isActive,
      }
    : null;

  const doctor: DoctorDetail = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phoneNumber,
    image: user.image,
    profile,
    branches: user.branchMemberships.map((m) => ({
      id: m.branch.id,
      name: m.branch.name,
      role: m.role,
    })),
    stats: {
      patientCount,
      totalVisits,
      totalXrays,
      ...(includeDetail ? { visitsThisMonth, avgVisitsPerPatient } : {}),
    },
  };

  return NextResponse.json({ doctor }, { status: 200 });
}

// ─── PUT /api/doctors/[userId] ───
export async function PUT(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  // Check target user exists and is a doctor in at least one branch
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      branchMemberships: {
        include: { branch: { select: { id: true, name: true } } },
      },
    },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Authorization: must be self, or OWNER/ADMIN of a shared branch
  const isSelf = session.user.id === userId;
  let isOwnerOrAdmin = false;

  if (!isSelf) {
    const callerMemberships = await prisma.branchMember.findMany({
      where: { userId: session.user.id },
      select: { branchId: true, role: true },
    });
    const targetBranchIds = new Set(
      targetUser.branchMemberships.map((m) => m.branchId)
    );
    isOwnerOrAdmin = callerMemberships.some(
      (m) =>
        targetBranchIds.has(m.branchId) &&
        (m.role === "OWNER" || m.role === "ADMIN")
    );
    if (!isOwnerOrAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await req.json();

  // ─── Validate user fields ───
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) {
      return NextResponse.json(
        { error: "Name must be 1-100 characters" },
        { status: 400 }
      );
    }
  }
  if (body.phone !== undefined && body.phone !== null) {
    if (typeof body.phone !== "string" || body.phone.length > 20) {
      return NextResponse.json(
        { error: "Phone must be max 20 characters" },
        { status: 400 }
      );
    }
  }

  // ─── Validate profile fields ───
  if (body.licenseNumber !== undefined && body.licenseNumber !== null) {
    if (typeof body.licenseNumber !== "string" || body.licenseNumber.length > 50) {
      return NextResponse.json(
        { error: "License number must be max 50 characters" },
        { status: 400 }
      );
    }
  }
  if (body.specialties !== undefined) {
    if (!Array.isArray(body.specialties) || body.specialties.length > 20) {
      return NextResponse.json(
        { error: "Specialties must be an array of max 20 items" },
        { status: 400 }
      );
    }
    for (const s of body.specialties) {
      if (typeof s !== "string" || s.length > 50) {
        return NextResponse.json(
          { error: "Each specialty must be max 50 characters" },
          { status: 400 }
        );
      }
    }
  }
  if (body.yearsExperience !== undefined && body.yearsExperience !== null) {
    if (
      typeof body.yearsExperience !== "number" ||
      !Number.isInteger(body.yearsExperience) ||
      body.yearsExperience < 0 ||
      body.yearsExperience > 70
    ) {
      return NextResponse.json(
        { error: "Years of experience must be an integer 0-70" },
        { status: 400 }
      );
    }
  }
  if (body.education !== undefined && body.education !== null) {
    if (typeof body.education !== "string" || body.education.length > 1000) {
      return NextResponse.json(
        { error: "Education must be max 1000 characters" },
        { status: 400 }
      );
    }
  }
  if (body.workingSchedule !== undefined && body.workingSchedule !== null) {
    const validDays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (typeof body.workingSchedule !== "object" || Array.isArray(body.workingSchedule)) {
      return NextResponse.json(
        { error: "Working schedule must be an object" },
        { status: 400 }
      );
    }
    for (const [day, val] of Object.entries(body.workingSchedule)) {
      if (!validDays.includes(day)) {
        return NextResponse.json(
          { error: `Invalid day key: ${day}` },
          { status: 400 }
        );
      }
      if (val !== null && val !== undefined) {
        const slot = val as { start?: string; end?: string };
        if (
          typeof slot.start !== "string" ||
          typeof slot.end !== "string" ||
          !timeRegex.test(slot.start) ||
          !timeRegex.test(slot.end)
        ) {
          return NextResponse.json(
            { error: `Invalid time format for ${day}. Use HH:MM` },
            { status: 400 }
          );
        }
      }
    }
  }
  if (body.treatmentRoom !== undefined && body.treatmentRoom !== null) {
    if (typeof body.treatmentRoom !== "string" || body.treatmentRoom.length > 100) {
      return NextResponse.json(
        { error: "Treatment room must be max 100 characters" },
        { status: 400 }
      );
    }
  }
  if (body.consultationFee !== undefined && body.consultationFee !== null) {
    if (
      typeof body.consultationFee !== "number" ||
      body.consultationFee < 0 ||
      body.consultationFee > 99999.99
    ) {
      return NextResponse.json(
        { error: "Consultation fee must be 0-99999.99" },
        { status: 400 }
      );
    }
  }
  if (body.bio !== undefined && body.bio !== null) {
    if (typeof body.bio !== "string" || body.bio.length > 2000) {
      return NextResponse.json(
        { error: "Bio must be max 2000 characters" },
        { status: 400 }
      );
    }
  }
  if (body.languages !== undefined) {
    if (!Array.isArray(body.languages) || body.languages.length > 20) {
      return NextResponse.json(
        { error: "Languages must be an array of max 20 items" },
        { status: 400 }
      );
    }
    for (const l of body.languages) {
      if (typeof l !== "string" || l.length > 50) {
        return NextResponse.json(
          { error: "Each language must be max 50 characters" },
          { status: 400 }
        );
      }
    }
  }
  if (body.insurancePlans !== undefined) {
    if (!Array.isArray(body.insurancePlans) || body.insurancePlans.length > 50) {
      return NextResponse.json(
        { error: "Insurance plans must be an array of max 50 items" },
        { status: 400 }
      );
    }
    for (const p of body.insurancePlans) {
      if (typeof p !== "string" || p.length > 100) {
        return NextResponse.json(
          { error: "Each insurance plan must be max 100 characters" },
          { status: 400 }
        );
      }
    }
  }
  // isActive — only OWNER/ADMIN can set
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json(
        { error: "isActive must be a boolean" },
        { status: 400 }
      );
    }
    if (!isOwnerOrAdmin) {
      return NextResponse.json(
        { error: "Only branch owner or admin can change active status" },
        { status: 403 }
      );
    }
  }

  try {
    // Build profile data (only include fields that were sent)
    const profileData: Record<string, unknown> = {};
    const profileFields = [
      "licenseNumber",
      "specialties",
      "yearsExperience",
      "education",
      "workingSchedule",
      "treatmentRoom",
      "consultationFee",
      "bio",
      "languages",
      "insurancePlans",
      "isActive",
    ];
    for (const field of profileFields) {
      if (body[field] !== undefined) {
        profileData[field] = body[field];
      }
    }

    // Build user data
    const userData: Record<string, unknown> = {};
    if (body.name !== undefined) userData.name = body.name.trim();
    if (body.phone !== undefined) userData.phoneNumber = body.phone;

    // Transaction: update user + upsert profile
    await prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data: userData,
        });
      }
      if (Object.keys(profileData).length > 0) {
        await tx.doctorProfile.upsert({
          where: { userId },
          create: { userId, ...profileData },
          update: profileData,
        });
      }
    });

    // Re-fetch for response
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        doctorProfile: true,
        branchMemberships: {
          include: { branch: { select: { id: true, name: true } } },
        },
      },
    });

    const [patientCount, totalVisits, totalXrays] = await Promise.all([
      prisma.patient.count({ where: { doctorId: userId } }),
      prisma.visit.count({ where: { doctorId: userId } }),
      prisma.xray.count({ where: { uploadedById: userId } }),
    ]);

    const profile: DoctorProfile | null = updatedUser!.doctorProfile
      ? {
          licenseNumber: updatedUser!.doctorProfile.licenseNumber,
          specialties: updatedUser!.doctorProfile.specialties,
          yearsExperience: updatedUser!.doctorProfile.yearsExperience,
          education: updatedUser!.doctorProfile.education,
          workingSchedule: updatedUser!.doctorProfile.workingSchedule as WorkingSchedule | null,
          treatmentRoom: updatedUser!.doctorProfile.treatmentRoom,
          consultationFee: updatedUser!.doctorProfile.consultationFee
            ? Number(updatedUser!.doctorProfile.consultationFee)
            : null,
          bio: updatedUser!.doctorProfile.bio,
          languages: updatedUser!.doctorProfile.languages,
          insurancePlans: updatedUser!.doctorProfile.insurancePlans,
          isActive: updatedUser!.doctorProfile.isActive,
        }
      : null;

    const doctor: DoctorDetail = {
      id: updatedUser!.id,
      name: updatedUser!.name,
      email: updatedUser!.email,
      phone: updatedUser!.phoneNumber,
      image: updatedUser!.image,
      profile,
      branches: updatedUser!.branchMemberships.map((m) => ({
        id: m.branch.id,
        name: m.branch.name,
        role: m.role,
      })),
      stats: { patientCount, totalVisits, totalXrays },
    };

    return NextResponse.json({ doctor }, { status: 200 });
  } catch (error) {
    console.error("PUT /api/doctors/[userId] error:", error);
    return NextResponse.json(
      { error: "Failed to update doctor profile" },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/doctors/[userId] ─── Remove doctor from branch(es)
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const { searchParams } = req.nextUrl;
  const branchId = searchParams.get("branchId");

  // Cannot remove self
  if (session.user.id === userId) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 403 });
  }

  // Target user must exist
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      branchMemberships: { select: { id: true, branchId: true, role: true } },
    },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get caller's memberships for auth check
  const callerMemberships = await prisma.branchMember.findMany({
    where: { userId: session.user.id },
    select: { branchId: true, role: true },
  });

  const callerRoleMap = new Map<string, BranchRole>(
    callerMemberships.map((m) => [m.branchId, m.role])
  );

  if (branchId) {
    // Remove from specific branch
    const targetMembership = targetUser.branchMemberships.find(
      (m) => m.branchId === branchId
    );

    if (!targetMembership) {
      return NextResponse.json(
        { error: "User is not a member of this branch" },
        { status: 404 }
      );
    }

    // Cannot remove a branch OWNER
    if (targetMembership.role === "OWNER") {
      return NextResponse.json(
        { error: "Cannot remove branch owner" },
        { status: 403 }
      );
    }

    // Caller must be OWNER or ADMIN of that branch
    const callerRole = callerRoleMap.get(branchId);
    if (!callerRole || (callerRole !== "OWNER" && callerRole !== "ADMIN")) {
      return NextResponse.json(
        { error: "Forbidden: must be branch owner or admin" },
        { status: 403 }
      );
    }

    await prisma.branchMember.delete({ where: { id: targetMembership.id } });

    return NextResponse.json(
      { success: true, removed: "branch" },
      { status: 200 }
    );
  } else {
    // Remove from ALL caller's branches
    const membershipIds: string[] = [];

    for (const m of targetUser.branchMemberships) {
      const callerRole = callerRoleMap.get(m.branchId);
      if (
        callerRole &&
        (callerRole === "OWNER" || callerRole === "ADMIN") &&
        m.role !== "OWNER"
      ) {
        membershipIds.push(m.id);
      }
    }

    if (membershipIds.length === 0) {
      return NextResponse.json(
        { error: "No removable memberships found" },
        { status: 404 }
      );
    }

    await prisma.branchMember.deleteMany({
      where: { id: { in: membershipIds } },
    });

    return NextResponse.json(
      { success: true, removed: "all" },
      { status: 200 }
    );
  }
}
