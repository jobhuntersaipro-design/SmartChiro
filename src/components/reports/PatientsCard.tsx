"use client";

import Link from "next/link";
import type { LapsedPatientRow } from "@/types/reports";
import { clinicDateLabel } from "@/lib/clinic-time";
import { csvDate, csvFileName } from "@/lib/reports/csv";
import { rate } from "@/lib/reports/rates";
import { ReportCard, StatTile, downloadCsv } from "@/components/reports/ReportCard";
import { ReportTable, tableCsv, type ReportColumn } from "@/components/reports/ReportTable";
import { formatCount, formatRate } from "@/components/reports/report-format";
import { useReport, type ReportQuery } from "@/components/reports/useReport";

const daysSince = (iso: string, asOf: string) => Math.floor((new Date(asOf).getTime() - new Date(iso).getTime()) / 86_400_000);

function columns(multiBranch: boolean, asOf: string): ReportColumn<LapsedPatientRow>[] {
  return [
    {
      header: "Patient",
      render: (r) => (
        <Link href={`/dashboard/patients/${r.id}/details`} className="whitespace-nowrap text-foreground hover:text-brand hover:underline">
          {r.name}
        </Link>
      ),
      csv: (r) => r.name,
    },
    { header: "Phone", render: (r) => <span className="whitespace-nowrap">{r.phone ?? "—"}</span>, csv: (r) => r.phone ?? "" },
    ...(multiBranch ? [{ header: "Branch", render: (r: LapsedPatientRow) => <span className="whitespace-nowrap">{r.branchName}</span>, csv: (r: LapsedPatientRow) => r.branchName }] : []),
    { header: "Last visit", render: (r) => <span className="whitespace-nowrap">{clinicDateLabel(new Date(r.lastVisit), "numeric")}</span>, csv: (r) => csvDate(r.lastVisit) },
    { header: "Days since", align: "right", render: (r) => formatCount(daysSince(r.lastVisit, asOf)), csv: (r) => daysSince(r.lastVisit, asOf) },
  ];
}

export function PatientsCard({ query, multiBranch }: { query: ReportQuery; multiBranch: boolean }) {
  const { data, loading, error, retry } = useReport("patients", query);
  const cols = data ? columns(multiBranch, data.asOf) : [];

  return (
    <ReportCard
      title="Patients"
      description="New and returning patients in the range; lapsed patients as of today."
      loading={loading && !data}
      refreshing={loading && !!data}
      error={error}
      onRetry={retry}
      onExport={data ? () => downloadCsv(csvFileName(["lapsed", "patients"], data.range), tableCsv(cols, data.lapsedList)) : undefined}
    >
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="New patients" value={formatCount(data.newPatients)} hint="Registered in range" />
            <StatTile label="Seen" value={formatCount(data.seen)} hint="Had a visit in range" />
            <StatTile label="Returning" value={formatCount(data.returning)} hint={`${formatRate(rate(data.returning, data.seen))} of seen`} />
            <StatTile label="Lapsed" value={formatCount(data.lapsed)} hint={`No visit in ${data.lapsedAfterDays}+ days, nothing booked`} />
          </div>
          <div className="space-y-2">
            <h3 className="text-[14px] font-medium text-fg-secondary">
              Lapsed patients, most recent first{data.lapsed > data.lapsedList.length ? ` (${data.lapsedList.length} of ${formatCount(data.lapsed)})` : ""}
            </h3>
            <ReportTable caption="Lapsed patients" columns={cols} rows={data.lapsedList} rowKey={(r) => r.id} empty="No lapsed patients." />
          </div>
        </>
      )}
    </ReportCard>
  );
}
