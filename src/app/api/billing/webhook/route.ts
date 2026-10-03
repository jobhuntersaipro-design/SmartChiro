import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripeClient, syncSubscription } from "@/lib/stripe";

/**
 * POST /api/billing/webhook — Stripe events (signed with STRIPE_WEBHOOK_SECRET).
 * Subscribe the endpoint to checkout.session.completed and
 * customer.subscription.created / updated / deleted. Each event re-reads the
 * subscription from Stripe, so events arriving out of order can't roll a
 * user back to an older state.
 */

export const runtime = "nodejs";

const SUBSCRIPTION_EVENTS: ReadonlySet<string> = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function POST(request: NextRequest) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "Billing isn't configured" }, { status: 503 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let subscriptionId: string | null = null;
  if (event.type === "checkout.session.completed") {
    const sub = event.data.object.subscription;
    subscriptionId = typeof sub === "string" ? sub : (sub?.id ?? null);
  } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
    subscriptionId = (event.data.object as Stripe.Subscription).id;
  }
  if (!subscriptionId) return NextResponse.json({ received: true });

  try {
    await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId));
  } catch (err) {
    console.error("[billing] webhook sync failed:", event.type, err);
    // 500 so Stripe retries.
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
