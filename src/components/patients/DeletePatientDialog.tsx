"use client";

import { useState } from "react";
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

  if (!open || !patient) return null;

  const fullName = `${patient.firstName} ${patient.lastName}`;

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
        className="relative z-10 w-full max-w-[440px] rounded-[8px] border border-[#e5edf5] bg-white p-6 animate-in fade-in zoom-in-95 duration-200"
        style={{ boxShadow: "rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[18px] font-light text-[#061b31]">Delete Patient</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center h-7 w-7 rounded-[4px] text-[#64748d] transition-all duration-200 hover:bg-[#f6f9fc] hover:text-[#061b31] hover:scale-110 hover:rotate-90 active:scale-95"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <p className="text-[15px] text-[#273951] mb-4">
          Are you sure you want to delete <span className="font-medium text-[#061b31]">{fullName}</span>?
        </p>

        <p className="text-[13px] text-[#64748d] mb-3">
          This action cannot be undone. All associated data will be permanently removed:
        </p>

        <div className="space-y-2 mb-5">
          {patient.totalVisits > 0 && (
            <div className="flex items-center gap-2 rounded-[4px] bg-[#FFF8E1] px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-[#9b6829] shrink-0" strokeWidth={1.5} />
              <span className="text-[13px] text-[#9b6829]">{patient.totalVisits} visit{patient.totalVisits !== 1 ? "s" : ""}</span>
            </div>
          )}
          {patient.totalXrays > 0 && (
            <div className="flex items-center gap-2 rounded-[4px] bg-[#FFF8E1] px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-[#9b6829] shrink-0" strokeWidth={1.5} />
              <span className="text-[13px] text-[#9b6829]">{patient.totalXrays} X-ray{patient.totalXrays !== 1 ? "s" : ""} with annotations</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-[4px] border border-[#DF1B41]/20 bg-[#FDE8EC] px-3 py-2">
            <p className="text-[13px] text-[#DF1B41]">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-8 px-3 text-[15px] font-medium rounded-[4px] border-[#e5edf5] text-[#273951] hover:bg-[#f6f9fc]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={deleting}
            className="h-8 px-3 text-[15px] font-medium rounded-[4px] bg-[#df1b41] hover:bg-[#c4183c] text-white transition-all duration-200"
          >
            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Delete Patient
          </Button>
        </div>
      </div>
    </div>
  );
}
