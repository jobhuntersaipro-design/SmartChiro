"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLANS, TRIAL_DAYS, YEARLY_SAVING, YEARLY_SAVING_PERCENT, type PlanInterval, type PlanState } from "@/lib/plans";

export interface PlanViewProps {
  state: PlanState;
  daysLeft: number;
  /** Pre-formatted dates (clinic time). */
  trialEndsLabel: string | null;
  periodEndLabel: string | null;
  interval: string | null;
  subscriptionStatus: string | null;
  hasStripeCustomer: boolean;
  coveredBy: { name: string | null; email: string } | null;
  /** Only works in clinics billed to other accounts. */
  staffOnly: boolean;
  billingConfigured: boolean;
}

/** "RM 6,000": whole ringgit, Malaysian style. */
function rm(amount: number): string {
  return `RM ${Math.round(amount).toLocaleString("en-MY")}`;
}

const FEATURES = [
  "Unlimited patients, visits and SOAP notes",
  "X-ray annotation and measurement tools",
  "AI pelvis analysis (10 X-rays per doctor per day)",
  "Appointments, online booking and WhatsApp / email reminders",
  "Invoices, receipts, packages and LHDN e-invoicing",
  "Reports, multiple branches and staff accounts",
];

export function PlanView(props: PlanViewProps) {
  const { state, billingConfigured } = props;
  const [interval, setInterval] = useState<PlanInterval>("year");
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);
  const router = useRouter();
  // Back from Checkout before Stripe confirmed it (/api/billing/confirm adds ?pending=1).
  const pending = useSearchParams().get("pending") === "1" && state !== "subscribed";

  useEffect(() => {
    if (!pending) return;
    // Re-read the plan while the webhook catches up (about a minute at most).
    let polls = 0;
    const id = window.setInterval(() => {
      if (++polls > 12) window.clearInterval(id);
      else router.refresh();
    }, 5000);
    return () => window.clearInterval(id);
  }, [pending, router]);

  const go = async (kind: "checkout" | "portal") => {
    setBusy(kind);
    try {
      const res = await fetch(`/api/billing/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: kind === "checkout" ? JSON.stringify({ interval }) : undefined,
      });
      const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !body?.url) throw new Error(body?.error ?? "Something went wrong. Please try again.");
      window.location.assign(body.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-[23px] font-medium text-foreground">Plan &amp; billing</h1>
        <p className="mt-1 text-[14px] text-fg-secondary">
          One plan with every feature. The {TRIAL_DAYS}-day free trial and the paid plan include exactly the same things.
        </p>
      </div>

      <StatusBanner {...props} pending={pending} />

      {state !== "subscribed" && (
        <section aria-labelledby="choose-plan" className="rounded-panel border border-border bg-surface p-5 shadow-(--shadow-card)">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="choose-plan" className="font-heading text-[17px] font-medium text-foreground">
              SmartChiro Pro
            </h2>
            <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-control bg-surface-muted p-0.5">
              {(["month", "year"] as const).map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={interval === i}
                  onClick={() => setInterval(i)}
                  className={cn(
                    "rounded-control px-3.5 py-1 text-[13px] font-medium transition-colors",
                    interval === i ? "bg-surface text-foreground shadow-(--shadow-resting)" : "text-fg-secondary hover:text-foreground",
                  )}
                >
                  {PLANS[i].label}
                  {i === "year" && <span className="ml-1.5 text-success">−{YEARLY_SAVING_PERCENT}%</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(["month", "year"] as const).map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setInterval(i)}
                aria-pressed={interval === i}
                className={cn(
                  "rounded-panel border p-4 text-left transition-colors",
                  interval === i ? "border-brand bg-brand-subtle/40 ring-1 ring-brand" : "border-border hover:bg-surface-hover",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-foreground">{PLANS[i].label}</span>
                  {i === "year" && (
                    <span className="rounded-full bg-success-subtle px-2 py-0.5 text-[11px] font-medium text-success">
                      Save {rm(YEARLY_SAVING)}
                    </span>
                  )}
                </div>
                <p className="mt-2">
                  <span className="font-heading text-[28px] font-medium tracking-tight text-foreground">
                    {rm(PLANS[i].amount)}
                  </span>
                  <span className="text-[14px] text-fg-secondary"> / {PLANS[i].per}</span>
                </p>
                <p className="mt-1 text-[12px] text-fg-secondary">
                  {i === "year"
                    ? `${rm(PLANS.year.amount / 12)} a month, billed yearly. ${rm(YEARLY_SAVING)} (${YEARLY_SAVING_PERCENT}%) less than ${rm(PLANS.month.amount * 12)} for 12 monthly payments.`
                    : "Billed every month. Cancel any time."}
                </p>
              </button>
            ))}
          </div>

          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[13px] text-fg-secondary">
                <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2} aria-hidden />
                {f}
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={() => go("checkout")} disabled={!billingConfigured || busy !== null || pending}>
              {busy === "checkout" && <Loader2 className="size-4 animate-spin" />}
              Subscribe {PLANS[interval].label.toLowerCase()} · {rm(PLANS[interval].amount)}
            </Button>
            <p className="text-[12px] text-fg-muted">
              {!billingConfigured
                ? "Online payment isn't set up yet."
                : state === "trial" && props.daysLeft > 2
                  ? `You won't be charged until your trial ends on ${props.trialEndsLabel}.`
                  : "Secure payment by Stripe. Prices in MYR."}
            </p>
          </div>
        </section>
      )}

      {props.hasStripeCustomer && (
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => go("portal")} disabled={!billingConfigured || busy !== null}>
            {busy === "portal" && <Loader2 className="size-4 animate-spin" />}
            Manage billing
          </Button>
          <span className="text-[12px] text-fg-muted">Change plan, update your card, download invoices or cancel.</span>
        </div>
      )}
    </div>
  );
}

