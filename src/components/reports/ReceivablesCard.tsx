"use client";

import Link from "next/link";
import type { OverdueInvoiceRow } from "@/types/reports";
import { clinicDateLabel } from "@/lib/clinic-time";
import { csvDate, csvFileName, csvMoney } from "@/lib/reports/csv";
import { ReportCard, StatTile, downloadCsv } from "@/components/reports/ReportCard";
import { ReportTable, tableCsv, type ReportColumn } from "@/components/reports/ReportTable";
import { formatMYR, plural } from "@/components/reports/report-format";
import { useReport, type ReportQuery } from "@/components/reports/useReport";

const date = (iso: string) => <span className="whitespace-nowrap">{clinicDateLabel(new Date(iso), "numeric")}</span>;

function columns(multiBranch: boolean): ReportColumn<OverdueInvoiceRow>[] {
  return [
    { header: "Invoice", render: (r) => <span className="font-mono text-[13px] whitespace-nowrap">{r.invoiceNumber}</span>, csv: (r) => r.invoiceNumber },
    {
      header: "Patient",
      render: (r) => (
        <Link href={`/dashboard/patients/${r.patientId}/details?tab=history&sub=appointments`} className="whitespace-nowrap text-[#273951] hover:text-[#533afd] hover:underline">
          {r.patientName}
        </Link>
      ),
      csv: (r) => r.patientName,
    },
    ...(multiBranch ? [{ header: "Branch", render: (r: OverdueInvoiceRow) => <span className="whitespace-nowrap">{r.branchName}</span>, csv: (r: OverdueInvoiceRow) => r.branchName }] : []),
    { header: "Due", render: (r) => date(r.dueDate), csv: (r) => csvDate(r.dueDate) },
    { header: "Days overdue", align: "right", render: (r) => r.daysOverdue, csv: (r) => r.daysOverdue },
    { header: "Balance", csvHeader: "Balance (MYR)", align: "right", render: (r) => <span className="whitespace-nowrap">{formatMYR(r.balance)}</span>, csv: (r) => csvMoney(r.balance) },
  ];
}

export function ReceivablesCard({ query, multiBranch }: { query: ReportQuery; multiBranch: boolean }) {
  const { data, loading, error, retry } = useReport("receivables", query);
  const cols = columns(multiBranch);

  return (
    <ReportCard
      title="Receivables"
      description="What patients still owe, as of today (not limited to the date range)."
      loading={loading && !data}
      refreshing={loading && !!data}
      error={error}
      onRetry={retry}
      onExport={data ? () => downloadCsv(csvFileName(["overdue", "invoices"], data.range), tableCsv(cols, data.oldestOverdue)) : undefined}
    >
      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <StatTile label="Open balance" value={formatMYR(data.open.balance)} hint={plural(data.open.count, "unpaid invoice")} />
            <StatTile label="Overdue" value={formatMYR(data.overdue.balance)} hint={`${plural(data.overdue.count, "invoice")} past due`} />
          </div>
          <div className="space-y-2">
            <h3 className="text-[14px] font-medium text-[#425466]">
              Oldest overdue{data.overdue.count > data.oldestOverdue.length ? ` (${data.oldestOverdue.length} of ${data.overdue.count})` : ""}
            </h3>
            <ReportTable
              caption="Oldest overdue invoices"
              columns={cols}
              rows={data.oldestOverdue}
              rowKey={(r) => r.id}
              empty="Nothing overdue."
            />
          </div>
        </>
      )}
    </ReportCard>
  );
}
