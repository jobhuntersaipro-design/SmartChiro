import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { isPaidStatus, PLANS, type PlanInterval } from "@/lib/plans";

/**
 * Stripe for SmartChiro Pro. Needs STRIPE_SECRET_KEY (and
 * STRIPE_WEBHOOK_SECRET for the webhook). The product and its two MYR prices
 * are created in the Stripe account on first checkout and found again by
 * lookup key, so nothing has to be set up in the Stripe dashboard first.
 */

const PRODUCT_ID = "smartchiro_pro";

let client: Stripe | null = null;

export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key);
  return client;
}

export async function priceIdFor(stripe: Stripe, interval: PlanInterval): Promise<string> {
  const plan = PLANS[interval];
  const found = await stripe.prices.list({ lookup_keys: [plan.lookupKey], active: true, limit: 1 });
  if (found.data[0]) return found.data[0].id;

  try {
    await stripe.products.retrieve(PRODUCT_ID);
  } catch {
    await stripe.products.create({
      id: PRODUCT_ID,
      name: "SmartChiro Pro",
      description: "Every SmartChiro feature: patients, X-ray annotation and AI analysis, scheduling, billing.",
    });
  }
  const price = await stripe.prices.create({
    product: PRODUCT_ID,
    currency: "myr",
    unit_amount: plan.amount * 100,
    recurring: { interval },
    lookup_key: plan.lookupKey,
    nickname: `SmartChiro Pro ${plan.label}`,
  });
  return price.id;
}

/** Copy a subscription's state onto its user (found by Stripe customer, else metadata.userId). */
export async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const item = subscription.items.data[0];
  const data = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    subscriptionInterval: item?.price.recurring?.interval ?? null,
    subscriptionPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
    isPro: isPaidStatus(subscription.status),
  };
  const byCustomer = await prisma.user.updateMany({ where: { stripeCustomerId: customerId }, data });
  const userId = subscription.metadata?.userId;
  if (byCustomer.count === 0 && userId) {
    await prisma.user.updateMany({ where: { id: userId }, data });
  }
}

/**
 * Back from Checkout (success_url carries the session id): sync the new
 * subscription straight away instead of waiting for the webhook. Only the
 * user who started the checkout can confirm it.
 */
export async function confirmCheckout(userId: string, checkoutSessionId: string): Promise<boolean> {
  const stripe = stripeClient();
  if (!stripe || !checkoutSessionId.startsWith("cs_")) return false;
  try {
    const checkout = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    if (checkout.client_reference_id !== userId || !checkout.subscription) return false;
    const id = typeof checkout.subscription === "string" ? checkout.subscription : checkout.subscription.id;
    await syncSubscription(await stripe.subscriptions.retrieve(id));
    return true;
  } catch (err) {
    console.error("[billing] confirming checkout failed:", err);
    return false;
  }
}
