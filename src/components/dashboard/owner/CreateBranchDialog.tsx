"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface CreateBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateBranch: (data: { name: string; address: string; phone: string; email: string }) => Promise<void>;
}

export function CreateBranchDialog({
  open,
  onOpenChange,
  onCreateBranch,
}: CreateBranchDialogProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Branch name is required");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await onCreateBranch({ name: name.trim(), address, phone, email });
      setName("");
      setAddress("");
      setPhone("");
      setEmail("");
      onOpenChange(false);
    } catch {
      setError("Failed to create branch. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] rounded-[8px] border border-[#e5edf5]">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-light tracking-[-0.18px] text-[#061b31]">
            Create Branch
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label className="block text-[14px] font-medium text-[#273951] mb-1.5">
              Branch Name <span className="text-[#df1b41]">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SmartChiro KL"
              className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[15px] focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-[14px] font-medium text-[#273951] mb-1.5">
              Address
            </label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Branch address"
              className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[15px] focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[14px] font-medium text-[#273951] mb-1.5">
                Phone
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[15px] focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-[14px] font-medium text-[#273951] mb-1.5">
                Email
              </label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Branch email"
                type="email"
                className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[15px] focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] focus:bg-white"
              />
            </div>
          </div>

          {error && (
            <p className="text-[14px] text-[#df1b41]">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-9 px-4 rounded-[4px] border-[#e5edf5] text-[14px] text-[#061b31] cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-9 px-4 bg-[#533afd] hover:bg-[#4434d4] text-white rounded-[4px] text-[14px] font-medium cursor-pointer disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
