"use client";

import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the dialog re-opens or switches to a different branch
  useEffect(() => {
    if (open) {
      setConfirmText("");
      setError(null);
    }
  }, [open, branchName]);

  const matches = confirmText.trim() === branchName.trim() && branchName.trim() !== "";
  const showMismatch = confirmText.length > 0 && !matches;

  async function handleDelete() {
    if (!matches) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm(branchId);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete branch");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] rounded-[6px] border border-[#e5edf5]">
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
            This will permanently remove <strong className="text-[#061b31]">{branchName}</strong>{" "}
            and all associated data — patients, visits, appointments, X-rays, and invoices.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="pt-1">
          <label className="block text-[13px] text-[#273951] mb-1.5">
            Type{" "}
            <span className="font-mono text-[#061b31] bg-[#F6F9FC] border border-[#e5edf5] rounded-[3px] px-1.5 py-0.5">
              {branchName}
            </span>{" "}
            to confirm
          </label>
          <Input
            value={confirmText}
            onChange={(e) => {
              setConfirmText(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches && !loading) handleDelete();
            }}
            placeholder={branchName}
            autoFocus
            disabled={loading}
            aria-invalid={showMismatch}
            className={`h-9 rounded-[4px] text-[14px] focus:ring-1 transition-all duration-200 ${
              showMismatch
                ? "border-[#df1b41] bg-[#FDE8EC]/30 focus:ring-[#df1b41] focus:border-[#df1b41]"
                : "border-[#e5edf5] bg-[#F6F9FC] focus:ring-[#df1b41] focus:border-[#df1b41]"
            }`}
          />
          {showMismatch && (
            <p className="text-[12px] text-[#df1b41] mt-1">Branch name doesn&apos;t match.</p>
          )}
          {error && (
            <p className="text-[12px] text-[#df1b41] mt-1">{error}</p>
          )}
        </div>

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
            disabled={loading || !matches}
            className="rounded-[4px] bg-[#DF1B41] hover:bg-[#c01836] text-white text-[14px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Deleting..." : "Delete Branch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
