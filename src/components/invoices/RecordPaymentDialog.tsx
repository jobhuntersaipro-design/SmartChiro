"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PaymentMethod } from "@prisma/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/date-input";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, formatMYR } from "@/lib/invoices";
import { amountInput, checkPaymentAmount, checkRefundAmount } from "@/lib/invoice-form";
import { clinicDateKey, clinicInstantFromInputs, clinicTimeInput } from "@/lib/clinic-time";
import type { InvoiceDetail, InvoicePayment } from "@/types/invoice";
import { cn } from "@/lib/utils";
import { ALERT_ERROR, BTN_PRIMARY, BTN_SECONDARY, FIELD_ERROR, FIELD_INPUT, FIELD_LABEL, FIELD_TEXTAREA, INVALID } from "./form-styles";

type Mode = "payment" | "refund";

interface PaymentDialogProps {
  mode: Mode;
  invoice: Pick<InvoiceDetail, "id" | "invoiceNumber" | "balance" | "amountPaid">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecorded: (result: { invoice: InvoiceDetail; payment: InvoicePayment }) => void;
}

const REFERENCE_HINT: Partial<Record<PaymentMethod, string>> = {
  CARD: "Last 4 digits or approval code",
  DUITNOW_QR: "DuitNow reference",
  FPX: "FPX transaction ID",
  EWALLET: "Wallet transaction ID",
  BANK_TRANSFER: "Bank reference",
  PANEL: "TPA / claim number",
};

function errorMessage(code: string | undefined, data: Record<string, unknown> | null): string {
  switch (code) {
    case "overpayment":
      return `That's more than the balance — only ${formatMYR(Number(data?.balance ?? 0))} is outstanding.`;
    case "refund_exceeds_paid":
      return `You can refund at most ${formatMYR(Number(data?.amountPaid ?? 0))}.`;
    case "refund_reason_required":
      return "Give a reason for the refund.";
    case "received_in_future":
      return "The received date and time can't be in the future.";
    case "invoice_cancelled":
      return "This invoice was cancelled, so it can't take payments.";
    case "forbidden":
      return "You don't have permission to do that.";
    default:
      return "Couldn't save. Please try again.";
  }
}

/**
 * Records one payment on an invoice (deposit, instalment or one part of a
 * split payment — open it again for the next part), or a refund in "refund"
 * mode. Each saves with its own receipt number.
 */
export function RecordPaymentDialog(props: PaymentDialogProps) {
  // Re-mounted per open so every field starts from the invoice as it is now.
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <PaymentForm {...props} />}
    </Dialog>
  );
}

