"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { Patient } from "@/types/patient";

interface DeletePatientDialogProps {
  patient: Patient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (patientId: string) => Promise<void>;
}

export function DeletePatientDialog({ patient, open, onOpenChange, onDelete }: DeletePatientDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Type-to-confirm: this cascades to every visit, X-ray and invoice.
  const [typed, setTyped] = useState("");
  const [shownFor, setShownFor] = useState<string | null>(null);
  const current = open && patient ? patient.id : null;
  if (current !== shownFor) {
    setShownFor(current);
    setTyped("");
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open || !patient) return null;

  const fullName = `${patient.firstName} ${patient.lastName}`;
  const confirmed = typed.trim().toLowerCase() === fullName.toLowerCase();

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete(patient!.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete patient");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]" onClick={() => onOpenChange(false)} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-patient-title"
        className="relative z-10 w-full max-w-110 rounded-2xl border border-border bg-white p-6 animate-in fade-in zoom-in-95 duration-200"
        style={{ boxShadow: "rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="delete-patient-title" className="text-[18px] font-light text-foreground">Delete Patient</h2>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="flex items-center justify-center h-7 w-7 rounded-md text-fg-secondary transition-all duration-200 hover:bg-surface-muted hover:text-foreground hover:scale-110 hover:rotate-90 active:scale-95"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <p className="text-[15px] text-foreground mb-4">
          Are you sure you want to delete <span className="font-medium text-foreground">{fullName}</span>?
        </p>

        <p className="text-[13px] text-fg-secondary mb-3">
          This action cannot be undone. All associated data will be permanently removed:
        </p>

        <div className="space-y-2 mb-5">
          {patient.totalVisits > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-warning-subtle px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" strokeWidth={1.5} />
              <span className="text-[13px] text-warning">{patient.totalVisits} visit{patient.totalVisits !== 1 ? "s" : ""}</span>
            </div>
          )}
          {patient.totalXrays > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-warning-subtle px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" strokeWidth={1.5} />
              <span className="text-[13px] text-warning">{patient.totalXrays} X-ray{patient.totalXrays !== 1 ? "s" : ""} with annotations</span>
            </div>
          )}
        </div>

        <label htmlFor="delete-patient-confirm" className="mb-1 block text-[13px] text-fg-secondary">
          Type <span className="font-medium text-foreground">{fullName}</span> to confirm
        </label>
        <input
          id="delete-patient-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="mb-4 h-9 w-full rounded-control border border-border bg-surface-muted px-3 text-[15px] focus:border-danger focus:bg-white focus:outline-none focus:ring-1 focus:ring-danger"
        />

        {error && (
          <div className="mb-4 rounded-md border border-danger/20 bg-danger-subtle px-3 py-2">
            <p className="text-[13px] text-danger">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-8 px-3 text-[15px] font-medium rounded-md border-border text-foreground hover:bg-surface-muted"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={deleting || !confirmed}
            className="h-8 px-3 text-[15px] font-medium rounded-md bg-danger hover:bg-danger/90 text-white transition-all duration-200"
          >
            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Delete Patient
          </Button>
        </div>
      </div>
    </div>
  );
}
