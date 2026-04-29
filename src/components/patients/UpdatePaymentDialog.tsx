"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";
import type { Visit, InvoiceStatus, PaymentMethod } from "@/types/visit";
import { PAYMENT_METHOD_LABELS } from "@/types/visit";

const inputClass =
  "flex h-9 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[15px] text-[#061b31] placeholder:text-[#a3acb9] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all";
const selectClass =
  "flex h-9 w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[15px] text-[#061b31] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-colors appearance-none cursor-pointer";
const textareaClass =
  "flex w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 py-2 text-[15px] text-[#061b31] placeholder:text-[#a3acb9] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-all resize-none";

const STATUSES: { value: InvoiceStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft (Unpaid)" },
  { value: "SENT", label: "Sent" },
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "CANCELLED", label: "Cancelled" },
];

const METHODS = (Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([v, l]) => ({
  value: v,
  label: l,
}));

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  patientId: string;
  visit: Visit | null;
  onSaved: () => void;
}

export function UpdatePaymentDialog({ open, onOpenChange, patientId, visit, onSaved }: Props) {
  const [status, setStatus] = useState<InvoiceStatus>("DRAFT");
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !visit) return;
    setStatus(visit.invoice?.status ?? "DRAFT");
    setAmount(visit.invoice ? String(visit.invoice.amount) : "");
    setMethod((visit.invoice?.paymentMethod ?? "CASH") as PaymentMethod);
    setNotes(visit.invoice?.notes ?? "");
    setError(null);
  }, [open, visit]);

  if (!open || !visit) return null;

  async function handleSubmit(e: React.FormEvent) {
    if (!visit) return;
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const numAmt = amount === "" ? null : Number(amount);
      if (numAmt != null && (!Number.isFinite(numAmt) || numAmt < 0)) {
        throw new Error("Amount must be a non-negative number");
      }
      const body: Record<string, unknown> = {
        status,
        notes: notes || null,
      };
      if (numAmt != null) body.amount = numAmt;
      if (status === "PAID") body.paymentMethod = method;

      const res = await fetch(`/api/patients/${patientId}/visits/${visit.id}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update payment");
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update payment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />
      <div
        className="relative z-10 w-full max-w-[480px] rounded-[6px] border border-[#e5edf5] bg-white"
        style={{ boxShadow: "rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px" }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5edf5]">
          <h2 className="text-[18px] font-light text-[#061b31]">Update Payment</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center h-7 w-7 rounded-[4px] text-[#64748d] hover:bg-[#f6f9fc] hover:text-[#061b31]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3">
          {visit.invoice && (
            <div className="rounded-[4px] bg-[#f6f9fc] px-3 py-2 text-[12px] text-[#64748d]">
              Invoice {visit.invoice.invoiceNumber}
            </div>
          )}

          <div>
            <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus)} className={selectClass}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Amount (MYR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="120.00"
              className={inputClass}
            />
            {!visit.invoice && (
              <p className="mt-1 text-[12px] text-[#64748d]">No invoice exists yet — required to create one.</p>
            )}
          </div>

          {status === "PAID" && (
            <div>
              <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Payment Method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={selectClass}>
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[13px] font-medium text-[#273951] mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional payment notes"
              className={textareaClass}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-[4px] border border-[#DF1B41]/20 bg-[#FDE8EC] px-3 py-2 text-[13px] text-[#DF1B41]">
              <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e5edf5]">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-[4px] border-[#e5edf5] text-[#273951] hover:bg-[#f6f9fc]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-[4px] bg-[#533afd] text-white hover:bg-[#4530d4]"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Payment"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
