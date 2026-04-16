"use client";

import { Users, ChevronRight } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "../shared/EmptyState";
import type { RecentPatient } from "@/types/dashboard";

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
          href={`/dashboard/patients`}
          className="flex items-center justify-between px-4 py-3 border-b border-[#e5edf5] last:border-b-0 hover:bg-[#f6f9fc] transition-all duration-200 cursor-pointer group hover:translate-x-1"
        >
          <div>
            <div className="text-[15px] font-medium text-[#061b31]">
              {patient.firstName} {patient.lastName}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {patient.lastVisitDate && (
                <span className="text-[13px] text-[#64748d]">
                  Last visit: {new Date(patient.lastVisitDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
              <span className="text-[13px] text-[#64748d]">
                {patient.xrayCount} X-ray{patient.xrayCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-[#64748d] opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
        </Link>
      ))}

      <div className="px-4 py-3">
        <Link
          href="/dashboard/patients"
          className="text-[14px] font-medium text-[#533afd] hover:text-[#4434d4] transition-colors"
        >
          View all patients
        </Link>
      </div>
    </div>
  );
}
