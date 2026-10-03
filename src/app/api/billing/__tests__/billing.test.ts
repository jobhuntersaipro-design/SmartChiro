import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

// A Stripe client double: real webhook signing, stubbed API calls.
const realStripe = new Stripe("sk_test_dummy");
const fake = {
  webhooks: realStripe.webhooks,
  customers: { create: vi.fn() },
  prices: { list: vi.fn(), create: vi.fn() },
  products: { retrieve: vi.fn(), create: vi.fn() },
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
  subscriptions: { retrieve: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
};
let stripeOn = true;
vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    stripeClient: () => (stripeOn ? fake : null),
    confirmCheckout: async (userId: string, id: string) => {
      const checkout = await fake.checkout.sessions.retrieve(id);
      if (checkout.client_reference_id !== userId) return false;
      await actual.syncSubscription(await fake.subscriptions.retrieve(checkout.subscription));
      return true;
    },
  };
});

const PREFIX = `test-billing-${Date.now()}`;
const WEBHOOK_SECRET = "whsec_test_secret";
let userId: string;

function subscription(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `sub_${PREFIX}`,
    customer: `cus_${PREFIX}`,
    status: "active",
    metadata: { userId },
    items: { data: [{ price: { recurring: { interval: "year" } }, current_period_end: 1_830_000_000 }] },
    ...overrides,
  };
}

function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
  });
}

describe("billing routes", () => {
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `${PREFIX}@t.com`, name: "Dr Owner" } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  });
  beforeEach(() => {
    stripeOn = true;
    mockAuth.mockResolvedValue({ user: { id: userId, email: `${PREFIX}@t.com` } });
    for (const fn of [
      fake.customers.create, fake.prices.list, fake.prices.create, fake.checkout.sessions.create,
      fake.checkout.sessions.retrieve, fake.subscriptions.retrieve, fake.billingPortal.sessions.create,
    ]) fn.mockReset();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://smartchiro.test");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("checkout: 503 when Stripe isn't configured", async () => {
    stripeOn = false;
    const { POST } = await import("../checkout/route");
    expect((await POST(post("/api/billing/checkout", { interval: "month" }))).status).toBe(503);
  });

  it("checkout: makes a customer, uses the yearly price and carries the trial over", async () => {
    fake.customers.create.mockResolvedValue({ id: `cus_${PREFIX}` });
    fake.prices.list.mockResolvedValue({ data: [{ id: "price_year" }] });
    fake.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
    const { POST } = await import("../checkout/route");
    const res = await POST(post("/api/billing/checkout", { interval: "year" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/s" });

    expect(fake.prices.list).toHaveBeenCalledWith(expect.objectContaining({ lookup_keys: ["smartchiro_pro_yearly_myr"] }));
    const args = fake.checkout.sessions.create.mock.calls[0][0];
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.stripeCustomerId).toBe(`cus_${PREFIX}`);
    expect(args).toMatchObject({
      mode: "subscription",
      customer: `cus_${PREFIX}`,
      client_reference_id: userId,
      line_items: [{ price: "price_year", quantity: 1 }],
      success_url: "https://smartchiro.test/api/billing/confirm?session_id={CHECKOUT_SESSION_ID}",
      subscription_data: { trial_end: Math.floor(user.trialEndsAt!.getTime() / 1000) },
    });
  });

  it("checkout: rejects a bad interval", async () => {
    const { POST } = await import("../checkout/route");
    expect((await POST(post("/api/billing/checkout", { interval: "week" }))).status).toBe(400);
  });

  it("webhook: rejects a bad signature", async () => {
    const { POST } = await import("../webhook/route");
    const res = await POST(post("/api/billing/webhook", "{}", { "stripe-signature": "t=1,v1=nope" }));
    expect(res.status).toBe(400);
  });

  it("webhook: syncs the subscription Stripe has now, not the event's copy", async () => {
    fake.subscriptions.retrieve.mockResolvedValue(subscription());
    const payload = JSON.stringify({
      id: "evt_1",
      object: "event",
      type: "customer.subscription.updated",
      data: { object: subscription({ status: "incomplete" }) },
    });
    const signature = realStripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const { POST } = await import("../webhook/route");
    const res = await POST(post("/api/billing/webhook", payload, { "stripe-signature": signature }));
    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({
      stripeSubscriptionId: `sub_${PREFIX}`,
      subscriptionStatus: "active",
      subscriptionInterval: "year",
      isPro: true,
    });
    expect(user.subscriptionPeriodEnd?.getTime()).toBe(1_830_000_000_000);
  });

  it("confirm: syncs the checkout's subscription and returns to the plan page", async () => {
    fake.checkout.sessions.retrieve.mockResolvedValue({ client_reference_id: userId, subscription: `sub_${PREFIX}` });
    fake.subscriptions.retrieve.mockResolvedValue(subscription({ status: "canceled" }));
    const { GET } = await import("../confirm/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/billing/confirm?session_id=cs_test_1"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard/billing?subscribed=1");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).subscriptionStatus).toBe("canceled");
  });

  it("checkout: 409 for someone already subscribed", async () => {
    await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: "active" } });
    const { POST } = await import("../checkout/route");
    expect((await POST(post("/api/billing/checkout", { interval: "month" }))).status).toBe(409);
  });
});
