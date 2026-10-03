import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

// The real `@/lib/stripe` runs against this Stripe client double: real webhook
// signing (from the actual package), stubbed API calls.
const fake = vi.hoisted(() => ({
  webhooks: null as unknown as Stripe["webhooks"],
  customers: { create: vi.fn() },
  prices: { list: vi.fn(), create: vi.fn() },
  products: { retrieve: vi.fn(), create: vi.fn() },
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
  subscriptions: { list: vi.fn() },
  billingPortal: { sessions: { create: vi.fn() } },
}));
vi.mock("stripe", async (importOriginal) => {
  const RealStripe = (await importOriginal<{ default: typeof Stripe }>()).default;
  fake.webhooks = new RealStripe("sk_test_dummy").webhooks;
  return { default: vi.fn(function FakeStripe() { return fake; }) };
});

const PREFIX = `test-billing-${Date.now()}`;
const WEBHOOK_SECRET = "whsec_test_secret";
const CUSTOMER = `cus_${PREFIX}`;
let userId: string;

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: `sub_${PREFIX}`,
    customer: CUSTOMER,
    status: "active",
    created: 1_800_000_000,
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

async function sendWebhook(type: string, object: unknown) {
  const payload = JSON.stringify({ id: `evt_${type}`, object: "event", type, data: { object } });
  const signature = fake.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const { POST } = await import("../webhook/route");
  return POST(post("/api/billing/webhook", payload, { "stripe-signature": signature }));
}

const userRow = () => prisma.user.findUniqueOrThrow({ where: { id: userId } });

describe("billing routes", () => {
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `${PREFIX}@t.com`, name: "Dr Owner" } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  });
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: userId, email: `${PREFIX}@t.com` } });
    for (const fn of [
      fake.customers.create, fake.prices.list, fake.prices.create, fake.products.retrieve, fake.products.create,
      fake.checkout.sessions.create, fake.checkout.sessions.retrieve, fake.subscriptions.list, fake.billingPortal.sessions.create,
    ]) fn.mockReset();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://smartchiro.test");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("checkout: 503 when Stripe isn't configured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { POST } = await import("../checkout/route");
    expect((await POST(post("/api/billing/checkout", { interval: "month" }))).status).toBe(503);
  });

  it("checkout: rejects a bad interval", async () => {
    const { POST } = await import("../checkout/route");
    expect((await POST(post("/api/billing/checkout", { interval: "week" }))).status).toBe(400);
  });

  it("checkout: makes a customer, uses the yearly price and carries the trial over", async () => {
    fake.customers.create.mockResolvedValue({ id: CUSTOMER });
    fake.prices.list.mockResolvedValue({
      data: [{ id: "price_year", unit_amount: 1000000, currency: "myr", recurring: { interval: "year" } }],
    });
    fake.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
    const { POST } = await import("../checkout/route");
    const res = await POST(post("/api/billing/checkout", { interval: "year" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/s" });

    expect(fake.prices.list).toHaveBeenCalledWith(expect.objectContaining({ lookup_keys: ["smartchiro_pro_yearly_myr"] }));
    expect(fake.prices.create).not.toHaveBeenCalled();
    const user = await userRow();
    expect(user.stripeCustomerId).toBe(CUSTOMER);
    expect(fake.checkout.sessions.create.mock.calls[0][0]).toMatchObject({
      mode: "subscription",
      customer: CUSTOMER,
      client_reference_id: userId,
      line_items: [{ price: "price_year", quantity: 1 }],
      success_url: "https://smartchiro.test/api/billing/confirm?session_id={CHECKOUT_SESSION_ID}",
      subscription_data: { trial_end: Math.floor(user.trialEndsAt!.getTime() / 1000) },
    });
  });

  it("checkout: refuses a second subscription Stripe already has, even if ours lags", async () => {
    fake.subscriptions.list.mockResolvedValue({ data: [subscription({ status: "incomplete" })] });
    const { POST } = await import("../checkout/route");
    expect((await POST(post("/api/billing/checkout", { interval: "month" }))).status).toBe(409);
    expect(fake.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("checkout: replaces a price whose amount no longer matches the plan, taking over its lookup key", async () => {
    fake.subscriptions.list.mockResolvedValue({ data: [] });
    fake.prices.list.mockResolvedValue({
      data: [{ id: "price_old", unit_amount: 39900, currency: "myr", recurring: { interval: "month" } }],
    });
    fake.prices.create.mockResolvedValue({ id: "price_new" });
    fake.checkout.sessions.create.mockResolvedValue({ url: "https://checkout.stripe.test/s2" });
    const { POST } = await import("../checkout/route");
    expect((await POST(post("/api/billing/checkout", { interval: "month" }))).status).toBe(200);
    expect(fake.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({ unit_amount: 100000, currency: "myr", lookup_key: "smartchiro_pro_monthly_myr", transfer_lookup_key: true }),
    );
    expect(fake.checkout.sessions.create.mock.calls[0][0].line_items).toEqual([{ price: "price_new", quantity: 1 }]);
  });

  it("webhook: rejects a bad signature", async () => {
    const { POST } = await import("../webhook/route");
    const res = await POST(post("/api/billing/webhook", "{}", { "stripe-signature": "t=1,v1=nope" }));
    expect(res.status).toBe(400);
  });

  it("webhook: syncs the customer's paid subscription, whatever the event was about", async () => {
    // A second, cancelled subscription must not lock out the active one.
    fake.subscriptions.list.mockResolvedValue({
      data: [subscription({ id: "sub_old", status: "canceled", created: 1_900_000_000 }), subscription()],
    });
    const res = await sendWebhook("customer.subscription.deleted", subscription({ id: "sub_old", status: "canceled" }));
    expect(res.status).toBe(200);
    expect(fake.subscriptions.list).toHaveBeenCalledWith(expect.objectContaining({ customer: CUSTOMER, status: "all" }));
    const user = await userRow();
    expect(user).toMatchObject({
      stripeSubscriptionId: `sub_${PREFIX}`,
      subscriptionStatus: "active",
      subscriptionInterval: "year",
      isPro: true,
    });
    expect(user.subscriptionPeriodEnd?.getTime()).toBe(1_830_000_000_000);
  });

  it("confirm: syncs the checkout's customer and returns to the plan page; other users' sessions don't count", async () => {
    fake.checkout.sessions.retrieve.mockResolvedValue({ client_reference_id: "someone-else", customer: CUSTOMER, subscription: "sub_x" });
    const { GET } = await import("../confirm/route");
    let res = await GET(new NextRequest("http://localhost:3000/api/billing/confirm?session_id=cs_test_1"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard/billing?pending=1");

    fake.checkout.sessions.retrieve.mockResolvedValue({ client_reference_id: userId, customer: CUSTOMER, subscription: "sub_x" });
    fake.subscriptions.list.mockResolvedValue({ data: [subscription({ status: "canceled" })] });
    res = await GET(new NextRequest("http://localhost:3000/api/billing/confirm?session_id=cs_test_1"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/dashboard/billing?subscribed=1");
    expect((await userRow()).subscriptionStatus).toBe("canceled");
  });

  it("checkout: 409 for someone already subscribed", async () => {
    await prisma.user.update({ where: { id: userId }, data: { subscriptionStatus: "active" } });
    const { POST } = await import("../checkout/route");
    expect((await POST(post("/api/billing/checkout", { interval: "month" }))).status).toBe(409);
  });
});
