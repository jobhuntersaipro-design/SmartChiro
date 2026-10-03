import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripeClient, stripeId, syncCustomer } from "@/lib/stripe";

/**
 * POST /api/billing/webhook — Stripe events (signed with STRIPE_WEBHOOK_SECRET).
 * Subscribe the endpoint to checkout.session.completed and
 * customer.subscription.created / updated / deleted. Each event re-reads all
 * of the customer's subscriptions from Stripe, so events arriving out of
 * order, or about an older subscription, can't roll a user back.
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

  let customerId: string | null = null;
  let userId: string | null = null;
  if (event.type === "checkout.session.completed") {
    customerId = stripeId(event.data.object.customer);
    userId = event.data.object.client_reference_id;
  } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
    const subscription = event.data.object as Stripe.Subscription;
    customerId = stripeId(subscription.customer);
    userId = subscription.metadata?.userId ?? null;
  }
  if (!customerId) return NextResponse.json({ received: true });

  try {
    await syncCustomer(stripe, customerId, userId);
  } catch (err) {
    console.error("[billing] webhook sync failed:", event.type, err);
    // 500 so Stripe retries.
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
