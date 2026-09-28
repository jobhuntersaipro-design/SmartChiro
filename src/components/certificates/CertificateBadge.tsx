"use client";

import { ShieldAlert } from "lucide-react";
import { formatDateInput } from "@/lib/date-input";
import { STAGE_LABEL, STAGE_TONE, certificateStage, describeExpiry, daysUntilExpiry } from "@/lib/certificates";
import { cn } from "@/lib/utils";

interface CertificateBadgeProps {
  /** APC expiry "YYYY-MM-DD", or null when not recorded. */
  expiresOn: string | null;
  className?: string;
}

/**
 * Small pill on doctor lists / headers when the Annual Practising
 * Certificate has expired or expires within 60 days. Renders nothing otherwise.
 */
export function CertificateBadge({ expiresOn, className }: CertificateBadgeProps) {
  if (!expiresOn) return null;
  const stage = certificateStage(expiresOn);
  if (stage === "ok") return null;
  const days = daysUntilExpiry(expiresOn);
  const label = stage === "expired" ? "APC expired" : days === 0 ? "APC expires today" : `APC ${days}d`;
  return (
    <span
      title={`${STAGE_LABEL[stage]} — ${describeExpiry(days)} (${formatDateInput(expiresOn)})`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[11px] font-medium whitespace-nowrap",
        STAGE_TONE[stage],
        className,
      )}
    >
      <ShieldAlert className="h-3 w-3" strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}
