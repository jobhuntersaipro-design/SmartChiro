"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { CertificateAlertRow, CertificateAlertsResponse } from "@/types/certificates";
import { STAGE_TONE, describeExpiry } from "@/lib/certificates";
import { formatDateInput } from "@/lib/date-input";
import { displayDoctorName } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CertificateAlertsCardProps {
  /** "all" or one branch id — the dashboard scope. */
  branchParam: string;
}

/**
 * Dashboard card for owners / admins: practising certificates (APC) that
 * have expired or expire within 60 days. Hidden when there are none.
 */
export function CertificateAlertsCard({ branchParam }: CertificateAlertsCardProps) {
  const [rows, setRows] = useState<CertificateAlertRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dashboard/certificates?branchId=${encodeURIComponent(branchParam)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((body: CertificateAlertsResponse) => !cancelled && setRows(body.certificates))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [branchParam]);

  if (!rows || rows.length === 0) return null;
  const expired = rows.filter((r) => r.stage === "expired").length;

  return (
    <section
      aria-labelledby="cert-alerts-heading"
      className="rounded-[6px] border border-[#e5edf5] bg-white shadow-(--shadow-card)"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#e5edf5] px-5 py-3">
        <h2 id="cert-alerts-heading" className="flex items-center gap-2 text-[16px] font-normal text-[#061b31]">
          <ShieldAlert className="h-4 w-4 text-[#DF1B41]" strokeWidth={1.75} />
          Practising certificates
        </h2>
        <span className="text-[13px] text-[#64748d]">
          {expired > 0 ? `${expired} expired · ` : ""}
          {rows.length - expired} expiring within 60 days
        </span>
      </div>
      <ul className="divide-y divide-[#e5edf5]">
        {rows.map((r) => (
          <li key={r.userId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2.5">
            <div className="min-w-0">
              <Link
                href={`/dashboard/doctors/${r.userId}?tab=professional`}
                className="text-[15px] text-[#061b31] hover:text-[#533afd] hover:underline"
              >
                {displayDoctorName(r.name)}
              </Link>
              <p className="truncate text-[13px] text-[#64748d]">
                {r.apcNumber ? `APC ${r.apcNumber}` : "APC no. not recorded"}
                {r.branches.length > 0 && ` · ${r.branches.join(", ")}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] tabular-nums text-[#425466] whitespace-nowrap">{formatDateInput(r.expiresOn)}</span>
              <span className={cn("rounded-full border px-2 py-px text-[12px] whitespace-nowrap", STAGE_TONE[r.stage])}>
                {describeExpiry(r.daysLeft)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
