"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface DeleteBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchName: string;
  branchId: string;
  onConfirm: (branchId: string) => Promise<void>;
}

export function DeleteBranchDialog({
  open,
  onOpenChange,
  branchName,
  branchId,
  onConfirm,
}: DeleteBranchDialogProps) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await onConfirm(branchId);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] rounded-[6px] border border-[#e5edf5]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FEF2F4]">
              <AlertTriangle className="h-5 w-5 text-[#DF1B41]" strokeWidth={1.5} />
            </div>
            <DialogTitle className="text-[16px] font-medium text-[#061b31]">
              Delete Branch
            </DialogTitle>
          </div>
          <DialogDescription className="text-[14px] text-[#64748d]">
            Are you sure you want to delete <strong className="text-[#061b31]">{branchName}</strong>?
            This will permanently remove all associated data including patients, appointments, and X-rays.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="rounded-[4px] border-[#e5edf5] text-[14px] cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={loading}
            className="rounded-[4px] bg-[#DF1B41] hover:bg-[#c01836] text-white text-[14px] cursor-pointer"
          >
            {loading ? "Deleting..." : "Delete Branch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
