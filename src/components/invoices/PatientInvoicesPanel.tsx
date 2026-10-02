"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatMYR } from "@/lib/invoices";
import { clinicDateLabel } from "@/lib/clinic-time";
import type { InvoiceListRow, InvoiceListSummary, InvoicePatientOption } from "@/types/invoice";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { InvoiceDrawer } from "./InvoiceDrawer";
import { NewInvoiceDialog } from "./NewInvoiceDialog";
import { BTN_PRIMARY } from "./form-styles";

interface PatientInvoicesPanelProps {
  patient: InvoicePatientOption & { branchId: string };
  branchName: string;
  branchRole: string | null;
  /** The page's header "New invoice" was clicked: the dialog opens here until it closes. */
  newInvoiceRequested?: boolean;
  onNewInvoiceRequestHandled?: () => void;
  /** After anything here changes an invoice, so the header balance can refresh. */
  onChanged?: () => void;
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-panel border border-border bg-white px-4 py-3">
      <p className="text-[13px] text-fg-secondary">{label}</p>
      <p className={`mt-0.5 whitespace-nowrap text-[22px] font-medium tabular-nums ${tone ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

/** Patient page → Billing: the patient's invoices, balance, New invoice and the invoice drawer. */
export function PatientInvoicesPanel({
  patient,
  branchName,
  branchRole,
  newInvoiceRequested = false,
  onNewInvoiceRequestHandled,
  onChanged,
}: PatientInvoicesPanelProps) {
  const [rows, setRows] = useState<InvoiceListRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<InvoiceListSummary | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ branchId: patient.branchId, patientId: patient.id, status: "all" });
    const res = await fetch(`/api/invoices?${params}`);
    if (!res.ok) {
      setRows([]);
      toast.error("Couldn't load invoices.");
      return;
    }
    const data = await res.json();
    setRows(data.invoices);
    setTotal(data.total);
    setSummary(data.summary);
  }, [patient.branchId, patient.id]);

  useEffect(() => {
    void load();
  }, [load]);


  function changed() {
    void load();
    onChanged?.();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-fg-secondary">Invoices and payments at {branchName}</p>
        <button type="button" className={BTN_PRIMARY} onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          New invoice
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Figure
          label="Balance due"
          value={summary ? formatMYR(summary.outstanding) : "—"}
          tone={summary && summary.outstanding > 0 ? "text-warning" : undefined}
        />
        <Figure label="Overdue" value={summary ? formatMYR(summary.overdue) : "—"} />
        <Figure label="Invoices" value={rows ? String(total) : "—"} />
      </div>

      <div className="overflow-x-auto rounded-panel border border-border bg-white">
        <table className="w-full min-w-160">
          <thead>
            <tr className="border-b border-border text-left text-[13px] font-medium uppercase tracking-[0.04em] text-fg-secondary whitespace-nowrap">
              <th className="px-4 py-2.5">Invoice</th>
              <th className="px-4 py-2.5">Issued</th>
              <th className="px-4 py-2.5 text-right">Total</th>
              <th className="px-4 py-2.5 text-right">Paid</th>
              <th className="px-4 py-2.5 text-right">Balance</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-fg-secondary">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" strokeWidth={1.5} />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <FileText className="mx-auto mb-2 h-7 w-7 text-border-strong" strokeWidth={1.25} />
                  <p className="text-[15px] text-fg-secondary">No invoices for this patient yet</p>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const open = row.status !== "CANCELLED" && row.status !== "PAID";
                return (
                  <tr
                    key={row.id}
                    onClick={() => setOpenId(row.id)}
                    className="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-muted"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(row.id);
                        }}
                        className="font-mono text-[14px] text-foreground hover:text-brand hover:underline"
                      >
                        {row.invoiceNumber}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-[14px] tabular-nums text-fg-secondary whitespace-nowrap">
                      {clinicDateLabel(new Date(row.createdAt))}
                    </td>
                    <td className="px-4 py-3 text-right text-[15px] tabular-nums text-foreground whitespace-nowrap">{formatMYR(row.amount)}</td>
                    <td className="px-4 py-3 text-right text-[15px] tabular-nums text-fg-secondary whitespace-nowrap">
                      {row.amountPaid ? formatMYR(row.amountPaid) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right text-[15px] tabular-nums whitespace-nowrap ${open && row.balance > 0 ? "font-medium text-foreground" : "text-fg-secondary"}`}>
                      {open ? formatMYR(row.balance) : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <InvoiceStatusBadge status={row.status} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {total > (rows?.length ?? 0) && (
        <Link
          href={`/dashboard/invoices?search=${encodeURIComponent(patient.lastName)}`}
          className="inline-block text-[14px] text-brand hover:underline"
        >
          All {total} invoices on the Invoices page
        </Link>
      )}

      <InvoiceDrawer invoiceId={openId} onClose={() => setOpenId(null)} roleFor={() => branchRole} onChanged={changed} />
      <NewInvoiceDialog
        open={newOpen || newInvoiceRequested}
        onOpenChange={(open) => {
          setNewOpen(open);
          if (!open) onNewInvoiceRequestHandled?.();
        }}
        branches={[{ id: patient.branchId, name: branchName }]}
        patient={patient}
        onCreated={(invoice) => {
          toast.success(`${invoice.invoiceNumber} created`);
          changed();
          setOpenId(invoice.id);
        }}
      />
    </div>
  );
}
