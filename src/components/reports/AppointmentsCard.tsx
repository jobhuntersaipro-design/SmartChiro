"use client";

import type { DoctorAppointmentRow } from "@/types/reports";
import { csvFileName, csvPercent } from "@/lib/reports/csv";
import { BarList } from "@/components/reports/charts";
import { ReportCard, StatTile, downloadCsv } from "@/components/reports/ReportCard";
import { ReportTable, tableCsv, type ReportColumn } from "@/components/reports/ReportTable";
import { formatCount, formatRate } from "@/components/reports/report-format";
import { useReport, type ReportQuery } from "@/components/reports/useReport";

const count = (key: "booked" | "completed" | "cancelled" | "noShow", header: string): ReportColumn<DoctorAppointmentRow> => ({
  header,
  align: "right",
  render: (r) => formatCount(r[key]),
  csv: (r) => r[key],
});

const COLUMNS: ReportColumn<DoctorAppointmentRow>[] = [
  { header: "Doctor", render: (r) => <span className="whitespace-nowrap">{r.name}</span>, csv: (r) => r.name },
  count("booked", "Booked"),
  count("completed", "Completed"),
  count("cancelled", "Cancelled"),
  count("noShow", "No-show"),
  { header: "No-show rate", csvHeader: "No-show rate (%)", align: "right", render: (r) => formatRate(r.noShowRate), csv: (r) => csvPercent(r.noShowRate) },
  { header: "Cancellation rate", csvHeader: "Cancellation rate (%)", align: "right", render: (r) => formatRate(r.cancellationRate), csv: (r) => csvPercent(r.cancellationRate) },
];

export function AppointmentsCard({ query }: { query: ReportQuery }) {
  const { data, loading, error, retry } = useReport("appointments", query);
  const total = data ? { doctorId: "total", name: "Total", ...data.totals } : undefined;

  return (
    <ReportCard
      title="Appointments"
      description="Appointments dated in the range. No-show rate = no-shows ÷ (completed + no-shows)."
      loading={loading && !data}
      refreshing={loading && !!data}
      error={error}
      onRetry={retry}
      onExport={data ? () => downloadCsv(csvFileName(["appointments", "by", "doctor"], data.range), tableCsv(COLUMNS, data.byDoctor, total)) : undefined}
    >
      {data && total && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Booked" value={formatCount(data.totals.booked)} hint={`${formatCount(data.totals.open)} still open`} />
            <StatTile label="Completed" value={formatCount(data.totals.completed)} />
            <StatTile label="Cancelled" value={formatCount(data.totals.cancelled)} hint={`${formatRate(data.totals.cancellationRate)} of booked`} />
            <StatTile label="No-show" value={formatCount(data.totals.noShow)} hint={`${formatRate(data.totals.noShowRate)} no-show rate`} />
          </div>
          <div className="space-y-2">
            <h3 className="text-[14px] font-medium text-[#425466]">No-show rate per doctor</h3>
            <BarList
              label="No-show rate per doctor"
              empty="No appointments in this range."
              rows={data.byDoctor.map((r) => ({
                key: r.doctorId,
                label: r.name,
                value: r.noShowRate,
                display: formatRate(r.noShowRate),
                detail: `${formatCount(r.noShow)} of ${formatCount(r.completed + r.noShow)}`,
              }))}
            />
          </div>
          <ReportTable caption="Appointments per doctor" columns={COLUMNS} rows={data.byDoctor} footer={total} rowKey={(r) => r.doctorId} empty="No appointments in this range." />
        </>
      )}
    </ReportCard>
  );
}