function StatusBanner({
  state,
  daysLeft,
  trialEndsLabel,
  periodEndLabel,
  interval,
  subscriptionStatus,
  coveredBy,
  staffOnly,
  pending,
}: PlanViewProps & { pending: boolean }) {
  if (state === "subscribed") {
    const plan = interval === "year" ? PLANS.year : PLANS.month;
    return (
      <div className="flex items-start gap-3 rounded-panel border border-border bg-success-subtle p-4">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-success" strokeWidth={1.75} aria-hidden />
        <div>
          <p className="text-[14px] font-medium text-foreground">
            SmartChiro Pro · {plan.label} ({rm(plan.amount)} / {plan.per})
          </p>
          <p className="mt-0.5 text-[13px] text-fg-secondary">
            {subscriptionStatus === "past_due"
              ? "Your last payment didn't go through. Update your card in Manage billing to keep your account open."
              : subscriptionStatus === "trialing"
                ? `Subscribed. Your first payment is taken when the free trial ends${periodEndLabel ? ` on ${periodEndLabel}` : ""}.`
                : `Every feature is on.${periodEndLabel ? ` Next renewal ${periodEndLabel}.` : ""}`}
          </p>
        </div>
      </div>
    );
  }
  if (pending) {
    return (
      <div className="rounded-panel border border-border bg-info-subtle p-4 text-[13px] text-foreground">
        Thanks! Stripe is confirming your payment; this page updates once it&apos;s done.
      </div>
    );
  }
  if (state === "trial") {
    return (
      <div className="rounded-panel border border-border bg-brand-subtle p-4">
        <p className="text-[14px] font-medium text-foreground">
          Free trial: {daysLeft} day{daysLeft === 1 ? "" : "s"} left
        </p>
        <p className="mt-0.5 text-[13px] text-fg-secondary">
          Every feature is included until {trialEndsLabel}. Subscribe any time to keep going after that.
        </p>
      </div>
    );
  }
  if (coveredBy) {
    return (
      <div className="rounded-panel border border-border bg-success-subtle p-4">
        <p className="text-[14px] font-medium text-foreground">Covered by your clinic&apos;s plan</p>
        <p className="mt-0.5 text-[13px] text-fg-secondary">
          {coveredBy.name ?? coveredBy.email}&apos;s SmartChiro plan gives you every feature. Nothing to pay.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-panel border border-border bg-warning-subtle p-4">
      <p className="text-[14px] font-medium text-foreground">
        {staffOnly ? "Your clinic's SmartChiro plan has ended" : "Your free trial has ended"}
      </p>
      <p className="mt-0.5 text-[13px] text-fg-secondary">
        {staffOnly
          ? "Ask your clinic owner to subscribe, or subscribe yourself. Your patients, X-rays and records are kept safe in the meantime."
          : "Subscribe to SmartChiro Pro to open your account again. Your patients, X-rays and records are kept safe in the meantime."}
      </p>
    </div>
  );
}
