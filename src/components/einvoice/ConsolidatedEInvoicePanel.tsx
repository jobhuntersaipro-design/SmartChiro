"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Search, Upload } from "lucide-react";
import { clinicCalendar, clinicDateLabel } from "@/lib/clinic-time";
import { formatMYR } from "@/lib/invoices";
import type { ConsolidatedPreview } from "@/types/einvoice";
import { ALERT_ERROR, BTN_PRIMARY, BTN_SECONDARY, FIELD_INPUT, FIELD_LABEL } from "@/components/invoices/form-styles";
import { EInvoiceStatusPill, einvoiceErrorMessage } from "./EInvoiceStatusPill";

/** "YYYY-MM" of last clinic month. */
function lastMonth(): string {
  const start = clinicCalendar().lastMonthStart;
  const d = new Date(start.getTime() + 12 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Monthly consolidated e-invoice (B2C): invoices issued in a clinic month that
 * weren't issued individually, rolled into one General Public e-invoice.
 * Due within 7 days after month end.
 */
export function ConsolidatedEInvoicePanel({ branchId }: { branchId: string }) {
  const [month, setMonth] = useState(lastMonth);
  const [preview, setPreview] = useState<ConsolidatedPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "json" | "submit" | null>(null);

  async function load() {
    setBusy("preview");
    setError(null);
    try {
      const res = await fetch(`/api/branches/${branchId}/einvoice/consolidated?month=${month}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setPreview(null);
        setError(res.status === 403 ? "Only the owner or an admin can prepare consolidated e-invoices." : einvoiceErrorMessage(data?.error, "Couldn't load that month."));
        return;
      }
      setPreview(data);
    } finally {
      setBusy(null);
    }
  }

  async function downloadJson() {
    setBusy("json");
    try {
      const res = await fetch(`/api/branches/${branchId}/einvoice/consolidated?month=${month}&format=json`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(einvoiceErrorMessage(data?.error, "Couldn't generate the JSON."));
        return;
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(await res.blob());
      link.download = `einvoice-consolidated-${month}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!preview || !window.confirm(`Submit a consolidated e-invoice for ${preview.included.length} invoice(s) to LHDN?`)) return;
    setBusy("submit");
    try {
      const res = await fetch(`/api/branches/${branchId}/einvoice/consolidated?month=${month}`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(einvoiceErrorMessage(data?.error, "Couldn't submit the consolidated e-invoice."));
        return;
      }
      toast.success("Consolidated e-invoice submitted to LHDN");
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-[6px] border border-[#e5edf5] p-4">
      <p className="text-[15px] font-medium text-[#0A2540]">Monthly consolidated e-invoice</p>
      <p className="mb-3 text-[13px] text-[#64748d]">
        For patients who didn&apos;t ask for their own e-invoice: the month&apos;s invoices go to LHDN as one &quot;General Public&quot; e-invoice,
        within 7 days after month end. Invoices over RM10,000 must be issued individually.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="einvoice-month" className={FIELD_LABEL}>
            Month
          </label>
          <input id="einvoice-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${FIELD_INPUT} w-44`} />
        </div>
        <button type="button" className={BTN_SECONDARY} onClick={() => void load()} disabled={busy !== null || !month}>
          {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" strokeWidth={1.75} />}
          Preview
        </button>
      </div>

      {error && <p className={`${ALERT_ERROR} mt-3`}>{error}</p>}

      {preview && (
        <div className="mt-3 space-y-3 text-[14px]">
          <p className="text-[#425466]">
            {preview.included.length} invoice{preview.included.length === 1 ? "" : "s"} · {formatMYR(preview.totals.subtotal)} + SST{" "}
            {formatMYR(preview.totals.taxAmount)} = <span className="font-medium text-[#061b31]">{formatMYR(preview.totals.total)}</span>
            {preview.totals.documents > 1 && <> · {preview.totals.documents} documents</>}
            {" · "}due by {clinicDateLabel(new Date(`${preview.dueBy}T12:00:00+08:00`))}
            {preview.late && <span className="text-[#b41a36]"> (late)</span>}
          </p>
          {preview.excluded.length > 0 && (
            <p className="text-[13px] text-[#9b6829]">
              Not included: {preview.excluded.map((e) => `${e.invoiceNumber} (${e.reason === "over_limit" ? "over RM10,000 — issue individually" : "zero amount"})`).join(", ")}
            </p>
          )}
          {!preview.supplier.ok && (
            <ul className="list-disc pl-5 text-[13px] text-[#b41a36]">
              {preview.supplier.errors.map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          )}
          {preview.submissions.length > 0 && (
            <ul className="space-y-1 text-[13px]">
              {preview.submissions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{s.codeNumber}</span>
                  <EInvoiceStatusPill status={s.status} />
                  {s.validationUrl && (
                    <a href={s.validationUrl} target="_blank" rel="noopener noreferrer" className="text-[#533afd] hover:underline">
                      Validation link
                    </a>
                  )}
                  {s.errors[0] && <span className="text-[#b41a36]">{s.errors[0].message}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => void downloadJson()} disabled={busy !== null || preview.included.length === 0 || !preview.supplier.ok}>
              {busy === "json" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" strokeWidth={1.75} />}
              Download JSON
            </button>
            {preview.canManage && (
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={() => void submit()}
                disabled={busy !== null || preview.included.length === 0 || !preview.monthEnded || !preview.supplier.ok || !preview.einvoiceEnabled}
                title={!preview.monthEnded ? "Available once the month has ended" : undefined}
              >
                {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" strokeWidth={1.75} />}
                Submit to LHDN
              </button>
            )}
          </div>
          {!preview.configured && (
            <p className="text-[13px] text-[#64748d]">MyInvois isn&apos;t connected, so submitting will be refused — download the JSON instead.</p>
          )}
          {!preview.einvoiceEnabled && <p className="text-[13px] text-[#64748d]">Turn on e-invoicing for this branch to submit.</p>}
        </div>
      )}
    </div>
  );
}
