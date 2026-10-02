"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Patient } from "@/types/patient";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhoneLinks } from "@/components/patients/PhoneLinks";
import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";

interface PatientCardProps {
  patient: Patient;
  /** Show the patient's branch (the list spans several branches). */
  showBranch?: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    active: { bg: "bg-success-subtle", text: "text-success", dot: "bg-success", label: "Active" },
    inactive: { bg: "bg-warning-subtle", text: "text-warning", dot: "bg-warning", label: "Inactive" },
    discharged: { bg: "bg-surface-hover", text: "text-fg-secondary", dot: "bg-fg-secondary", label: "Discharged" },
  };
  const c = config[status] || config.active;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export function PatientCard({ patient, showBranch = false }: PatientCardProps) {
  const router = useRouter();
  const initials = `${patient.firstName[0]}${patient.lastName[0]}`;
  const fullName = `${patient.firstName} ${patient.lastName}`;
  const href = `/dashboard/patients/${patient.id}/details`;

  return (
    // Whole card opens the patient; keyboard users use the name link (Enter).
    <div
      onClick={() => router.push(href)}
      className="rounded-panel border border-border bg-white p-4 cursor-pointer transition-all duration-200 hover:translate-y-[-1px] hover:border-border-strong"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-brand-subtle text-brand text-[13px] font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <Link
              href={href}
              onClick={(e) => e.stopPropagation()}
              className="block truncate rounded-control text-[15px] font-medium text-foreground hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            >
              {fullName}
            </Link>
            {patient.icNumber && (
              <p className="text-[13px] text-fg-secondary truncate">{patient.icNumber}</p>
            )}
          </div>
        </div>
        <StatusBadge status={patient.status} />
      </div>

      {/* Contact */}
      {patient.phone && (
        <PhoneLinks phone={patient.phone} name={fullName} textClassName="text-[13px] text-fg-secondary" className="flex mb-3 max-w-full" />
      )}
      {showBranch && patient.branchName && (
        <p className="text-[13px] text-fg-secondary mb-3 truncate" title={patient.branchName}>{patient.branchName}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-md bg-surface-muted px-2 py-1.5 text-center">
          <p className="text-[15px] font-semibold text-foreground">{patient.totalVisits}</p>
          <p className="text-[11px] text-fg-secondary">Visits</p>
        </div>
        <div className="rounded-md bg-surface-muted px-2 py-1.5 text-center">
          <p className="text-[15px] font-semibold text-foreground">{patient.totalXrays}</p>
          <p className="text-[11px] text-fg-secondary">X-Rays</p>
        </div>
        <div className="rounded-md bg-surface-muted px-2 py-1.5 text-center">
          <p className="text-[15px] font-semibold text-foreground capitalize">{patient.status}</p>
          <p className="text-[11px] text-fg-secondary">Status</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[13px] text-fg-secondary">
        <span>Dr. {patient.doctorName?.replace(/^Dr\.?\s*/i, '')}</span>
        <span>
          {patient.lastVisit
            ? `Last: ${new Date(patient.lastVisit).toLocaleDateString("en-MY", { timeZone: CLINIC_TIME_ZONE, day: "numeric", month: "short", year: "numeric" })}`
            : "No visits"}
        </span>
      </div>
    </div>
  );
}
