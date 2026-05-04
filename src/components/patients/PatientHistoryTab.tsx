"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BranchRole } from "@prisma/client";
import { PatientVisitsTab } from "@/components/patients/PatientVisitsTab";
import { PastAppointmentsTab } from "@/components/patients/PastAppointmentsTab";

interface PatientHistoryTabProps {
  patientId: string;
  branchRole: BranchRole | null;
}

type SubTab = "visits" | "appointments";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "visits", label: "Visits" },
  { id: "appointments", label: "Appointments" },
];

export function PatientHistoryTab({
  patientId,
  branchRole,
}: PatientHistoryTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeSub: SubTab = useMemo(() => {
    const raw = searchParams.get("sub");
    return raw === "appointments" ? "appointments" : "visits";
  }, [searchParams]);

  const setSub = useCallback(
    (sub: SubTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "history");
      params.set("sub", sub);
      // Clear filter/page state when switching sub-tabs — they don't translate.
      if (sub === "visits") {
        params.delete("status");
        params.delete("doctorId");
        params.delete("range");
        params.delete("page");
      }
      router.replace(
        `/dashboard/patients/${patientId}/details?${params.toString()}`,
        { scroll: false },
      );
    },
    [router, searchParams, patientId],
  );

  return (
    <div className="space-y-5">
      {/* Sub-tab nav — text-link style, mirrors UpcomingAppointmentsSection */}
      <nav
        className="flex items-center gap-3 text-[14px]"
        aria-label="History sub-tab"
      >
        {SUB_TABS.map((t, i) => (
          <span key={t.id} className="flex items-center gap-3">
            {i > 0 && (
              <span className="text-[#cbd5e1]" aria-hidden>
                ·
              </span>
            )}
            <button
              type="button"
              onClick={() => setSub(t.id)}
              aria-current={activeSub === t.id ? "page" : undefined}
              className={`cursor-pointer transition-colors duration-200 ${
                activeSub === t.id
                  ? "text-[#533afd] font-medium"
                  : "text-[#64748d] hover:text-[#061b31]"
              }`}
            >
              {t.label}
            </button>
          </span>
        ))}
      </nav>

      {/* Sub-tab content */}
      {activeSub === "visits" ? (
        <PatientVisitsTab patientId={patientId} />
      ) : (
        <PastAppointmentsTab
          patientId={patientId}
          branchRole={branchRole}
        />
      )}
    </div>
  );
}
