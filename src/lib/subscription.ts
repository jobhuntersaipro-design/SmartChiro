import { prisma } from "@/lib/prisma";
import { planState, trialDaysLeft, type PlanState } from "@/lib/plans";
import { clinicDateLabel } from "@/lib/clinic-time";

/**
 * Who may use SmartChiro (plans and prices: `plans.ts`).
 *
 * Every branch is billed to the account that created it (Branch.billingUserId;
 * ownership transfers don't move it). Account holders (they bill a branch, or
 * haven't joined one yet) use their own trial or subscription. Staff accounts
 * (only in branches billed to someone else) are covered by those billing
 * accounts; their own trial doesn't count, or a clinic could stay free by
 * adding fresh accounts every month.
 */

/** Emails in SUPER_ADMIN_EMAILS (comma separated, any case), lowercased. */
export function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Emails in SUPER_ADMIN_EMAILS run the platform. */
export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return superAdminEmails().includes(email.toLowerCase());
}

export interface AccountAccess {
  /** May use the app. */
  allowed: boolean;
  /** The user's own plan (a staff account's own trial reads as expired). */
  state: PlanState;
  trialEndsAt: Date | null;
  subscriptionStatus: string | null;
  subscriptionInterval: string | null;
  subscriptionPeriodEnd: Date | null;
  hasStripeCustomer: boolean;
  /** Only works in branches billed to other accounts. */
  staffOnly: boolean;
  /** The billing account of one of the user's branches whose plan covers them, when their own doesn't. */
  coveredBy: { name: string | null; email: string } | null;
  superAdmin: boolean;
  disabled: boolean;
  lastActiveAt: Date | null;
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
      lastActiveAt: true,
      branchMemberships: {
        select: {
          branch: {
            select: {
              billingUser: {
                select: { id: true, name: true, email: true, trialEndsAt: true, subscriptionStatus: true },
              },
            },
          },
        },
      },
    },
  });
  if (!user) return null;
  const superAdmin = isSuperAdminEmail(user.email);
  const payers = user.branchMemberships.flatMap((m) => (m.branch.billingUser ? [m.branch.billingUser] : []));
  const staffOnly = payers.length > 0 && payers.every((p) => p.id !== userId);
  const own = planState(user, now);
  const state: PlanState = own === "trial" && staffOnly ? "expired" : own;

  let coveredBy: AccountAccess["coveredBy"] = null;
  // Only staff-only accounts: someone who bills a branch pays for it themselves,
  // even while working at another clinic that pays (G5).
  if (state === "expired" && !superAdmin && staffOnly) {
    // A super admin's own clinics never lapse, so neither does their staff's access.
    const payer = payers.find(
      (p) => p.id !== userId && (planState(p, now) !== "expired" || isSuperAdminEmail(p.email)),
    );
    if (payer) coveredBy = { name: payer.name, email: payer.email };
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
    staffOnly,
    coveredBy,
    superAdmin,
    disabled,
    lastActiveAt: user.lastActiveAt,
  };
}

/**
 * Whether a branch's billing account is in good standing (trial, plan or super
 * admin). A lapsed clinic is read-only, so it takes no online bookings and
 * sends no marketing (D5). Branches with no billing account count as active.
 */
export async function billingActive(billingUserId: string | null, now: Date = new Date()): Promise<boolean> {
  if (!billingUserId) return true;
  return (await accountAccess(billingUserId, now))?.allowed ?? false;
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
    staffOnly: access.staffOnly,
    superAdmin: access.superAdmin,
    billingConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
  };
}
