"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2, AlertTriangle } from "lucide-react";
import type { Visit } from "@/types/visit";

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

  const visitDate = new Date(visit.visitDate).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" onClick={handleClose} />

      <div
        className="relative z-10 w-full max-w-[420px] rounded-[6px] border border-[#e5edf5] bg-white animate-in fade-in zoom-in-95 duration-200"
        style={{
          boxShadow:
            "rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px",
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5edf5]">
          <h2 className="text-[18px] font-light text-[#061b31]">Delete Visit</h2>
          <button
            onClick={handleClose}
            className="flex items-center justify-center h-7 w-7 rounded-[4px] text-[#64748d] transition-colors hover:bg-[#f6f9fc] hover:text-[#061b31]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-start gap-3 rounded-[4px] bg-[#FDE8EC] px-3 py-2.5 mb-4">
            <AlertTriangle className="h-4 w-4 text-[#DF1B41] mt-0.5 shrink-0" strokeWidth={1.5} />
            <p className="text-[13px] text-[#DF1B41]">
              This will permanently delete this visit and its recovery questionnaire. This action cannot be undone.
            </p>
          </div>

          <p className="text-[14px] text-[#273951]">
            Are you sure you want to delete the visit on{" "}
            <span className="font-medium text-[#061b31]">{visitDate}</span>?
          </p>
          {visit.chiefComplaint && (
            <p className="text-[13px] text-[#64748d] mt-2 italic">&ldquo;{visit.chiefComplaint}&rdquo;</p>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-[4px] border border-[#DF1B41]/20 bg-[#FDE8EC] px-3 py-2 text-[13px] text-[#DF1B41] mt-4">
              <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#e5edf5]">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={deleting}
            className="rounded-[4px] border-[#e5edf5] text-[#273951] hover:bg-[#f6f9fc]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-[4px] bg-[#DF1B41] text-white hover:bg-[#c41637]"
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
