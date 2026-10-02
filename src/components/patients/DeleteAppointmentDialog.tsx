"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!appointmentId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [appointmentId, onClose]);

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
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-appointment-title"
        onClick={(e) => e.stopPropagation()}
        className="w-115 rounded-surface border border-border bg-white p-6"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-danger-subtle flex-shrink-0">
            <AlertTriangle className="h-4 w-4 text-danger" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h2 id="delete-appointment-title" className="text-[18px] font-medium text-foreground">
              Permanently delete appointment?
            </h2>
            <p className="text-[14px] text-fg-secondary mt-1">
              {patientName}&apos;s appointment{appointmentDateTime ? " on " : ""}
              {appointmentDateTime && (
                <span className="font-medium text-foreground">
                  {formatAppointmentDateTime(appointmentDateTime)}
                </span>
              )}
              .
            </p>
          </div>
        </div>

        <div className="rounded-panel bg-warning-subtle border border-warning/30 p-3 mb-5">
          <p className="text-[13px] text-warning leading-relaxed">
            This removes the row and all associated reminders.{" "}
            <strong className="font-semibold">It cannot be undone</strong> and will not appear in
            any audit log. Use <strong className="font-semibold">Cancel</strong> instead if you
            want to keep a record.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-danger">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="h-8 rounded-control text-[14px]"
          >
            Keep
          </Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className="h-8 rounded-control text-[14px] bg-danger hover:bg-danger/90 gap-1.5"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
            {submitting ? "Deleting…" : "Delete permanently"}
          </Button>
        </div>
      </div>
    </div>
  );
}
