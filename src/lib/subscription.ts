import { prisma } from "@/lib/prisma";
import { planState, trialDaysLeft, type PlanState } from "@/lib/plans";
import { clinicDateLabel } from "@/lib/clinic-time";

/**
 * Who may use SmartChiro (plans and prices: `plans.ts`). Staff accounts
 * (doctors, admins, front desk) are covered by the plan of an OWNER of a
 * branch they work in.
 */

/** Emails in SUPER_ADMIN_EMAILS (comma separated, any case) run the platform. */
export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

export interface AccountAccess {
  /** May use the app. */
  allowed: boolean;
  /** The user's own plan. */
  state: PlanState;
  trialEndsAt: Date | null;
  subscriptionStatus: string | null;
  subscriptionInterval: string | null;
  subscriptionPeriodEnd: Date | null;
  hasStripeCustomer: boolean;
  /** A branch owner whose plan covers this user when their own doesn't. */
  coveredBy: { name: string | null; email: string } | null;
  superAdmin: boolean;
  disabled: boolean;
}

export async function accountAccess(userId: string, now: Date = new Date()): Promise<AccountAccess | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      trialEndsAt: true,
      subscriptionStatus: true,
      subscriptionInterval: true,
      subscriptionPeriodEnd: true,
      stripeCustomerId: true,
      disabledAt: true,
    },
  });
  if (!user) return null;
  const state = planState(user, now);
  const superAdmin = isSuperAdminEmail(user.email);

  let coveredBy: AccountAccess["coveredBy"] = null;
  if (state === "expired" && !superAdmin) {
    const owners = await prisma.branchMember.findMany({
      where: { role: "OWNER", userId: { not: userId }, branch: { members: { some: { userId } } } },
      select: { user: { select: { name: true, email: true, trialEndsAt: true, subscriptionStatus: true } } },
    });
    // A super admin's own clinic never lapses, so neither does its staff's access.
    const owner = owners.find((o) => planState(o.user, now) !== "expired" || isSuperAdminEmail(o.user.email));
    if (owner) coveredBy = { name: owner.user.name, email: owner.user.email };
  }

  const disabled = user.disabledAt != null;
  return {
    allowed: !disabled && (superAdmin || state !== "expired" || coveredBy != null),
    state,
    trialEndsAt: user.trialEndsAt,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionInterval: user.subscriptionInterval,
    subscriptionPeriodEnd: user.subscriptionPeriodEnd,
    hasStripeCustomer: user.stripeCustomerId != null,
    coveredBy,
    superAdmin,
    disabled,
  };
}

/** Props for the plan page / paywall (`PlanView`), dates labelled in clinic time. */
export function planViewProps(access: AccountAccess, now: Date = new Date()) {
  return {
    state: access.state,
    daysLeft: trialDaysLeft(access.trialEndsAt, now),
    trialEndsLabel: access.trialEndsAt ? clinicDateLabel(access.trialEndsAt) : null,
    periodEndLabel: access.subscriptionPeriodEnd ? clinicDateLabel(access.subscriptionPeriodEnd) : null,
    interval: access.subscriptionInterval,
    subscriptionStatus: access.subscriptionStatus,
    hasStripeCustomer: access.hasStripeCustomer,
    coveredBy: access.coveredBy,
    billingConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
  };
}
