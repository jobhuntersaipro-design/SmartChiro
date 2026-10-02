"use client";

import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { ModalShell } from "@/components/packages/ModalShell";
import { RangePicker } from "@/components/reports/RangePicker";
import { ACCOUNTING_EXPORTS } from "@/lib/accounting-export";
import { formatRangeLabel, presetRange, type DayRange } from "@/lib/reports/range";
import { BTN_SECONDARY } from "./form-styles";

interface Props {
  /** A branch id, or "all" for every branch the user may export. */
  branchId: string;
  scopeLabel: string;
}

/**
 * Invoices page → Export: accounting CSVs for a date range in the current
 * branch scope (OWNER / ADMIN). Each file downloads straight from
 * /api/exports/<kind>.csv.
 */
export function AccountingExportButton({ branchId, scopeLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DayRange>(() => presetRange("lastMonth"));
  const query = new URLSearchParams({ branchId, from: range.from, to: range.to }).toString();

  return (
    <>
      <button type="button" className={BTN_SECONDARY} onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" strokeWidth={1.75} />
        Export
      </button>
      <ModalShell
        open={open}
        title="Export for accounting"
        description={`${scopeLabel} · ${formatRangeLabel(range)}. Invoices by issue date, payments by date received.`}
        onClose={() => setOpen(false)}
        widthClass="max-w-2xl"
      >
        <div className="space-y-4">
          <RangePicker value={range} onChange={setRange} />
          <ul className="divide-y divide-border rounded-panel border border-border">
            {ACCOUNTING_EXPORTS.map((e) => (
              <li key={e.kind} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <p className="text-[15px] text-foreground">{e.label}</p>
                    <p className="text-[13px] text-fg-secondary">{e.hint}</p>
                  </div>
                </div>
                <a href={`/api/exports/${e.kind}.csv?${query}`} download className={BTN_SECONDARY}>
                  <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                  CSV
                </a>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-fg-secondary">
            Journal and Xero files use the account codes in Branches → Settings → Billing &amp; tax.
          </p>
        </div>
      </ModalShell>
    </>
  );
}
