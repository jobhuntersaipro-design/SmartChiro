import type { PortalPackage } from "@/types/portal";
import { portalDate } from "@/components/portal/portal-format";
import { CARD, PILL } from "@/components/portal/styles";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<PortalPackage["status"], { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-[#E8F7EE] text-[#1E7A35]" },
  COMPLETED: { label: "All used", className: "bg-[#F0F3F7] text-[#425466]" },
  EXPIRED: { label: "Expired", className: "bg-[#FFF4E0] text-[#8A5A12]" },
  CANCELLED: { label: "Cancelled", className: "bg-[#FDE8EC] text-[#B41A36]" },
};

interface Props {
  packages: PortalPackage[];
  showPatientName: boolean;
}

/** Prepaid packages with sessions left and expiry. */
export function PortalPackages({ packages, showPatientName }: Props) {
  if (packages.length === 0) {
    return <p className={cn(CARD, "p-4 text-[15px] text-[#425466]")}>You have no prepaid packages.</p>;
  }
  return (
    <ul className="space-y-3">
      {packages.map((p) => {
        const status = STATUS[p.status];
        return (
          <li key={p.id} className={cn(CARD, "p-4")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[18px] font-medium text-[#0A2540]">{p.name}</p>
                <p className="text-[14px] text-[#697386]">
                  {p.branchName}
                  {showPatientName && ` · ${p.patientFirstName}`} · bought {portalDate(p.purchasedAt)}
                </p>
              </div>
              <span className={cn(PILL, status.className)}>{status.label}</span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-[15px]">
                <span className="font-medium text-[#0A2540]">{plural(p.sessionsLeft, "session")} left</span>
                <span className="text-[#697386]">
                  {p.sessionsUsed} of {p.sessionsTotal} used
                </span>
              </div>
              <progress
                className="mt-2 h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-[#635BFF] [&::-webkit-progress-bar]:bg-[#F0F3F7] [&::-webkit-progress-value]:bg-[#635BFF]"
                max={p.sessionsTotal}
                value={p.sessionsUsed}
                aria-label={`${p.sessionsUsed} of ${p.sessionsTotal} sessions used`}
              />
            </div>
            <p className="mt-2 text-[14px] text-[#425466]">
              {p.expiresAt ? `${p.status === "EXPIRED" ? "Expired" : "Expires"} ${portalDate(p.expiresAt)}` : "No expiry date"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
