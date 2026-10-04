import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageDoctorEverywhere } from "@/lib/auth/doctor-access";
import { paywall } from "@/lib/paywall";

type RouteContext = { params: Promise<{ userId: string }> };

// ─── PATCH /api/doctors/[userId]/status ───
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const blocked = await paywall(session.user.id);
  if (blocked) return blocked;

  const { userId } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.isActive !== "boolean") {
    return NextResponse.json(
      { error: "isActive must be a boolean" },
      { status: 400 }
    );
  }

  // Nobody deactivates themselves, but anyone may switch themselves back on.
  const isSelf = session.user.id === userId;
  if (isSelf && !body.isActive) {
    return NextResponse.json(
      { error: "Cannot deactivate yourself" },
      { status: 403 }
    );
  }

  // Target must exist
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, doctorProfile: { select: { id: true } }, branchMemberships: { select: { role: true } } },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Caller must manage every branch the doctor works in
  if (!isSelf && !(await canManageDoctorEverywhere(session.user.id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Office staff (admins and front desk without a doctor profile) have no
  // active status; making one would turn them into a bookable clinician.
  const clinicianRole = targetUser.branchMemberships.some((m) => m.role === "DOCTOR" || m.role === "OWNER");
  if (!targetUser.doctorProfile && !clinicianRole) {
    return NextResponse.json({ error: "Only clinicians have an active status" }, { status: 409 });
  }

  try {
    const profile = await prisma.doctorProfile.upsert({
      where: { userId },
      create: { userId, isActive: body.isActive },
      update: { isActive: body.isActive },
    });

    return NextResponse.json({ isActive: profile.isActive }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/doctors/[userId]/status error:", error);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}
