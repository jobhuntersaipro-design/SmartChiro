"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAppointmentDateTime } from "@/lib/format";

interface Props {
  appointmentId: string | null;
  patientName: string;
  appointmentDateTime: string | null;
  onClose: () => void;
  onCancelled: () => void;
}

export function CancelAppointmentDialog({
  appointmentId,
  patientName,
  appointmentDateTime,
  onClose,
  onCancelled,
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
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `Cancel failed (${res.status})`);
        return;
      }
      onCancelled();
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
        className="w-[440px] rounded-[8px] border border-[#e5edf5] bg-white p-6"
        style={{ boxShadow: "0 12px 40px rgba(18,42,66,0.15)" }}
      >
        <h2 className="text-[18px] font-medium text-[#0A2540] mb-2">Cancel appointment?</h2>
        <p className="text-[14px] text-[#425466] mb-1">
          {patientName}&apos;s appointment{appointmentDateTime ? " on" : ""}
          {appointmentDateTime && (
            <>
              {" "}
              <span className="font-medium text-[#061b31]">
                {formatAppointmentDateTime(appointmentDateTime)}
              </span>
            </>
          )}{" "}
          will be cancelled.
        </p>
        <p className="text-[13px] text-[#64748d] mb-5">
          Pending reminders will be removed. To restore, create a new appointment.
        </p>

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
            Keep appointment
          </Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className="h-8 rounded-[4px] text-[14px] bg-[#DF1B41] hover:bg-[#b3162f] gap-1.5"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
            {submitting ? "Cancelling…" : "Cancel appointment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
