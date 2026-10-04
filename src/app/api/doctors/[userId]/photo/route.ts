import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageDoctorEverywhere } from "@/lib/auth/doctor-access";
import { uploadToR2, getR2PublicUrl, deleteR2Object, r2KeyFromUrl } from "@/lib/r2";
import { paywall } from "@/lib/paywall";

type RouteContext = { params: Promise<{ userId: string }> };

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// ─── POST /api/doctors/[userId]/photo ───
export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const blocked = await paywall(session.user.id);
  if (blocked) return blocked;

  const { userId } = await params;

  // Target must exist
  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Authorization: self, or someone who manages every branch the doctor works in
  if (!(await canManageDoctorEverywhere(session.user.id, userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    // A new key each time: the same URL would keep showing the cached old photo.
    const key = `doctors/${userId}/photo-${Date.now()}.${ext}`;

    // Upload new photo
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadToR2(key, buffer, file.type);
    const imageUrl = getR2PublicUrl(key);

    // Update User.image
    await prisma.user.update({
      where: { id: userId },
      data: { image: imageUrl },
    });

    // Then remove the previous custom photo (not a Google one); only after the
    // new one is in place, so a failed upload never leaves no photo.
    const oldKey = targetUser.image ? r2KeyFromUrl(targetUser.image) : null;
    if (oldKey && oldKey !== key) {
      await deleteR2Object(oldKey).catch(() => {
        // Non-critical: old photo cleanup failure
      });
    }

    return NextResponse.json({ imageUrl }, { status: 200 });
  } catch (error) {
    console.error("POST /api/doctors/[userId]/photo error:", error);
    return NextResponse.json(
      { error: "Failed to upload photo" },
      { status: 500 }
    );
  }
}
