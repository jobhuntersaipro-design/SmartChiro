"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2, AlertTriangle } from "lucide-react";
import type { Visit } from "@/types/visit";
import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";

interface DeleteVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  visit: Visit | null;
  onDeleted: () => void;
}

export function DeleteVisitDialog({ open, onOpenChange, patientId, visit, onDeleted }: DeleteVisitDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No deps array: always call the current render's handleClose.
  useEffect(() => {
    if (!open || !visit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!open || !visit) return null;

  function handleClose() {
    setError(null);
    onOpenChange(false);
  }

  async function handleDelete() {
    if (!visit) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/visits/${visit.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete visit");
      }
      handleClose();
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete visit");
    } finally {
      setDeleting(false);
    }
  }

  const visitDate = new Date(visit.visitDate).toLocaleDateString("en-MY", { timeZone: CLINIC_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" onClick={handleClose} />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-visit-title"
        className="relative z-10 w-full max-w-105 rounded-panel border border-border bg-white animate-in fade-in zoom-in-95 duration-200"
        style={{
          boxShadow:
            "rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px",
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 id="delete-visit-title" className="text-[18px] font-medium text-foreground">Delete Visit</h2>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="flex items-center justify-center h-7 w-7 rounded-md text-fg-secondary transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-start gap-3 rounded-md bg-danger-subtle px-3 py-2.5 mb-4">
            <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" strokeWidth={1.5} />
            <p className="text-[13px] text-danger">
              This will permanently delete this visit and its recovery questionnaire. This action cannot be undone.
            </p>
          </div>

          <p className="text-[14px] text-foreground">
            Are you sure you want to delete the visit on{" "}
            <span className="font-medium text-foreground">{visitDate}</span>?
          </p>
          {visit.chiefComplaint && (
            <p className="text-[13px] text-fg-secondary mt-2 italic">&ldquo;{visit.chiefComplaint}&rdquo;</p>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-danger/20 bg-danger-subtle px-3 py-2 text-[13px] text-danger mt-4">
              <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={deleting}
            className="rounded-md border-border text-foreground hover:bg-surface-muted"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md bg-danger text-white hover:bg-danger"
          >
            {deleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete Visit"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
