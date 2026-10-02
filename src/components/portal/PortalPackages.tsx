import type { PortalPackage } from "@/types/portal";
import { portalDate } from "@/components/portal/portal-format";
import { CARD, PILL } from "@/components/portal/styles";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<PortalPackage["status"], { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-success-subtle text-success" },
  COMPLETED: { label: "All used", className: "bg-surface-hover text-fg-secondary" },
  EXPIRED: { label: "Expired", className: "bg-warning-subtle text-warning" },
  CANCELLED: { label: "Cancelled", className: "bg-danger-subtle text-danger" },
};

interface Props {
  packages: PortalPackage[];
  showPatientName: boolean;
}

/** Prepaid packages with sessions left and expiry. */
export function PortalPackages({ packages, showPatientName }: Props) {
  if (packages.length === 0) {
    return <p className={cn(CARD, "p-4 text-[15px] text-fg-secondary")}>You have no prepaid packages.</p>;
  }
  return (
    <ul className="space-y-3">
      {packages.map((p) => {
        const status = STATUS[p.status];
        return (
          <li key={p.id} className={cn(CARD, "p-4")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[18px] font-medium text-foreground">{p.name}</p>
                <p className="text-[14px] text-fg-muted">
                  {p.branchName}
                  {showPatientName && ` · ${p.patientFirstName}`} · bought {portalDate(p.purchasedAt)}
                </p>
              </div>
              <span className={cn(PILL, status.className)}>{status.label}</span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-[15px]">
                <span className="font-medium text-foreground">{plural(p.sessionsLeft, "session")} left</span>
                <span className="text-fg-muted">
                  {p.sessionsUsed} of {p.sessionsTotal} used
                </span>
              </div>
              <progress
                className="mt-2 h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-surface-hover [&::-webkit-progress-value]:bg-brand"
                max={p.sessionsTotal}
                value={p.sessionsUsed}
                aria-label={`${p.sessionsUsed} of ${p.sessionsTotal} sessions used`}
              />
            </div>
            <p className="mt-2 text-[14px] text-fg-secondary">
              {p.expiresAt ? `${p.status === "EXPIRED" ? "Expired" : "Expires"} ${portalDate(p.expiresAt)}` : "No expiry date"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
