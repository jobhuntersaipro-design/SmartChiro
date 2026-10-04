import { NextResponse } from "next/server";
import { z } from "zod";
import { branchAccess, toPublicAccount } from "@/lib/whatsapp/account";
import { signupConfig } from "@/lib/whatsapp/config";
import { connectAccount, connectErrorResponse, exchangeCode } from "@/lib/whatsapp/onboarding";
import { paywallCurrentUser } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ branchId: string }> };

const Body = z.object({
  code: z.string().min(1).max(2000),
  wabaId: z.string().regex(/^\d+$/),
  phoneNumberId: z.string().regex(/^\d+$/).nullable(),
  flow: z.enum(["coexistence", "new"]),
});

/** Completes Embedded Signup: the browser posts the code + session info. */
export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const blocked = await paywallCurrentUser();
  if (blocked) return blocked;
  const { branchId } = await ctx.params;
  const access = await branchAccess(branchId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!signupConfig()) {
    return NextResponse.json(
      { error: "not_configured", message: "Embedded Signup is not configured on this server." },
      { status: 503 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 422 });
  const { code, wabaId, phoneNumberId, flow } = parsed.data;

  try {
    const token = await exchangeCode(code);
    const account = await connectAccount({
      branchId,
      userId: access.userId,
      wabaId,
      phoneNumberId,
      token,
      type: flow === "coexistence" ? "COEXISTENCE" : "EMBEDDED_SIGNUP",
    });
    return NextResponse.json({ account: toPublicAccount(account) });
  } catch (e) {
    const r = connectErrorResponse(e);
    return NextResponse.json(r.body, { status: r.status });
  }
}
