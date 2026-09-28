"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Banknote, Download, FileText, Loader2, RotateCcw, Send, XCircle } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { allowedInvoiceTransitions, formatMYR } from "@/lib/invoices";
import { billingAccess } from "@/lib/billing-access";
import { clinicDateLabel, clinicTimeLabel } from "@/lib/clinic-time";
import { nationalityLabel } from "@/lib/nationality";
import type { InvoiceDetail } from "@/types/invoice";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY } from "./form-styles";

interface InvoiceDrawerProps {
  /** The invoice to show; null closes the drawer. */
  invoiceId: string | null;
  onClose: () => void;
  /** The caller's role in a branch (decides which actions show). */
  roleFor: (branchId: string) => string | null | undefined;
  /** After a payment, refund or status change, so lists can refresh. */
  onChanged?: () => void;
}

const date = (iso: string) => clinicDateLabel(new Date(iso));
const dateTime = (iso: string) => `${clinicDateLabel(new Date(iso))}, ${clinicTimeLabel(new Date(iso))}`;

function TotalRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? "text-[16px] font-medium text-[#061b31]" : "text-[15px] text-[#425466]"}`}>
      <span>{label}</span>
      <span className={`whitespace-nowrap tabular-nums ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

/** Invoice detail in a right-hand drawer: lines, SST, payments with receipts, and the billing actions. */
export function InvoiceDrawer({ invoiceId, onClose, roleFor, onChanged }: InvoiceDrawerProps) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"payment" | "refund" | null>(null);

  const load = useCallback(async (id: string) => {
    setError(null);
    const res = await fetch(`/api/invoices/${id}`);
    if (!res.ok) {
      setInvoice(null);
      setError(res.status === 404 ? "Invoice not found, or you don't have access to it." : "Couldn't load the invoice.");
      return;
    }
    setInvoice((await res.json()).invoice);
  }, []);

  useEffect(() => {
    setInvoice(null);
    setDialog(null);
    if (invoiceId) void load(invoiceId);
  }, [invoiceId, load]);

  async function changeStatus(next: "SENT" | "CANCELLED") {
    if (!invoice) return;
    if (next === "CANCELLED" && !window.confirm(`Cancel invoice ${invoice.invoiceNumber}? This can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(
          data?.error === "invoice_has_payments"
            ? "Money has been taken on this invoice — refund the payments before cancelling it."
            : "Couldn't update the invoice.",
        );
        return;
      }
      setInvoice(data.invoice);
      toast.success(`${invoice.invoiceNumber} ${next === "SENT" ? "marked sent" : "cancelled"}`);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  const access = billingAccess(invoice ? roleFor(invoice.branch.id) : null);
  const transitions = invoice ? allowedInvoiceTransitions(invoice.status) : [];
  const canPay = access.manage && !!invoice && invoice.status !== "CANCELLED" && invoice.balance > 0;
  const canRefund = access.refund && !!invoice && invoice.amountPaid > 0;
  const hasPayments = !!invoice && invoice.amountPaid !== 0;
  const cancellable = !!invoice && invoice.status !== "PAID" && invoice.status !== "CANCELLED";
  const sstNotCharged = invoice && !invoice.taxLabel && invoice.branch.sstEnabled && invoice.patient.isMalaysian;

  return (
    <Sheet open={invoiceId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="gap-0 overflow-y-auto bg-white p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {!invoice ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            {error ? (
              <p className="text-[15px] text-[#425466]">{error}</p>
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-[#64748d]" strokeWidth={1.5} />
            )}
            <SheetTitle className="sr-only">Invoice</SheetTitle>
          </div>
        ) : (
          <>
            <SheetHeader className="gap-1 border-b border-[#e5edf5] px-5 py-4 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="font-mono text-[17px] font-medium text-[#061b31]">{invoice.invoiceNumber}</SheetTitle>
                <InvoiceStatusBadge status={invoice.status} />
              </div>
              <SheetDescription className="text-[14px] text-[#64748d]">
                <Link href={`/dashboard/patients/${invoice.patient.id}/details`} className="text-[#273951] hover:text-[#533afd] hover:underline">
                  {invoice.patient.firstName} {invoice.patient.lastName}
                </Link>
                {invoice.patient.nationality && <> · {nationalityLabel(invoice.patient.nationality)}</>}
                {" · "}
                {invoice.branch.name}
              </SheetDescription>
              <p className="text-[13px] text-[#64748d]">
                Issued {date(invoice.issuedAt)}
                {invoice.dueDate && invoice.status !== "PAID" && <> · Due {date(invoice.dueDate)}</>}
                {invoice.paidAt && invoice.status === "PAID" && <> · Paid {date(invoice.paidAt)}</>}
              </p>
            </SheetHeader>

            <div className="flex flex-wrap gap-2 border-b border-[#e5edf5] px-5 py-3">
              {canPay && (
                <button type="button" className={BTN_PRIMARY} onClick={() => setDialog("payment")} disabled={busy}>
                  <Banknote className="h-4 w-4" strokeWidth={1.75} />
                  Record payment
                </button>
              )}
              {access.manage && transitions.includes("SENT") && (
                <button type="button" className={BTN_SECONDARY} onClick={() => void changeStatus("SENT")} disabled={busy}>
                  <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Mark sent
                </button>
              )}
              <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer" className={BTN_SECONDARY}>
                <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
                {invoice.status === "PAID" ? "Receipt PDF" : "Invoice PDF"}
              </a>
              {canRefund && (
                <button type="button" className={BTN_SECONDARY} onClick={() => setDialog("refund")} disabled={busy}>
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Refund
                </button>
              )}
              {access.manage && cancellable && (
                <button
                  type="button"
                  className={BTN_DANGER}
                  onClick={() => void changeStatus("CANCELLED")}
                  disabled={busy || hasPayments}
                  title={hasPayments ? "Refund the payments before cancelling" : undefined}
                >
                  <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Cancel invoice
                </button>
              )}
            </div>

            <div className="space-y-6 px-5 py-5">
              {access.manage && cancellable && hasPayments && (
                <p className="text-[13px] text-[#64748d]">Money has been taken on this invoice — refund it before cancelling.</p>
              )}

              <section aria-labelledby="inv-lines">
                <h3 id="inv-lines" className="mb-2 text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
                  Items
                </h3>
                <div className="overflow-x-auto rounded-[6px] border border-[#e5edf5]">
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="border-b border-[#e5edf5] bg-[#f6f9fc] text-left text-[13px] text-[#64748d]">
                        <th className="px-3 py-2 font-medium">Description</th>
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                        <th className="px-3 py-2 text-right font-medium">Unit</th>
                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.lineItems.map((line, i) => (
                        <tr key={i} className="border-b border-[#e5edf5] last:border-b-0">
                          <td className="px-3 py-2 text-[#061b31]">
                            {line.description}
                            {invoice.taxLabel && line.taxable === false && (
                              <span className="ml-1.5 whitespace-nowrap text-[12px] text-[#64748d]">(no SST)</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#425466]">{line.quantity}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-[#425466]">{formatMYR(line.unitPrice)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-[#061b31]">{formatMYR(line.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="ml-auto mt-3 max-w-xs space-y-1.5">
                  <TotalRow label="Subtotal" value={formatMYR(invoice.subtotal)} />
                  {invoice.taxLabel ? (
                    <TotalRow label={invoice.taxLabel} value={formatMYR(invoice.taxAmount)} />
                  ) : sstNotCharged ? (
                    <TotalRow label="SST (Malaysian patient)" value={formatMYR(0)} />
                  ) : null}
                  <div className="border-t border-[#e5edf5] pt-1.5">
                    <TotalRow label="Total" value={formatMYR(invoice.total)} strong />
                  </div>
                  <TotalRow label="Paid" value={formatMYR(invoice.amountPaid)} tone="text-[#108c3d]" />
                  <TotalRow
                    label="Balance"
                    value={formatMYR(invoice.balance)}
                    strong
                    tone={invoice.balance > 0 && invoice.status !== "CANCELLED" ? "text-[#9b6829]" : undefined}
                  />
                </div>
              </section>

              <section aria-labelledby="inv-payments">
                <h3 id="inv-payments" className="mb-2 text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
                  Payments
                </h3>
                {invoice.payments.length === 0 ? (
                  <p className="rounded-[6px] border border-dashed border-[#e5edf5] px-3 py-4 text-center text-[14px] text-[#64748d]">
                    No payments yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#e5edf5] rounded-[6px] border border-[#e5edf5]">
                    {invoice.payments.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-[14px] text-[#061b31]">
                            {p.isRefund ? "Refund" : p.methodLabel}
                            {p.isRefund && <span className="text-[#64748d]"> · {p.methodLabel}</span>}
                            {p.reference && <span className="text-[#64748d]"> · {p.reference}</span>}
                          </p>
                          <p className="text-[13px] text-[#64748d]">
                            {dateTime(p.receivedAt)}
                            {p.receivedBy?.name && <> · {p.receivedBy.name}</>}
                          </p>
                          {p.refundReason && <p className="text-[13px] text-[#425466]">Reason: {p.refundReason}</p>}
                          {p.notes && <p className="text-[13px] text-[#425466]">{p.notes}</p>}
                        </div>
                        <div className="text-right">
                          <p className={`whitespace-nowrap text-[15px] tabular-nums ${p.isRefund ? "text-[#DF1B41]" : "text-[#061b31]"}`}>
                            {formatMYR(p.amount)}
                          </p>
                          <a
                            href={`/api/invoices/${invoice.id}/payments/${p.id}/receipt`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-[12px] text-[#533afd] hover:underline"
                            aria-label={`Download receipt ${p.receiptNumber}`}
                          >
                            <Download className="h-3 w-3" strokeWidth={2} />
                            {p.receiptNumber}
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {(invoice.notes || invoice.branch.paymentInstructions) && (
                <section className="space-y-3 text-[14px]">
                  {invoice.notes && (
                    <div>
                      <h3 className="mb-1 text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Notes</h3>
                      <p className="whitespace-pre-line text-[#425466]">{invoice.notes}</p>
                    </div>
                  )}
                  {invoice.branch.paymentInstructions && (
                    <div>
                      <h3 className="mb-1 text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">How to pay</h3>
                      <p className="whitespace-pre-line text-[#425466]">{invoice.branch.paymentInstructions}</p>
                    </div>
                  )}
                </section>
              )}

              {!access.manage && access.read && (
                <p className="rounded-[4px] bg-[#f6f9fc] px-3 py-2 text-[13px] text-[#425466]">
                  Read only — payments are recorded by the front desk, admins and the owner.
                </p>
              )}
            </div>

            {dialog && (
              <RecordPaymentDialog
                mode={dialog}
                invoice={invoice}
                open
                onOpenChange={(open) => !open && setDialog(null)}
                onRecorded={({ invoice: next }) => {
                  setInvoice(next);
                  onChanged?.();
                }}
              />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
