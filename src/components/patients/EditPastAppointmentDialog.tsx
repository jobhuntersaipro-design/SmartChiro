"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PastAppointment } from "@/types/patient";

interface EditPastAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: PastAppointment | null;
  onSaved: () => void;
}

const STATUS_OPTIONS: { value: PastAppointment["status"]; label: string }[] = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "NO_SHOW", label: "No-show" },
  { value: "IN_PROGRESS", label: "In progress" },
];

const NOTES_MAX = 2000;

export function EditPastAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  onSaved,
}: EditPastAppointmentDialogProps) {
  const [status, setStatus] = useState<PastAppointment["status"]>("COMPLETED");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && appointment) {
      setStatus(appointment.status);
      setNotes(appointment.notes ?? "");
      setError(null);
    }
  }, [open, appointment]);

  if (!open || !appointment) return null;

  const dirty =
    status !== appointment.status || (notes ?? "") !== (appointment.notes ?? "");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!appointment || !dirty) {
      onOpenChange(false);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (status !== appointment.status) payload.status = status;
      if ((notes ?? "") !== (appointment.notes ?? "")) payload.notes = notes;
      const res = await fetch(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        const code = data?.error ?? "unknown";
        setError(humanizeError(code));
        return;
      }
      onSaved();
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
      aria-labelledby="edit-past-appt-title"
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
            id="edit-past-appt-title"
            className="text-[16px] font-semibold text-[#061b31]"
          >
            Edit appointment
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

          <fieldset>
            <legend className="block text-[13px] font-medium text-[#273951] mb-2">
              Status
            </legend>
            <div className="grid grid-cols-1 gap-1.5">
              {STATUS_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 px-3 py-2 rounded-[4px] border cursor-pointer transition-colors duration-200 ${
                    status === opt.value
                      ? "border-[#533afd] bg-[#f5f3ff]"
                      : "border-[#e5edf5] hover:bg-[#fafbfd]"
                  }`}
                >
                  <input
                    type="radio"
                    name="status"
                    value={opt.value}
                    checked={status === opt.value}
                    onChange={() => setStatus(opt.value)}
                    className="cursor-pointer accent-[#533afd]"
                  />
                  <span className="text-[14px] text-[#273951]">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="appt-notes"
              className="flex items-center justify-between text-[13px] font-medium text-[#273951] mb-1"
            >
              <span>Notes</span>
              <span className="text-[12px] text-[#94a3b8] tabular-nums">
                {notes.length}/{NOTES_MAX}
              </span>
            </label>
            <textarea
              id="appt-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
              rows={4}
              placeholder="Add notes about this appointment…"
              className="w-full rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 py-2 text-[14px] text-[#061b31] placeholder:text-[#94a3b8] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white transition-colors duration-200 resize-none"
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
            disabled={submitting || !dirty}
            className="h-9 rounded-[4px] text-[14px] bg-[#533afd] hover:bg-[#3f2bd1] text-white cursor-pointer disabled:opacity-60"
          >
            {submitting && (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            )}
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

function humanizeError(code: string): string {
  switch (code) {
    case "cannot_reschedule_past":
      return "Past appointments can't be rescheduled — only status and notes are editable.";
    case "forbidden":
      return "You don't have permission to edit this appointment.";
    case "not_found":
      return "Appointment not found.";
    case "unauthorized":
      return "Session expired. Please sign in again.";
    default:
      return "Couldn't save changes. Please try again.";
  }
}
