import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadToR2, getR2PublicUrl, deleteR2Object } from "@/lib/r2";

type RouteContext = { params: Promise<{ userId: string }> };

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// ─── POST /api/doctors/[userId]/photo ───
export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  // Target must exist
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { branchMemberships: { select: { branchId: true } } },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Authorization: must be self, or OWNER/ADMIN of a shared branch
  const isSelf = session.user.id === userId;
  if (!isSelf) {
    const callerMemberships = await prisma.branchMember.findMany({
      where: { userId: session.user.id },
      select: { branchId: true, role: true },
    });
    const targetBranchIds = new Set(
      targetUser.branchMemberships.map((m) => m.branchId)
    );
    const isOwnerOrAdmin = callerMemberships.some(
      (m) =>
        targetBranchIds.has(m.branchId) &&
        (m.role === "OWNER" || m.role === "ADMIN")
    );
    if (!isOwnerOrAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const formData = await req.formData();
    const file = formData.get("photo");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No photo file provided" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB" },
        { status: 413 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, WebP" },
        { status: 400 }
      );
    }

    // Determine extension
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = `doctors/${userId}/photo.${ext}`;

    // Delete previous custom photo from R2 (skip Google OAuth URLs)
    if (
      targetUser.image &&
      !targetUser.image.includes("googleusercontent.com") &&
      !targetUser.image.includes("google.com")
    ) {
      try {
        const publicUrl = process.env.R2_PUBLIC_URL!;
        if (targetUser.image.startsWith(publicUrl)) {
          const oldKey = targetUser.image.replace(`${publicUrl}/`, "");
          await deleteR2Object(oldKey);
        }
      } catch {
        // Non-critical: old photo cleanup failure
      }
    }

    // Upload new photo
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadToR2(key, buffer, file.type);
    const imageUrl = getR2PublicUrl(key);

    // Update User.image
    await prisma.user.update({
      where: { id: userId },
      data: { image: imageUrl },
    });

    return NextResponse.json({ imageUrl }, { status: 200 });
  } catch (error) {
    console.error("POST /api/doctors/[userId]/photo error:", error);
    return NextResponse.json(
      { error: "Failed to upload photo" },
      { status: 500 }
    );
  }
}
