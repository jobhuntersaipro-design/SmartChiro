"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, CalendarX2, Clock3, PhoneCall, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { OwnerSignals } from "@/types/dashboard";
import { formatMYR } from "@/lib/invoices";
import { formatAppointmentDateOnly, plural } from "@/lib/format";
import { SendRecallButton } from "@/components/outreach/SendRecallButton";

interface OwnerSignalsCardProps {
  /** "all" or one branch id — same scope as the stat cards. */
  branchParam: string;
  /** Bump to refetch (e.g. after a booking or a status change). */
  refreshKey?: number;
}

/** What needs the owner's attention today: money in, no-shows, stale bookings, recalls. */
export function OwnerSignalsCard({ branchParam, refreshKey = 0 }: OwnerSignalsCardProps) {
  const [signals, setSignals] = useState<OwnerSignals | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dashboard/signals?branchId=${encodeURIComponent(branchParam)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((body: OwnerSignals) => {
        if (!cancelled) {
          setSignals(body);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [branchParam, refreshKey]);

  const branchQuery = branchParam !== "all" ? `&branch=${encodeURIComponent(branchParam)}` : "";

  return (
    <section
      aria-labelledby="owner-signals-heading"
      className="rounded-[6px] border border-[#e5edf5] bg-white shadow-(--shadow-card)"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-[#e5edf5] px-5 py-3">
        <h2 id="owner-signals-heading" className="text-[16px] font-normal text-[#061b31]">
          Owner signals
        </h2>
        <span className="text-[13px] text-[#64748d] whitespace-nowrap">Today</span>
      </div>

      {failed ? (
        <p className="px-5 py-4 text-[14px] text-[#64748d]">Couldn&apos;t load today&apos;s signals.</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-b-[6px] bg-[#e5edf5]">
          <Signal
            icon={Banknote}
            tone="#15be53"
            label="Revenue today"
            value={signals ? formatMYR(signals.revenueToday) : null}
            hint={signals ? (signals.paymentsToday === 0 ? "No payments yet" : plural(signals.paymentsToday, "payment")) : null}
            href="/dashboard/invoices?status=PAID"
            linkLabel="Invoices"
          />
          <Signal
            icon={CalendarX2}
            tone="#DF1B41"
            label="No-shows today"
            value={signals ? String(signals.noShowsToday) : null}
            hint={signals ? (signals.noShowsToday === 0 ? "Everyone turned up" : "Follow up to rebook") : null}
            href={`/dashboard/appointments?view=list&tab=noshow${branchQuery}`}
            linkLabel="Review"
          />
          <Signal
            icon={Clock3}
            tone="#F5A623"
            label="Stale appointments"
            value={signals ? String(signals.staleAppointments) : null}
            hint={signals ? (signals.staleAppointments === 0 ? "All past bookings closed" : "Past, still scheduled") : null}
            href={`/dashboard/appointments?view=list&tab=all${branchQuery}`}
            linkLabel="Tidy up"
          />
          <Signal
            icon={PhoneCall}
            tone="#635BFF"
            label="Due for recall"
            value={signals ? String(signals.recallDue) : null}
            hint={signals ? (signals.recallDue === 0 ? "No lapsed patients" : "30+ days, nothing booked") : null}
            href="/dashboard/patients"
            linkLabel="Patients"
          >
            {signals && signals.recallSample.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {signals.recallSample.map((p) => (
                  <li key={p.id} className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
                    <Link
                      href={`/dashboard/patients/${p.id}/details`}
                      className="truncate text-[#273951] hover:text-[#533afd] hover:underline"
                      title={p.name}
                    >
                      {p.name}
                    </Link>
                    <span className="shrink-0 text-[12px] text-[#94a3b8] tabular-nums">
                      {formatAppointmentDateOnly(p.lastVisit)}
                    </span>
                    <SendRecallButton
                      variant="link"
                      patientId={p.id}
                      patientName={p.name}
                      disabled={p.marketingConsent === false}
                      disabledReason="No marketing consent"
                    />
                  </li>
                ))}
              </ul>
            )}
          </Signal>
        </div>
      )}
    </section>
  );
}

function Signal({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  href,
  linkLabel,
  children,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  value: string | null;
  hint: string | null;
  href: string;
  linkLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 bg-white px-4 py-4 sm:px-5">
      <div className="flex items-center gap-2 text-[14px] text-[#64748d]">
        <Icon className="h-4 w-4 shrink-0" style={{ color: tone }} strokeWidth={1.5} />
        <span className="truncate" title={label}>{label}</span>
      </div>
      {value === null ? (
        <div className="mt-2 h-7 w-20 animate-pulse rounded bg-[#e5edf5]" />
      ) : (
        <p className="mt-1 text-[23px] font-light tabular-nums text-[#061b31] whitespace-nowrap truncate" title={value}>
          {value}
        </p>
      )}
      {hint && <p className="text-[13px] text-[#64748d] truncate" title={hint}>{hint}</p>}
      {children}
      <Link
        href={href}
        className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-[#533afd] hover:text-[#3f2bd1] whitespace-nowrap"
      >
        {linkLabel}
        <ArrowRight className="h-3 w-3" strokeWidth={2} />
      </Link>
    </div>
  );
}
