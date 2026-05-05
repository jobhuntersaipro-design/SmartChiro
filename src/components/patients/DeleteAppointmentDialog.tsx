"use client";

import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAppointmentDateTime } from "@/lib/format";

interface Props {
  appointmentId: string | null;
  patientName: string;
  appointmentDateTime: string | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteAppointmentDialog({
  appointmentId,
  patientName,
  appointmentDateTime,
  onClose,
  onDeleted,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!appointmentId) return null;

  async function submit() {
    if (!appointmentId) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 403 && body?.error === "doctors_must_cancel_not_delete") {
          setError(
            "Only branch owners and admins can permanently delete appointments. Use Cancel instead.",
          );
        } else {
          setError(body?.error ?? `Delete failed (${res.status})`);
        }
        return;
      }
      onDeleted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[460px] rounded-[8px] border border-[#e5edf5] bg-white p-6"
        style={{ boxShadow: "0 12px 40px rgba(18,42,66,0.15)" }}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FDE7EC] flex-shrink-0">
            <AlertTriangle className="h-4 w-4 text-[#DF1B41]" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[18px] font-medium text-[#0A2540]">
              Permanently delete appointment?
            </h2>
            <p className="text-[14px] text-[#425466] mt-1">
              {patientName}&apos;s appointment{appointmentDateTime ? " on " : ""}
              {appointmentDateTime && (
                <span className="font-medium text-[#061b31]">
                  {formatAppointmentDateTime(appointmentDateTime)}
                </span>
              )}
              .
            </p>
          </div>
        </div>

        <div className="rounded-[6px] bg-[#FFF8E1] border border-[#F5A623]/30 p-3 mb-5">
          <p className="text-[13px] text-[#9b6829] leading-relaxed">
            This removes the row and all associated reminders.{" "}
            <strong className="font-semibold">It cannot be undone</strong> and will not appear in
            any audit log. Use <strong className="font-semibold">Cancel</strong> instead if you
            want to keep a record.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-[4px] bg-[#FDE7EC] px-3 py-2 text-[13px] text-[#DF1B41]">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="h-8 rounded-[4px] text-[14px]"
          >
            Keep
          </Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className="h-8 rounded-[4px] text-[14px] bg-[#DF1B41] hover:bg-[#b3162f] gap-1.5"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
            {submitting ? "Deleting…" : "Delete permanently"}
          </Button>
        </div>
      </div>
    </div>
  );
}
