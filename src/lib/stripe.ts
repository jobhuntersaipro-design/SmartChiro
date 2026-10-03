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
  const price = found.data[0];
  if (price && price.unit_amount === plan.amount * 100 && price.currency === "myr" && price.recurring?.interval === interval) {
    return price.id;
  }

  try {
    await stripe.products.retrieve(PRODUCT_ID);
  } catch {
    await stripe.products.create({
      id: PRODUCT_ID,
      name: "SmartChiro Pro",
      description: "Every SmartChiro feature: patients, X-ray annotation and AI analysis, scheduling, billing.",
    });
  }
  // A price that was archived or changed in the dashboard still holds the
  // lookup key; take it over so the plan's price is always the one in PLANS.
  const created = await stripe.prices.create({
    product: PRODUCT_ID,
    currency: "myr",
    unit_amount: plan.amount * 100,
    recurring: { interval },
    lookup_key: plan.lookupKey,
    transfer_lookup_key: true,
    nickname: `SmartChiro Pro ${plan.label}`,
  });
  return created.id;
}

/** Statuses of a subscription that is still running or being paid for: a second checkout would double-bill. */
const OPEN_STATUSES: ReadonlySet<string> = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);

export async function hasOpenSubscription(stripe: Stripe, customerId: string): Promise<boolean> {
  const { data } = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  return data.some((sub) => OPEN_STATUSES.has(sub.status));
}

/** The subscription that decides a customer's plan: one that keeps the account open first, then the newest. */
export function pickSubscription(subscriptions: Stripe.Subscription[]): Stripe.Subscription | null {
  return (
    [...subscriptions].sort(
      (a, b) => Number(isPaidStatus(b.status)) - Number(isPaidStatus(a.status)) || b.created - a.created,
    )[0] ?? null
  );
}

/**
 * Copy the customer's current plan onto its user (found by Stripe customer,
 * else by `userId`). Reads every subscription of the customer, so an event
 * about an old or second subscription can't overwrite the one that counts.
 */
export async function syncCustomer(stripe: Stripe, customerId: string, userId?: string | null): Promise<void> {
  const { data } = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  const subscription = pickSubscription(data);
  const item = subscription?.items.data[0];
  const fields = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription?.id ?? null,
    subscriptionStatus: subscription?.status ?? null,
    subscriptionInterval: item?.price.recurring?.interval ?? null,
    subscriptionPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
    isPro: isPaidStatus(subscription?.status),
  };
  const byCustomer = await prisma.user.updateMany({ where: { stripeCustomerId: customerId }, data: fields });
  if (byCustomer.count === 0 && userId) {
    await prisma.user.updateMany({ where: { id: userId }, data: fields });
  }
}

/** A Stripe reference that may be an id or an expanded object → its id. */
export function stripeId(value: string | { id: string } | null | undefined): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
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
    const customerId = stripeId(checkout.customer);
    if (checkout.client_reference_id !== userId || !customerId || !checkout.subscription) return false;
    await syncCustomer(stripe, customerId, userId);
    return true;
  } catch (err) {
    console.error("[billing] confirming checkout failed:", err);
    return false;
  }
}
