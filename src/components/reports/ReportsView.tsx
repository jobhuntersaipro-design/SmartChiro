"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, CalendarRange } from "lucide-react";
import { replaceUrl } from "@/lib/url-state";
import { formatRangeLabel, parseRange, presetRange, type DayRange } from "@/lib/reports/range";
import { RangePicker } from "@/components/reports/RangePicker";
import { RevenueCard } from "@/components/reports/RevenueCard";
import { ReceivablesCard } from "@/components/reports/ReceivablesCard";
import { AppointmentsCard } from "@/components/reports/AppointmentsCard";
import { UtilisationCard } from "@/components/reports/UtilisationCard";
import { PackagesCard } from "@/components/reports/PackagesCard";
import { PatientsCard } from "@/components/reports/PatientsCard";
import { CommissionsCard } from "@/components/reports/CommissionsCard";

interface ReportsViewProps {
  /** A branch id, or "all" for every branch the user may report on. */
  branchId: string;
  scopeLabel: string;
  branchCount: number;
}

function initialRange(from: string | null, to: string | null): DayRange {
  const parsed = from || to ? parseRange(from, to) : null;
  return parsed?.ok ? { from: parsed.range.from, to: parsed.range.to } : presetRange("month");
}

export function ReportsView({ branchId, scopeLabel, branchCount }: ReportsViewProps) {
  const searchParams = useSearchParams();
  const [range, setRange] = useState<DayRange>(() => initialRange(searchParams.get("from"), searchParams.get("to")));
  const query = useMemo(() => ({ branchId, from: range.from, to: range.to }), [branchId, range.from, range.to]);
  const multiBranch = branchCount > 1;

  const changeRange = (next: DayRange) => {
    setRange(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", next.from);
    params.set("to", next.to);
    replaceUrl(`/dashboard/reports?${params}`);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-[23px] font-medium text-foreground">Reports</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-fg-secondary">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                {scopeLabel}
                {multiBranch && ` (${branchCount} branches)`}
              </span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <CalendarRange className="h-3.5 w-3.5" strokeWidth={1.75} />
                {formatRangeLabel(range)}
              </span>
            </p>
          </div>
        </div>
        <RangePicker value={range} onChange={changeRange} />
      </header>

      <RevenueCard query={query} multiBranch={multiBranch} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ReceivablesCard query={query} multiBranch={multiBranch} />
        <PackagesCard query={query} />
        <AppointmentsCard query={query} />
        <UtilisationCard query={query} />
      </div>
      <PatientsCard query={query} multiBranch={multiBranch} />
      <CommissionsCard query={query} />
    </div>
  );
}
