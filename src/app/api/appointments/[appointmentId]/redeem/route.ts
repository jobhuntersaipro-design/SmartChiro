import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-utils";
import { loadRedeemAccess } from "@/lib/package-access";
import { REDEEM_ERROR_STATUS, redeemAppointment } from "@/lib/package-service";
import { paywall } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ appointmentId: string }> };

const Body = z.object({ patientPackageId: z.string().min(1).optional() }).strict();

/**
 * Pay for an appointment with one package session. Without `patientPackageId`
 * the earliest-expiring eligible package is used; 409 `no_package` when none fits.
 */
export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const { appointmentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Sign in required." }, { status: 401 });
  const blocked = await paywall(user.id);
  if (blocked) return blocked;

  const access = await loadRedeemAccess(user.id, appointmentId);
  if (access !== "ok") return access;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", message: "Invalid package.", details: parsed.error.flatten() }, { status: 422 });
  }

  const result = await redeemAppointment({
    appointmentId,
    patientPackageId: parsed.data.patientPackageId,
    actor: { id: user.id, email: user.email ?? "unknown", name: user.name ?? null },
  });
  if (!result.ok) {
    const { status, message } = REDEEM_ERROR_STATUS[result.error];
    return NextResponse.json({ error: result.error, message, ...(result.reason ? { reason: result.reason } : {}) }, { status });
  }
  return NextResponse.json({ redemption: result.redemption }, { status: 201 });
}
