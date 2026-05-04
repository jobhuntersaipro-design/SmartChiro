"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAppointmentDateOnly } from "@/lib/format";

interface IssueInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: {
    id: string;
    dateTime: string;
    suggestedAmount?: number | null;
  } | null;
  onIssued: () => void;
}

export function IssueInvoiceDialog({
  open,
  onOpenChange,
  appointment,
  onIssued,
}: IssueInvoiceDialogProps) {
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [dueDays, setDueDays] = useState<string>("14");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && appointment) {
      setAmount(
        appointment.suggestedAmount != null
          ? String(appointment.suggestedAmount)
          : "",
      );
      const dateLabel =
        formatAppointmentDateOnly(appointment.dateTime) ?? "session";
      setDescription(`Treatment session — ${dateLabel}`);
      setDueDays("14");
      setError(null);
    }
  }, [open, appointment]);

  if (!open || !appointment) return null;

  const amountNum = parseFloat(amount);
  const dueDaysNum = parseInt(dueDays, 10);
  const valid =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    Number.isFinite(dueDaysNum) &&
    dueDaysNum >= 0 &&
    description.trim().length > 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!appointment || !valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const lineItem = {
        description: description.trim(),
        quantity: 1,
        unitPrice: amountNum,
        total: amountNum,
      };
      const res = await fetch(
        `/api/appointments/${appointment.id}/invoice`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amountNum,
            dueDays: dueDaysNum,
            lineItems: [lineItem],
          }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        const code = data?.error ?? "unknown";
        setError(humanizeError(code));
        return;
      }
      onIssued();
      onOpenChange(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="issue-invoice-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onOpenChange(false);
      }}
    >
      <div
        className="w-full max-w-md rounded-[8px] bg-white shadow-xl border border-[#e5edf5] overflow-hidden"
        style={{
          boxShadow:
            "0 4px 6px rgba(0,0,0,0.04), 0 8px 24px rgba(18,42,66,0.08)",
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5edf5]">
          <h2
            id="issue-invoice-title"
            className="text-[16px] font-semibold text-[#061b31]"
          >
            Issue invoice
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onOpenChange(false)}
            className="text-[#94a3b8] hover:text-[#061b31] cursor-pointer transition-colors duration-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSave} className="px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-[4px] border border-[#fcd0db] bg-[#fef2f5] px-3 py-2 text-[13px] text-[#ea2261]">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="invoice-amount"
              className="block text-[13px] font-medium text-[#273951] mb-1"
            >
              Amount (RM)
            </label>
            <input
              id="invoice-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full h-9 rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[14px] text-[#061b31] tabular-nums placeholder:text-[#94a3b8] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-colors duration-200"
            />
          </div>

          <div>
            <label
              htmlFor="invoice-desc"
              className="block text-[13px] font-medium text-[#273951] mb-1"
            >
              Description
            </label>
            <input
              id="invoice-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              className="w-full h-9 rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[14px] text-[#061b31] placeholder:text-[#94a3b8] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-colors duration-200"
            />
          </div>

          <div>
            <label
              htmlFor="invoice-due"
              className="block text-[13px] font-medium text-[#273951] mb-1"
            >
              Due in (days)
            </label>
            <input
              id="invoice-due"
              type="number"
              min="0"
              step="1"
              value={dueDays}
              onChange={(e) => setDueDays(e.target.value)}
              className="w-full h-9 rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[14px] text-[#061b31] tabular-nums focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-colors duration-200"
            />
          </div>
        </form>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#e5edf5] bg-[#fafbfd]">
          <Button
            variant="outline"
            type="button"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-[4px] text-[14px] border-[#e5edf5] cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || !valid}
            className="h-9 rounded-[4px] text-[14px] bg-[#533afd] hover:bg-[#3f2bd1] text-white cursor-pointer disabled:opacity-60"
          >
            {submitting && (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            )}
            Issue invoice
          </Button>
        </div>
      </div>
    </div>
  );
}

function humanizeError(code: string): string {
  switch (code) {
    case "appointment_not_completed":
      return "Only COMPLETED appointments can be invoiced.";
    case "forbidden":
      return "You don't have permission to issue invoices.";
    case "not_found":
      return "Appointment not found.";
    case "unauthorized":
      return "Session expired. Please sign in again.";
    default:
      return "Couldn't issue invoice. Please try again.";
  }
}
