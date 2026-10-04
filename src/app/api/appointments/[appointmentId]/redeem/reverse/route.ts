import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { loadRedeemAccess } from "@/lib/package-access";
import { reverseRedemption } from "@/lib/package-service";
import { paywall } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ appointmentId: string }> };

/** Undo the appointment's package session (the "Undo" next to "Package: 5 of 12 used"). */
export async function POST(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { appointmentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Sign in required." }, { status: 401 });
  const blocked = await paywall(user.id);
  if (blocked) return blocked;

  const access = await loadRedeemAccess(user.id, appointmentId);
  if (access !== "ok") return access;

  const reversed = await reverseRedemption({
    appointmentId,
    actor: { id: user.id, email: user.email ?? "unknown", name: user.name ?? null },
  });
  if (!reversed) {
    return NextResponse.json(
      { error: "not_redeemed", message: "No package session is used for this appointment." },
      { status: 404 },
    );
  }
  return NextResponse.json({ reversed });
}
