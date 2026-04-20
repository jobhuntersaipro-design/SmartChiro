"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Patient } from "@/types/patient";
import { useRouter } from "next/navigation";

interface PatientCardProps {
  patient: Patient;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    active: { bg: "bg-[#E8F5E8]", text: "text-[#30B130]", dot: "bg-[#30B130]", label: "Active" },
    inactive: { bg: "bg-[#FFF8E1]", text: "text-[#9b6829]", dot: "bg-[#F5A623]", label: "Inactive" },
    discharged: { bg: "bg-[#F0F0F0]", text: "text-[#64748d]", dot: "bg-[#64748d]", label: "Discharged" },
  };
  const c = config[status] || config.active;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export function PatientCard({ patient }: PatientCardProps) {
  const router = useRouter();
  const initials = `${patient.firstName[0]}${patient.lastName[0]}`;
  const fullName = `${patient.firstName} ${patient.lastName}`;

  return (
    <div
      onClick={() => router.push(`/dashboard/patients/${patient.id}/details`)}
      className="rounded-[6px] border border-[#e5edf5] bg-white p-4 cursor-pointer transition-all duration-200 hover:translate-y-[-1px] hover:border-[#c1c9d2]"
      style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[13px] font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-[#061b31] truncate">{fullName}</p>
            {patient.icNumber && (
              <p className="text-[13px] text-[#64748d] truncate">{patient.icNumber}</p>
            )}
          </div>
        </div>
        <StatusBadge status={patient.status} />
      </div>

      {/* Contact */}
      {patient.phone && (
        <p className="text-[13px] text-[#64748d] mb-3 truncate">{patient.phone}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-[4px] bg-[#f6f9fc] px-2 py-1.5 text-center">
          <p className="text-[15px] font-semibold text-[#061b31]">{patient.totalVisits}</p>
          <p className="text-[11px] text-[#64748d]">Visits</p>
        </div>
        <div className="rounded-[4px] bg-[#f6f9fc] px-2 py-1.5 text-center">
          <p className="text-[15px] font-semibold text-[#061b31]">{patient.totalXrays}</p>
          <p className="text-[11px] text-[#64748d]">X-Rays</p>
        </div>
        <div className="rounded-[4px] bg-[#f6f9fc] px-2 py-1.5 text-center">
          <p className="text-[15px] font-semibold text-[#061b31] capitalize">{patient.status}</p>
          <p className="text-[11px] text-[#64748d]">Status</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[13px] text-[#64748d]">
        <span>Dr. {patient.doctorName?.replace(/^Dr\.?\s*/i, '')}</span>
        <span>
          {patient.lastVisit
            ? `Last: ${new Date(patient.lastVisit).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}`
            : "No visits"}
        </span>
      </div>
    </div>
  );
}
