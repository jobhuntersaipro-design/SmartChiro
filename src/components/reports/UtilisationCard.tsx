"use client";

import type { UtilisationRow } from "@/types/reports";
import { csvFileName, csvPercent } from "@/lib/reports/csv";
import { BarList } from "@/components/reports/charts";
import { ReportCard, StatTile, downloadCsv } from "@/components/reports/ReportCard";
import { ReportTable, tableCsv, type ReportColumn } from "@/components/reports/ReportTable";
import { formatHours, formatRate, hoursNumber } from "@/components/reports/report-format";
import { useReport, type ReportQuery } from "@/components/reports/useReport";

const SOURCE_LABEL: Record<UtilisationRow["hoursSource"], string> = {
  schedule: "Working schedule",
  branch_hours: "Branch hours",
  none: "No hours set",
};

const COLUMNS: ReportColumn<UtilisationRow>[] = [
  { header: "Doctor", render: (r) => <span className="whitespace-nowrap">{r.name}</span>, csv: (r) => r.name },
  { header: "Booked", csvHeader: "Booked (h)", align: "right", render: (r) => <span className="whitespace-nowrap">{formatHours(r.bookedMinutes)}</span>, csv: (r) => hoursNumber(r.bookedMinutes) },
  { header: "Available", csvHeader: "Available (h)", align: "right", render: (r) => <span className="whitespace-nowrap">{formatHours(r.availableMinutes)}</span>, csv: (r) => hoursNumber(r.availableMinutes) },
  { header: "Utilisation", csvHeader: "Utilisation (%)", align: "right", render: (r) => formatRate(r.rate), csv: (r) => csvPercent(r.rate) },
  { header: "Hours from", render: (r) => <span className="whitespace-nowrap text-[#64748d]">{r.doctorId === "total" ? "" : SOURCE_LABEL[r.hoursSource]}</span>, csv: (r) => (r.doctorId === "total" ? "" : SOURCE_LABEL[r.hoursSource]) },
];

export function UtilisationCard({ query }: { query: ReportQuery }) {
  const { data, loading, error, retry } = useReport("utilisation", query);
  const total: UtilisationRow | undefined = data
    ? { doctorId: "total", name: "Total", hoursSource: "none", ...data.totals }
    : undefined;
  const noHours = data?.byDoctor.filter((r) => r.hoursSource === "none").length ?? 0;

  return (
    <ReportCard
      title="Utilisation"
      description="Booked time ÷ available time. Available = working schedule (or branch hours) minus breaks and time off."
      loading={loading && !data}
      refreshing={loading && !!data}
      error={error}
      onRetry={retry}
      onExport={data ? () => downloadCsv(csvFileName(["utilisation", "by", "doctor"], data.range), tableCsv(COLUMNS, data.byDoctor, total)) : undefined}
    >
      {data && total && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatTile label="Utilisation" value={formatRate(data.totals.rate)} hint={`${formatHours(data.totals.bookedMinutes)} of ${formatHours(data.totals.availableMinutes)}`} />
            <StatTile label="Doctors" value={String(data.byDoctor.length)} hint={noHours > 0 ? `${noHours} without hours set` : "All have hours set"} />
          </div>
          <BarList
            label="Utilisation per doctor"
            empty="No doctors in this branch."
            track
            max={1}
            rows={data.byDoctor.map((r) => ({
              key: r.doctorId,
              label: r.name,
              value: r.rate,
              display: formatRate(r.rate),
              detail: `${formatHours(r.bookedMinutes)} of ${formatHours(r.availableMinutes)}`,
            }))}
          />
          <ReportTable caption="Utilisation per doctor" columns={COLUMNS} rows={data.byDoctor} footer={total} rowKey={(r) => r.doctorId} empty="No doctors in this branch." />
        </>
      )}
    </ReportCard>
  );
}