function PaymentForm({ mode, invoice, onOpenChange, onRecorded }: PaymentDialogProps) {
  const isRefund = mode === "refund";
  const [amount, setAmount] = useState(isRefund ? "" : amountInput(invoice.balance));
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(() => clinicDateKey());
  const [time, setTime] = useState(() => clinicTimeInput(new Date()));
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const check = isRefund ? checkRefundAmount(amount, invoice.amountPaid) : checkPaymentAmount(amount, invoice.balance);
  const reasonError = isRefund && !reason.trim() ? "A reason is required for refunds" : null;
  const dateMissing = !date ? "Pick the date it was received" : null;
  const valid = !check.error && !reasonError && !dateMissing && !dateError;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid || check.amount === null || saving) return;
    setSaving(true);
    setServerError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: isRefund ? -check.amount : check.amount,
          method,
          reference: reference.trim() || null,
          receivedAt: clinicInstantFromInputs(date, time || "00:00").toISOString(),
          notes: notes.trim() || null,
          ...(isRefund ? { refundReason: reason.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setServerError(errorMessage(data?.error, data));
        if (data?.error === "overpayment" && typeof data.balance === "number") setAmount(amountInput(data.balance));
        return;
      }
      const payment = data.payment as InvoicePayment;
      toast.success(`${isRefund ? "Refund" : "Payment"} of ${formatMYR(Math.abs(payment.amount))} recorded — ${payment.receiptNumber}`, {
        action: {
          label: "Receipt",
          onClick: () => window.open(`/api/invoices/${invoice.id}/payments/${payment.id}/receipt`, "_blank", "noopener"),
        },
      });
      onRecorded({ invoice: data.invoice as InvoiceDetail, payment });
      onOpenChange(false);
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const showAmountError = (touched || amount !== "") && check.error;

  return (
    <DialogContent className="gap-0 rounded-surface p-0 sm:max-w-md">
      <DialogHeader className="border-b border-border px-5 py-4">
        <DialogTitle className="text-[18px] font-medium text-foreground">{isRefund ? "Refund" : "Record payment"}</DialogTitle>
        <DialogDescription className="text-[14px] text-fg-secondary">
          {invoice.invoiceNumber} ·{" "}
          {isRefund ? `${formatMYR(invoice.amountPaid)} paid so far` : `${formatMYR(invoice.balance)} outstanding`}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-4 px-5 py-4" noValidate>
        {serverError && (
          <p role="alert" className={ALERT_ERROR}>
            {serverError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pay-amount" className={FIELD_LABEL}>
              Amount (RM)
            </label>
            <input
              id="pay-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              aria-invalid={showAmountError ? true : undefined}
              className={cn(FIELD_INPUT, "tabular-nums", showAmountError && INVALID)}
              autoFocus
            />
            {showAmountError && <p className={FIELD_ERROR}>{check.error}</p>}
          </div>
          <div>
            <label htmlFor="pay-method" className={FIELD_LABEL}>
              {isRefund ? "Refunded by" : "Method"}
            </label>
            <select
              id="pay-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className={cn(FIELD_INPUT, "cursor-pointer")}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!isRefund && invoice.balance > 0 && (
          <p className="-mt-2 text-[13px] text-fg-secondary">
            Paying part now? Enter that amount — record the rest (another method or a later instalment) as a second payment.
          </p>
        )}

        <div>
          <label htmlFor="pay-reference" className={FIELD_LABEL}>
            Reference <span className="font-normal text-fg-secondary">(optional)</span>
          </label>
          <input
            id="pay-reference"
            value={reference}
            maxLength={100}
            onChange={(e) => setReference(e.target.value)}
            placeholder={REFERENCE_HINT[method] ?? "Receipt book no., note to self"}
            className={FIELD_INPUT}
          />
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label htmlFor="pay-date" className={FIELD_LABEL}>
              Received on
            </label>
            <DateInput
              id="pay-date"
              value={date}
              onChange={setDate}
              onErrorChange={setDateError}
              max={clinicDateKey()}
              inputClassName={FIELD_INPUT}
            />
            {touched && dateMissing && !dateError && <p className={FIELD_ERROR}>{dateMissing}</p>}
          </div>
          <div>
            <label htmlFor="pay-time" className={FIELD_LABEL}>
              Time
            </label>
            <input id="pay-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={cn(FIELD_INPUT, "w-28")} />
          </div>
        </div>

        {isRefund && (
          <div>
            <label htmlFor="pay-reason" className={FIELD_LABEL}>
              Reason
            </label>
            <textarea
              id="pay-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Session cancelled — refunded to card"
              aria-invalid={touched && reasonError ? true : undefined}
              className={cn(FIELD_TEXTAREA, touched && reasonError && INVALID)}
            />
            {touched && reasonError && <p className={FIELD_ERROR}>{reasonError}</p>}
          </div>
        )}

        <div>
          <label htmlFor="pay-notes" className={FIELD_LABEL}>
            Notes <span className="font-normal text-fg-secondary">(optional)</span>
          </label>
          <textarea
            id="pay-notes"
            rows={2}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={FIELD_TEXTAREA}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => onOpenChange(false)} className={BTN_SECONDARY} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className={cn(BTN_PRIMARY, isRefund && "bg-danger hover:bg-danger")}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
            {isRefund ? "Record refund" : "Record payment"}
          </button>
        </div>
      </form>
    </DialogContent>
  );
}
