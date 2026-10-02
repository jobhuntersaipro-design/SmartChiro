"use client";

import { Users, ChevronRight } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "../shared/EmptyState";
import type { RecentPatient } from "@/types/dashboard";
import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";

interface RecentPatientsCardProps {
  patients: RecentPatient[];
}

export function RecentPatientsCard({ patients }: RecentPatientsCardProps) {
  if (patients.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No recent patients"
        description="Your recent patients will appear here."
      />
    );
  }

  return (
    <div className="space-y-0">
      {patients.map((patient) => (
        <Link
          key={patient.id}
          href={`/dashboard/patients/${patient.id}/details`}
          className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-muted transition-all duration-200 cursor-pointer group hover:translate-x-1"
        >
          <div>
            <div className="text-[15px] font-medium text-foreground">
              {patient.firstName} {patient.lastName}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {patient.lastVisitDate && (
                <span className="text-[13px] text-fg-secondary">
                  Last visit: {new Date(patient.lastVisitDate).toLocaleDateString("en-US", { timeZone: CLINIC_TIME_ZONE,
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
              <span className="text-[13px] text-fg-secondary">
                {patient.xrayCount} X-ray{patient.xrayCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-fg-secondary opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
        </Link>
      ))}

      <div className="px-4 py-3">
        <Link
          href="/dashboard/patients"
          className="text-[14px] font-medium text-brand hover:text-brand-strong transition-colors"
        >
          View all patients
        </Link>
      </div>
    </div>
  );
}
