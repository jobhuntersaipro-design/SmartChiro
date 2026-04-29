import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { ALLOWED_OFFSETS_MIN, type Templates } from "@/types/reminder";
import { DEFAULT_TEMPLATES } from "@/lib/reminders/default-templates";
import { validateTemplate } from "@/lib/reminders/templates";

type RouteCtx = { params: Promise<{ branchId: string }> };

const StringTpl = z.string().max(8000);

const Body = z.object({
  enabled: z.boolean(),
  offsetsMin: z
    .array(
      z
        .number()
        .int()
        .refine((n) => (ALLOWED_OFFSETS_MIN as readonly number[]).includes(n))
    )
    .min(1),
  templates: z.object({
    whatsapp: z.object({ en: StringTpl, ms: StringTpl }).partial().optional(),
    email: z
      .object({ en: StringTpl, ms: StringTpl, htmlEn: StringTpl, htmlMs: StringTpl })
      .partial()
      .optional(),
  }),
});

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [settings, waSession] = await Promise.all([
    prisma.branchReminderSettings.findUnique({ where: { branchId } }),
    prisma.waSession.findUnique({ where: { branchId } }),
  ]);

  const fallback = {
    branchId,
    enabled: false,
    offsetsMin: [1440, 120],
    templates: DEFAULT_TEMPLATES,
  };

  return NextResponse.json({
    settings: settings ?? fallback,
    waSession: waSession ?? null,
    role,
  });
}

export async function PUT(req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const data = parsed.data;

  const tpls: Array<string | undefined> = [
    data.templates.whatsapp?.en,
    data.templates.whatsapp?.ms,
    data.templates.email?.en,
    data.templates.email?.ms,
    data.templates.email?.htmlEn,
    data.templates.email?.htmlMs,
  ];
  for (const tpl of tpls) {
    if (tpl && tpl.length > 0) {
      const v = validateTemplate(tpl);
      if (!v.ok) {
        return NextResponse.json(
          { error: "validation", message: v.message },
          { status: 422 }
        );
      }
    }
  }

  const merged: Templates = {
    whatsapp: {
      en: data.templates.whatsapp?.en ?? DEFAULT_TEMPLATES.whatsapp.en,
      ms: data.templates.whatsapp?.ms ?? DEFAULT_TEMPLATES.whatsapp.ms,
    },
    email: {
      en: data.templates.email?.en ?? DEFAULT_TEMPLATES.email.en,
      ms: data.templates.email?.ms ?? DEFAULT_TEMPLATES.email.ms,
      htmlEn: data.templates.email?.htmlEn ?? DEFAULT_TEMPLATES.email.htmlEn,
      htmlMs: data.templates.email?.htmlMs ?? DEFAULT_TEMPLATES.email.htmlMs,
    },
  };

  const row = await prisma.branchReminderSettings.upsert({
    where: { branchId },
    create: {
      branchId,
      enabled: data.enabled,
      offsetsMin: data.offsetsMin,
      templates: merged,
    },
    update: {
      enabled: data.enabled,
      offsetsMin: data.offsetsMin,
      templates: merged,
    },
  });
  return NextResponse.json({ settings: row });
}
