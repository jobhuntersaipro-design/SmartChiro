import { NextResponse } from "next/server";
import { z } from "zod";
import { branchAccess, toPublicAccount } from "@/lib/whatsapp/account";
import { connectAccount, connectErrorResponse } from "@/lib/whatsapp/onboarding";
import { paywallCurrentUser } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ branchId: string }> };

const Body = z.object({
  wabaId: z.string().trim().regex(/^\d+$/),
  phoneNumberId: z.string().trim().regex(/^\d+$/),
  accessToken: z.string().trim().min(20).max(1000),
});

/** Connects with IDs + a token from Meta's dashboard (test number, BSP, etc.). */
export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const blocked = await paywallCurrentUser();
  if (blocked) return blocked;
  const { branchId } = await ctx.params;
  const access = await branchAccess(branchId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", message: "WABA ID and phone number ID must be numbers, and the token is required." },
      { status: 422 },
    );
  }

  try {
    const account = await connectAccount({
      branchId,
      userId: access.userId,
      wabaId: parsed.data.wabaId,
      phoneNumberId: parsed.data.phoneNumberId,
      token: parsed.data.accessToken,
      type: "MANUAL",
    });
    return NextResponse.json({ account: toPublicAccount(account) });
  } catch (e) {
    const r = connectErrorResponse(e);
    return NextResponse.json(r.body, { status: r.status });
  }
}
