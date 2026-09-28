"use client";

import type { PackageLiabilityRow } from "@/types/reports";
import { csvFileName, csvMoney } from "@/lib/reports/csv";
import { BarList } from "@/components/reports/charts";
import { ReportCard, StatTile, downloadCsv } from "@/components/reports/ReportCard";
import { ReportTable, tableCsv, type ReportColumn } from "@/components/reports/ReportTable";
import { formatCount, formatMYR, plural } from "@/components/reports/report-format";
import { useReport, type ReportQuery } from "@/components/reports/useReport";

const COLUMNS: ReportColumn<PackageLiabilityRow>[] = [
  { header: "Package", render: (r) => <span className="whitespace-nowrap">{r.name}</span>, csv: (r) => r.name, className: "min-w-40" },
  { header: "Active", align: "right", render: (r) => formatCount(r.active), csv: (r) => r.active },
  { header: "Sessions left", align: "right", render: (r) => formatCount(r.sessionsLeft), csv: (r) => r.sessionsLeft },
  { header: "Expiring ≤ 30 days", csvHeader: "Expiring within 30 days", align: "right", render: (r) => formatCount(r.expiringSoon), csv: (r) => r.expiringSoon },
  { header: "Liability", csvHeader: "Liability (MYR)", align: "right", render: (r) => <span className="whitespace-nowrap">{formatMYR(r.liability)}</span>, csv: (r) => csvMoney(r.liability) },
];

export function PackagesCard({ query }: { query: ReportQuery }) {
  const { data, loading, error, retry } = useReport("packages", query);
  const total: PackageLiabilityRow | undefined = data
    ? { name: "Total", active: data.active, sessionsLeft: data.sessionsOutstanding, liability: data.liability, expiringSoon: data.expiringSoon.count }
    : undefined;

  return (
    <ReportCard
      title="Packages"
      description="Sessions paid for but not yet used, as of today. Liability = sessions left × price per session."
      loading={loading && !data}
      refreshing={loading && !!data}
      error={error}
      onRetry={retry}
      onExport={data ? () => downloadCsv(csvFileName(["package", "liability"], data.range), tableCsv(COLUMNS, data.byPackage, total)) : undefined}
    >
      {data && total && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <StatTile label="Liability" value={formatMYR(data.liability)} hint={plural(data.sessionsOutstanding, "session") + " owed"} />
            <StatTile label="Active packages" value={formatCount(data.active)} />
            <StatTile
              label="Expiring in 30 days"
              value={formatCount(data.expiringSoon.count)}
              hint={data.expiringSoon.count > 0 ? `${plural(data.expiringSoon.sessions, "session")} · ${formatMYR(data.expiringSoon.liability)}` : undefined}
            />
            <StatTile label="Sold in range" value={formatCount(data.sold.count)} hint={formatMYR(data.sold.value)} />
          </div>
          <div className="space-y-2">
            <h3 className="text-[14px] font-medium text-[#425466]">Liability by package</h3>
            <BarList
              label="Liability by package"
              empty="No active packages."
              rows={data.byPackage.map((r) => ({
                key: r.name,
                label: r.name,
                value: r.liability,
                display: formatMYR(r.liability),
                detail: plural(r.sessionsLeft, "session"),
              }))}
            />
          </div>
          <ReportTable caption="Package liability" columns={COLUMNS} rows={data.byPackage} footer={total} rowKey={(r) => r.name} empty="No active packages." />
        </>
      )}
    </ReportCard>
  );
}
