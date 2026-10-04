import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasOpenSubscription, priceIdFor, stripeClient } from "@/lib/stripe";
import { isPaidStatus } from "@/lib/plans";
import { accountAccess } from "@/lib/subscription";

/**
 * POST /api/billing/checkout { interval: "month" | "year" } → { url }
 *
 * Starts a Stripe Checkout for SmartChiro Pro. Days left in the free trial
 * carry over: the subscription's first charge waits until the trial ends.
 */

const BodySchema = z.object({ interval: z.enum(["month", "year"]) });

/** Stripe needs a trial end at least 48 h ahead; shorter remainders start billing now. */
const MIN_TRIAL_CARRY_MS = 49 * 3600_000;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "interval must be month or year" }, { status: 400 });

  const stripe = stripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "Online payment isn't set up yet. Please contact SmartChiro." }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, stripeCustomerId: true, subscriptionStatus: true, trialEndsAt: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isPaidStatus(user.subscriptionStatus)) {
    return NextResponse.json({ error: "You already have a subscription. Use Manage billing to change it." }, { status: 409 });
  }
  const access = await accountAccess(user.id);
  if (access?.superAdmin || access?.coveredBy) {
    return NextResponse.json({ error: "Your clinic's plan already covers you. There's nothing to pay." }, { status: 409 });
  }

  try {
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      // Idempotent: two checkouts started together get the same customer.
      const customer = await stripe.customers.create(
        { email: user.email, name: user.name ?? undefined, metadata: { userId: user.id } },
        { idempotencyKey: `customer-${user.id}` },
      );
      customerId = customer.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    } else if (await hasOpenSubscription(stripe, customerId)) {
      // Our copy can lag Stripe (a second tab, a slow webhook): never start a second subscription.
      return NextResponse.json({ error: "You already have a subscription. Use Manage billing to change it." }, { status: 409 });
    }

    // Only one checkout can be open (a session lives 24 hours): expire older
    // ones so two tabs can't both complete and start two subscriptions.
    const open = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 20 });
    await Promise.all(open.data.map((s) => stripe.checkout.sessions.expire(s.id).catch(() => null)));

    const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const trialLeft = user.trialEndsAt ? user.trialEndsAt.getTime() - Date.now() : 0;
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: await priceIdFor(stripe, parsed.data.interval), quantity: 1 }],
      subscription_data: {
        metadata: { userId: user.id },
        ...(trialLeft >= MIN_TRIAL_CARRY_MS ? { trial_end: Math.floor(user.trialEndsAt!.getTime() / 1000) } : {}),
      },
      success_url: `${origin}/api/billing/confirm?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/billing`,
    });
    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    console.error("[billing] checkout failed:", err);
    return NextResponse.json({ error: "Couldn't start the payment. Please try again." }, { status: 502 });
  }
}
