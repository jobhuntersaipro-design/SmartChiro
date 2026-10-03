/**
 * SmartChiro Pro: one plan, every feature. New accounts get a 30-day free
 * trial (User.trialEndsAt, a database default); after it a Stripe
 * subscription keeps the account open. Client-safe: no database here
 * (access checks live in `subscription.ts`).
 */

export type PlanInterval = "month" | "year";

export const PLANS: Record<PlanInterval, { label: string; amount: number; per: string; lookupKey: string }> = {
  month: { label: "Monthly", amount: 1000, per: "month", lookupKey: "smartchiro_pro_monthly_myr" },
  year: { label: "Yearly", amount: 10000, per: "year", lookupKey: "smartchiro_pro_yearly_myr" },
};

export const TRIAL_DAYS = 30;
/** Paying monthly for a year vs the yearly price: RM 2,000, about 17%. */
export const YEARLY_SAVING = PLANS.month.amount * 12 - PLANS.year.amount;
export const YEARLY_SAVING_PERCENT = Math.round((YEARLY_SAVING / (PLANS.month.amount * 12)) * 100);

/** Stripe statuses that keep the account open; past_due gets Stripe's retry window. */
const PAID_STATUSES: ReadonlySet<string> = new Set(["active", "trialing", "past_due"]);

export type PlanState = "subscribed" | "trial" | "expired";

export interface PlanFields {
  trialEndsAt: Date | null;
  subscriptionStatus: string | null;
}

export function isPaidStatus(status: string | null | undefined): boolean {
  return status != null && PAID_STATUSES.has(status);
}

export function planState(user: PlanFields, now: Date = new Date()): PlanState {
  if (isPaidStatus(user.subscriptionStatus)) return "subscribed";
  if (user.trialEndsAt && user.trialEndsAt > now) return "trial";
  return "expired";
}

/** Whole days left in the trial, rounded up (0 once it has ended). */
export function trialDaysLeft(trialEndsAt: Date | null, now: Date = new Date()): number {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000));
}
