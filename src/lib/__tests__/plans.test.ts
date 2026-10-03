import { describe, it, expect, afterEach, vi } from "vitest";
import { PLANS, YEARLY_SAVING, YEARLY_SAVING_PERCENT, isPaidStatus, planState, trialDaysLeft } from "../plans";
import { isSuperAdminEmail } from "../subscription";

const NOW = new Date("2026-10-03T04:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("plans", () => {
  it("prices Pro at RM 550 a month or RM 6,000 a year, saving RM 600 (9%)", () => {
    expect(PLANS.month.amount).toBe(550);
    expect(PLANS.year.amount).toBe(6000);
    expect(YEARLY_SAVING).toBe(600);
    expect(YEARLY_SAVING_PERCENT).toBe(9);
  });

  it("is subscribed while Stripe says active, trialing or past_due", () => {
    for (const status of ["active", "trialing", "past_due"]) {
      expect(planState({ subscriptionStatus: status, trialEndsAt: days(-40) }, NOW)).toBe("subscribed");
    }
    expect(isPaidStatus("canceled")).toBe(false);
    expect(isPaidStatus("incomplete")).toBe(false);
  });

  it("is on trial until trialEndsAt, then expired", () => {
    expect(planState({ subscriptionStatus: null, trialEndsAt: days(3) }, NOW)).toBe("trial");
    expect(planState({ subscriptionStatus: "canceled", trialEndsAt: days(-1) }, NOW)).toBe("expired");
    expect(planState({ subscriptionStatus: null, trialEndsAt: null }, NOW)).toBe("expired");
  });

  it("counts trial days left rounded up, never negative", () => {
    expect(trialDaysLeft(days(29.2), NOW)).toBe(30);
    expect(trialDaysLeft(days(0.1), NOW)).toBe(1);
    expect(trialDaysLeft(days(-2), NOW)).toBe(0);
    expect(trialDaysLeft(null, NOW)).toBe(0);
  });
});

describe("isSuperAdminEmail", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("matches SUPER_ADMIN_EMAILS case-insensitively, and nobody when unset", () => {
    vi.stubEnv("SUPER_ADMIN_EMAILS", " Owner@Clinic.my , second@x.com");
    expect(isSuperAdminEmail("owner@clinic.my")).toBe(true);
    expect(isSuperAdminEmail("SECOND@x.com")).toBe(true);
    expect(isSuperAdminEmail("other@x.com")).toBe(false);
    vi.stubEnv("SUPER_ADMIN_EMAILS", "");
    expect(isSuperAdminEmail("owner@clinic.my")).toBe(false);
    expect(isSuperAdminEmail(null)).toBe(false);
  });
});
