"use client";

import { useState } from "react";
import type { RevenueReport, RevenueRow, TrendPoint } from "@/types/reports";
import { csvDate, csvFileName, csvMoney } from "@/lib/reports/csv";
import { formatRangeLabel } from "@/lib/reports/range";
import { BarList, Legend, TrendChart } from "@/components/reports/charts";
import { ReportCard, Segmented, StatTile, downloadCsv } from "@/components/reports/ReportCard";
import { ReportTable, tableCsv, type ReportColumn } from "@/components/reports/ReportTable";
import { formatMYR, plural } from "@/components/reports/report-format";
import { useReport, type ReportQuery } from "@/components/reports/useReport";

type View = "doctor" | "treatment" | "branch" | "period";

const VIEW_LABEL: Record<View, string> = {
  doctor: "By doctor",
  treatment: "By treatment",
  branch: "By branch",
  period: "By period",
};

const NAME_HEADER: Record<Exclude<View, "period">, string> = { doctor: "Doctor", treatment: "Treatment", branch: "Branch" };

const moneyColumns = <T extends { collected: number; invoiced: number }>(): ReportColumn<T>[] => [
  { header: "Collected", csvHeader: "Collected (MYR)", align: "right", render: (r) => <span className="whitespace-nowrap">{formatMYR(r.collected)}</span>, csv: (r) => csvMoney(r.collected) },
  { header: "Invoiced", csvHeader: "Invoiced (MYR)", align: "right", render: (r) => <span className="whitespace-nowrap">{formatMYR(r.invoiced)}</span>, csv: (r) => csvMoney(r.invoiced) },
];

function splitColumns(view: Exclude<View, "period">): ReportColumn<RevenueRow>[] {
  return [
    { header: NAME_HEADER[view], render: (r) => r.name, csv: (r) => r.name, className: "min-w-40" },
    ...moneyColumns<RevenueRow>(),
  ];
}

const PERIOD_COLUMNS: ReportColumn<TrendPoint>[] = [
  {
    header: "Period",
    render: (p) => <span className="whitespace-nowrap">{p.key === "total" ? "Total" : formatRangeLabel(p)}</span>,
    csv: (p) => (p.key === "total" ? "Total" : formatRangeLabel(p)),
  },
  ...moneyColumns<TrendPoint>(),
];

/** CSV for the period view carries both ends of each period. */
const PERIOD_CSV_COLUMNS: ReportColumn<TrendPoint>[] = [
  { header: "From", render: () => null, csv: (p) => (p.key === "total" ? "Total" : csvDate(p.from)) },
  { header: "To", render: () => null, csv: (p) => (p.key === "total" ? "" : csvDate(p.to)) },
  ...moneyColumns<TrendPoint>(),
];

function rowsFor(data: RevenueReport, view: Exclude<View, "period">): RevenueRow[] {
  return view === "doctor" ? data.byDoctor : view === "treatment" ? data.byTreatment : data.byBranch;
}

export function RevenueCard({ query, multiBranch }: { query: ReportQuery; multiBranch: boolean }) {
  const { data, loading, error, retry } = useReport("revenue", query);
  const [view, setView] = useState<View>("doctor");
  const views: View[] = multiBranch ? ["doctor", "treatment", "branch", "period"] : ["doctor", "treatment", "period"];
  const current = views.includes(view) ? view : "doctor";

  const exportCsv = () => {
    if (!data) return;
    const range = data.range;
    if (current === "period") {
      const total: TrendPoint = { key: "total", from: range.from, to: range.to, collected: data.totals.collected, invoiced: data.totals.invoiced };
      downloadCsv(csvFileName(["revenue", "by", data.granularity], range), tableCsv(PERIOD_CSV_COLUMNS, data.trend, total));
      return;
    }
    const total: RevenueRow = { key: "total", name: "Total", collected: data.totals.collected, invoiced: data.totals.invoiced };
    downloadCsv(csvFileName(["revenue", "by", current], range), tableCsv(splitColumns(current), rowsFor(data, current), total));
  };

  return (
    <ReportCard
      title="Revenue"
      description="Collected = payments received, net of refunds. Invoiced = invoices issued, excluding drafts and cancelled."
      loading={loading && !data}
      refreshing={loading && !!data}
      error={error}
      onRetry={retry}
      onExport={data ? exportCsv : undefined}
    >
      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatTile
              label="Collected"
              value={formatMYR(data.totals.collected)}
              hint={`${plural(data.totals.payments, "payment")}${data.totals.refunds > 0 ? ` · ${formatMYR(data.totals.refunds)} refunded` : ""}`}
            />
            <StatTile label="Invoiced" value={formatMYR(data.totals.invoiced)} hint={plural(data.totals.invoices, "invoice")} />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[14px] font-medium text-[#425466]">Collected vs invoiced per {data.granularity}</h3>
              <Legend />
            </div>
            <TrendChart points={data.trend} granularity={data.granularity} />
          </div>
          <Segmented label="Revenue breakdown" value={current} options={views.map((id) => ({ id, label: VIEW_LABEL[id] }))} onChange={setView} />
          {current === "period" ? (
            <ReportTable
              caption="Revenue by period"
              columns={PERIOD_COLUMNS}
              rows={data.trend}
              footer={{ key: "total", from: data.range.from, to: data.range.to, collected: data.totals.collected, invoiced: data.totals.invoiced }}
              rowKey={(p) => p.key}
              empty="No days in this range."
            />
          ) : (
            <>
              <BarList
                label={`Collected ${VIEW_LABEL[current].toLowerCase()}`}
                empty="No revenue in this range."
                rows={rowsFor(data, current)
                  .filter((r) => r.collected !== 0 || r.invoiced !== 0)
                  .map((r) => ({ key: r.key, label: r.name, value: r.collected, display: formatMYR(r.collected) }))}
              />
              <ReportTable
                caption={`Revenue ${VIEW_LABEL[current].toLowerCase()}`}
                columns={splitColumns(current)}
                rows={rowsFor(data, current)}
                footer={{ key: "total", name: "Total", collected: data.totals.collected, invoiced: data.totals.invoiced }}
                rowKey={(r) => r.key}
                empty="No revenue in this range."
              />
            </>
          )}
        </>
      )}
    </ReportCard>
  );
}
