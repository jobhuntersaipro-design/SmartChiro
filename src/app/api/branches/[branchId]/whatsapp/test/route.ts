import { NextResponse } from "next/server";
import { z } from "zod";
import { branchAccess } from "@/lib/whatsapp/account";
import { sendReminderTemplate } from "@/lib/whatsapp/send";
import { SAMPLE_TEMPLATE_PARAMS } from "@/lib/whatsapp/templates";

type RouteCtx = { params: Promise<{ branchId: string }> };

const Body = z.object({
  to: z.string().trim().min(7).max(20),
  lang: z.enum(["en", "ms", "zh"]).default("en"),
});

/** Sends the reminder template with sample values so owners can check delivery. */
export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const access = await branchAccess(branchId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", message: "Enter a phone number." }, { status: 422 });

  const result = await sendReminderTemplate({
    branchId,
    to: parsed.data.to,
    lang: parsed.data.lang,
    params: SAMPLE_TEMPLATE_PARAMS,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.code, message: result.message }, { status: 422 });
  }
  return NextResponse.json({ ok: true, msgId: result.msgId, lang: result.lang });
}
