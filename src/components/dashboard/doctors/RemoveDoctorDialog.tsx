"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DoctorListItem } from "@/types/doctor";

interface RemoveDoctorDialogProps {
  doctor: DoctorListItem | null;
  branchId: string | null;
  branchName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: () => void;
}

export function RemoveDoctorDialog({
  doctor,
  branchId,
  branchName,
  open,
  onOpenChange,
  onRemoved,
}: RemoveDoctorDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!doctor) return null;

  async function handleRemove() {
    if (!doctor) return;
    setLoading(true);
    setError(null);

    try {
      const url = branchId
        ? `/api/doctors/${doctor.id}?branchId=${branchId}`
        : `/api/doctors/${doctor.id}`;

      const res = await fetch(url, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to remove doctor");
        return;
      }

      onOpenChange(false);
      onRemoved();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const hasPatients = doctor.stats.patientCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] rounded-[8px]">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-light text-[#061b31]">
            Remove Doctor
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-[14px] text-[#273951]">
            Are you sure you want to remove{" "}
            <span className="font-medium">{doctor.name ?? doctor.email}</span>
            {branchName ? (
              <>
                {" "}
                from <span className="font-medium">{branchName}</span>?
              </>
            ) : (
              " from all your branches?"
            )}
          </p>

          <p className="text-[13px] text-[#64748d]">
            This will unassign them from {branchName ? "this branch" : "your branches"} but
            won&apos;t delete their account.
          </p>

          {hasPatients && (
            <div className="flex items-start gap-2 rounded-[4px] bg-[#FFF8E1] px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-[#9b6829] shrink-0 mt-0.5" />
              <p className="text-[13px] text-[#9b6829]">
                {doctor.stats.patientCount} patient
                {doctor.stats.patientCount > 1 ? "s are" : " is"} currently
                assigned to this doctor and will need to be reassigned.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-[4px] bg-[#FEF2F4] px-3 py-2 text-[13px] text-[#df1b41]">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-[4px] text-[14px]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleRemove}
            disabled={loading}
            className="h-9 rounded-[4px] bg-[#df1b41] hover:bg-[#c4183c] text-white text-[14px] font-medium px-4"
          >
            {loading ? "Removing..." : "Remove Doctor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
