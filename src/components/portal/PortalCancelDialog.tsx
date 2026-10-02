"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PortalAppointment } from "@/types/portal";
import { portalDay, portalTime } from "@/components/portal/portal-format";
import { ALERT_ERROR, BTN_SECONDARY, LABEL } from "@/components/portal/styles";

interface Props {
  appointment: PortalAppointment | null;
  onClose: () => void;
  onCancelled: () => Promise<void>;
}

const ERRORS: Record<string, string> = {
  too_late: "It's too close to your appointment to cancel online. Please call the clinic.",
  not_cancellable: "This appointment can no longer be cancelled online.",
  not_found: "We couldn't find that appointment.",
};

/** Confirm a portal cancellation, with an optional reason for the clinic. */
export function PortalCancelDialog({ appointment, onClose, onCancelled }: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setError(null);
  }, [appointment?.id]);

  async function confirm() {
    if (!appointment) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/appointments/${encodeURIComponent(appointment.id)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(ERRORS[body?.error as string] ?? "Couldn't cancel. Please try again or call the clinic.");
        return;
      }
      await onCancelled();
    } catch {
      setError("Couldn't reach the clinic's system. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!appointment} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="gap-0 rounded-surface bg-white p-5 sm:max-w-md" showCloseButton={false}>
        <DialogTitle className="text-[18px] font-medium text-foreground">Cancel this appointment?</DialogTitle>
        {appointment && (
          <DialogDescription className="mt-2 text-[15px] text-fg-secondary">
            {appointment.treatment} with {appointment.doctorName} on {portalDay(appointment.dateTime)} at{" "}
            {portalTime(appointment.dateTime)} (Malaysia time), {appointment.branch.name}.
          </DialogDescription>
        )}
        <div className="mt-4">
          <label htmlFor="portal-cancel-reason" className={LABEL}>
            Reason <span className="font-normal text-fg-muted">(optional)</span>
          </label>
          <textarea
            id="portal-cancel-reason"
            value={reason}
            maxLength={300}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
            className="w-full resize-none rounded-control border border-border bg-surface-muted px-3 py-2 text-[16px] text-foreground focus:border-brand focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        {error && (
          <p role="alert" className={`${ALERT_ERROR} mt-3`}>
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>
            Keep appointment
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-control bg-danger px-4 text-[15px] font-medium text-white transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Cancel appointment
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
