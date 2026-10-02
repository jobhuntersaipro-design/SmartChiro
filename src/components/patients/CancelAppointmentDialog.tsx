"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAppointmentDateTime } from "@/lib/format";
import { toast } from "sonner";
import { SeriesScopeChoice, type SeriesScope } from "@/components/packages/SeriesScope";
import { followingUpdatedMessage, patchFollowing } from "@/lib/series-client";

interface Props {
  appointmentId: string | null;
  patientName: string;
  appointmentDateTime: string | null;
  /** Series visits can cancel "this and following". */
  seriesId?: string | null;
  onClose: () => void;
  onCancelled: () => void;
}

export function CancelAppointmentDialog({
  appointmentId,
  patientName,
  appointmentDateTime,
  seriesId,
  onClose,
  onCancelled,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<SeriesScope>("one");

  useEffect(() => {
    setScope("one");
    setError(null);
  }, [appointmentId]);

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
      if (seriesId && scope === "following") {
        const result = await patchFollowing(appointmentId, { status: "CANCELLED" });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        toast.success(followingUpdatedMessage(result.count, true));
        onCancelled();
        onClose();
        return;
      }
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
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-appointment-title"
        onClick={(e) => e.stopPropagation()}
        className="w-110 rounded-2xl border border-border bg-white p-6"
        style={{ boxShadow: "0 12px 40px rgba(18,42,66,0.15)" }}
      >
        <h2 id="cancel-appointment-title" className="text-[18px] font-medium text-foreground mb-2">Cancel appointment?</h2>
        <p className="text-[14px] text-fg-secondary mb-1">
          {patientName}&apos;s appointment{appointmentDateTime ? " on" : ""}
          {appointmentDateTime && (
            <>
              {" "}
              <span className="font-medium text-foreground">
                {formatAppointmentDateTime(appointmentDateTime)}
              </span>
            </>
          )}{" "}
          will be cancelled.
        </p>
        <p className="text-[13px] text-fg-secondary mb-5">
          Pending reminders will be removed. To restore, create a new appointment.
        </p>

        {seriesId && (
          <div className="mb-5">
            <SeriesScopeChoice value={scope} onChange={setScope} verb="Cancel" name="cancel-appointment-scope" />
          </div>
        )}

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
            className="h-8 rounded-md text-[14px]"
          >
            Keep appointment
          </Button>
          <Button
            onClick={submit}
            disabled={submitting}
            className="h-8 rounded-md text-[14px] bg-danger hover:bg-danger/90 gap-1.5"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
            {submitting ? "Cancelling…" : "Cancel appointment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
