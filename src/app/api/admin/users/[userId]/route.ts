import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/subscription";

/**
 * PATCH /api/admin/users/[userId] — super admins only (SUPER_ADMIN_EMAILS).
 * Body (all optional): { aiDailyLimit: 0-1000, trialEndsAt: ISO date | null, disabled: boolean }.
 * 404 for everyone else, so the route doesn't advertise itself.
 */

const BodySchema = z
  .object({
    aiDailyLimit: z.number().int().min(0).max(1000).optional(),
    trialEndsAt: z.iso.datetime().nullable().optional(),
    disabled: z.boolean().optional(),
  })
  .strict();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user?.id || !isSuperAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { userId } = await params;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }
  const { aiDailyLimit, trialEndsAt, disabled } = parsed.data;
  if (disabled && userId === session.user.id) {
    return NextResponse.json({ error: "You can't disable your own account." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(aiDailyLimit !== undefined && { aiDailyLimit }),
      ...(trialEndsAt !== undefined && { trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null }),
      ...(disabled !== undefined && { disabledAt: disabled ? new Date() : null }),
    },
    select: { id: true, aiDailyLimit: true, trialEndsAt: true, disabledAt: true },
  });
  return NextResponse.json(user);
}
