"use client";

import type { CommissionReportRow } from "@/types/commissions";
import { csvFileName, csvMoney } from "@/lib/reports/csv";
import { ReportCard, StatTile, downloadCsv } from "@/components/reports/ReportCard";
import { ReportTable, tableCsv, type ReportColumn } from "@/components/reports/ReportTable";
import { formatCount, formatMYR } from "@/components/reports/report-format";
import { useReport, type ReportQuery } from "@/components/reports/useReport";

const money = (header: string, pick: (r: CommissionReportRow) => number, strong = false): ReportColumn<CommissionReportRow> => ({
  header,
  csvHeader: `${header} (MYR)`,
  align: "right",
  render: (r) => <span className={strong ? "whitespace-nowrap font-medium text-foreground" : "whitespace-nowrap"}>{formatMYR(pick(r))}</span>,
  csv: (r) => csvMoney(pick(r)),
});

const COLUMNS: ReportColumn<CommissionReportRow>[] = [
  { header: "Doctor / staff", render: (r) => <span className="whitespace-nowrap">{r.name}</span>, csv: (r) => r.name, className: "min-w-40" },
  money("Collected", (r) => r.collected),
  money("On collected", (r) => r.collectedCommission),
  { header: "Visits", align: "right", render: (r) => formatCount(r.visits), csv: (r) => r.visits },
  money("Per visit", (r) => r.visitCommission),
  money("Package sales", (r) => r.packageSales),
  money("On packages", (r) => r.packageCommission),
  money("Commission", (r) => r.total, true),
];

/**
 * Commission owed per doctor for the range, from the branch commission rules
 * (Branch → Settings → Commissions). Basis amounts use the revenue report's
 * attribution.
 */
export function CommissionsCard({ query }: { query: ReportQuery }) {
  const { data, loading, error, retry } = useReport("commissions", query);
  const footer: CommissionReportRow | undefined = data ? { userId: "total", name: "Total", ...data.totals } : undefined;

  return (
    <ReportCard
      title="Commissions"
      description="From each branch's commission rules: % of payments collected on the doctor's appointments, a fixed amount per completed visit, or % of package sales collected."
      loading={loading && !data}
      refreshing={loading && !!data}
      error={error}
      onRetry={retry}
      onExport={data ? () => downloadCsv(csvFileName(["commissions"], data.range), tableCsv(COLUMNS, data.rows, footer)) : undefined}
    >
      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label="Commission" value={formatMYR(data.totals.total)} hint={`${formatCount(data.rows.filter((r) => r.total !== 0).length)} earning`} />
            <StatTile label="On collected" value={formatMYR(data.totals.collectedCommission)} hint={`of ${formatMYR(data.totals.collected)}`} />
            <StatTile label="Per visit + packages" value={formatMYR(data.totals.visitCommission + data.totals.packageCommission)} hint={`${formatCount(data.totals.visits)} visits`} />
          </div>
          {data.ruleCount === 0 && (
            <p className="rounded-control bg-surface-muted px-3 py-2 text-[14px] text-fg-secondary">
              No commission rules yet — add them in Branches → Settings → Commissions.
            </p>
          )}
          <ReportTable
            caption="Commissions per doctor"
            columns={COLUMNS}
            rows={data.rows}
            footer={footer}
            rowKey={(r) => r.userId}
            empty="No collections, visits or package sales in this range."
          />
        </>
      )}
    </ReportCard>
  );
}
