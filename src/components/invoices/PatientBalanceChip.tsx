"use client";

import { useEffect, useState } from "react";
import { formatMYR } from "@/lib/invoices";

interface PatientBalanceChipProps {
  patientId: string;
  branchId: string;
  /** Bump to refetch after a payment or a new invoice. */
  refreshKey?: number;
  onClick?: () => void;
}

/** "Balance due RM 131.60" on the patient header; hidden when nothing is owed. */
export function PatientBalanceChip({ patientId, branchId, refreshKey = 0, onClick }: PatientBalanceChipProps) {
  const [outstanding, setOutstanding] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ branchId, patientId, status: "all" });
    fetch(`/api/invoices?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && setOutstanding(data?.summary?.outstanding ?? null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [patientId, branchId, refreshKey]);

  if (!outstanding || outstanding <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warning-subtle px-2 py-0.5 text-[13px] font-medium text-warning transition-colors hover:bg-warning-subtle"
    >
      Balance due {formatMYR(outstanding)}
    </button>
  );
}
