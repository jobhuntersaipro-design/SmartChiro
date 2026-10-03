import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmCheckout } from "@/lib/stripe";

/**
 * GET /api/billing/confirm?session_id=cs_… — Stripe Checkout's success URL.
 * Syncs the new subscription now (the webhook may be slower, or not set up
 * yet), then returns to the plan page. A route, not the page itself, so it
 * also runs for users whose trial has ended (the dashboard shows them the
 * paywall instead of pages).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  const back = new URL("/dashboard/billing", request.nextUrl.origin);
  const checkoutId = request.nextUrl.searchParams.get("session_id");
  if (session?.user?.id && checkoutId) {
    back.searchParams.set((await confirmCheckout(session.user.id, checkoutId)) ? "subscribed" : "pending", "1");
  }
  return NextResponse.redirect(back);
}
