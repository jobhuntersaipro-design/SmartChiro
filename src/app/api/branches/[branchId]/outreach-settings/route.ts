import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { can } from "@/lib/permissions";
import { DEFAULT_TEMPLATES } from "@/lib/reminders/default-templates";
import { DEFAULT_OUTREACH_SETTINGS } from "@/lib/outreach/rules";
import type { OutreachSettingsData } from "@/types/outreach";

type RouteCtx = { params: Promise<{ branchId: string }> };

const Body = z.object({
  recallEnabled: z.boolean(),
  recallAfterDays: z.number().int().min(7).max(730),
  recallCooldownDays: z.number().int().min(7).max(730),
  recallDailyLimit: z.number().int().min(1).max(500),
  reviewEnabled: z.boolean(),
  reviewDelayHours: z.number().int().min(1).max(72),
  reviewCooldownDays: z.number().int().min(1).max(730),
  googleReviewUrl: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https:\/\/\S+$/.test(v), "Must be an https:// link"),
});

function pick(s: OutreachSettingsData): OutreachSettingsData {
  return {
    recallEnabled: s.recallEnabled,
    recallAfterDays: s.recallAfterDays,
    recallCooldownDays: s.recallCooldownDays,
    recallDailyLimit: s.recallDailyLimit,
    reviewEnabled: s.reviewEnabled,
    reviewDelayHours: s.reviewDelayHours,
    reviewCooldownDays: s.reviewCooldownDays,
    googleReviewUrl: s.googleReviewUrl,
  };
}

async function access(branchId: string) {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false as const, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const role = await getUserBranchRole(user.id, branchId);
  // Branch settings: OWNER/ADMIN only (same gate as reminders).
  if (!can(role, "reminders.manage")) {
    return { ok: false as const, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true as const };
}

/** Recall + review request settings for the branch (defaults when never saved). */
export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const a = await access(branchId);
  if (!a.ok) return a.res;
  const row = await prisma.branchReminderSettings.findUnique({ where: { branchId } });
  return NextResponse.json({ settings: pick(row ?? DEFAULT_OUTREACH_SETTINGS) });
}

export async function PUT(req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const a = await access(branchId);
  if (!a.ok) return a.res;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: "validation", message: first ? `${first.path.join(".")}: ${first.message}` : "Invalid settings" },
      { status: 422 },
    );
  }
  const data = parsed.data;
  if (data.reviewEnabled && !data.googleReviewUrl) {
    return NextResponse.json(
      { error: "validation", message: "Add the Google review link before turning on review requests." },
      { status: 422 },
    );
  }

  // Reminder fields keep their defaults when the row doesn't exist yet.
  const row = await prisma.branchReminderSettings.upsert({
    where: { branchId },
    create: { branchId, enabled: false, offsetsMin: [1440, 120], templates: DEFAULT_TEMPLATES, ...data },
    update: data,
  });
  return NextResponse.json({ settings: pick(row) });
}
