"use client";

import { useState } from "react";
import { X, UserPlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { BranchRole } from "@prisma/client";

interface DoctorMember {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: BranchRole;
  joinedAt: string;
}

interface ManageDoctorsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchName: string;
  branchId: string;
  members: DoctorMember[];
  onAddDoctor: (branchId: string, email: string, role: BranchRole) => Promise<{ success: boolean; error?: string }>;
  onRemoveDoctor: (branchId: string, memberId: string) => Promise<void>;
  onChangeRole: (branchId: string, memberId: string, role: BranchRole) => Promise<void>;
}

export function ManageDoctorsSheet({
  open,
  onOpenChange,
  branchName,
  branchId,
  members,
  onAddDoctor,
  onRemoveDoctor,
  onChangeRole,
}: ManageDoctorsSheetProps) {
  const [searchEmail, setSearchEmail] = useState("");
  const [addRole, setAddRole] = useState<BranchRole>("DOCTOR");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  async function handleAdd() {
    if (!searchEmail.trim()) return;
    setAddLoading(true);
    setAddError("");
    const result = await onAddDoctor(branchId, searchEmail.trim(), addRole);
    if (!result.success) {
      setAddError(result.error ?? "Failed to add doctor");
    } else {
      setSearchEmail("");
      setShowAddForm(false);
    }
    setAddLoading(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:max-w-[420px] border-l border-[#e5edf5] p-0">
        <SheetHeader className="px-5 py-4 border-b border-[#e5edf5]">
          <SheetTitle className="text-[16px] font-light text-[#061b31]">
            Manage Doctors — {branchName}
          </SheetTitle>
        </SheetHeader>

        <div className="px-5 py-4">
          {/* Add Doctor */}
          {!showAddForm ? (
            <Button
              onClick={() => setShowAddForm(true)}
              variant="outline"
              className="w-full h-9 rounded-[4px] border-[#e5edf5] text-[14px] text-[#533afd] hover:bg-[#ededfc] cursor-pointer mb-4"
            >
              <UserPlus className="h-3.5 w-3.5 mr-2" strokeWidth={1.5} />
              Add Doctor
            </Button>
          ) : (
            <div className="mb-4 p-3 rounded-[6px] border border-[#e5edf5] bg-[#F6F9FC]">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#64748d]" strokeWidth={2} />
                <Input
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  placeholder="Search by email..."
                  className="h-8 pl-8 rounded-[4px] border-[#e5edf5] bg-white text-[14px]"
                />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as BranchRole)}
                  className="h-8 rounded-[4px] border border-[#e5edf5] bg-white px-2 text-[14px] text-[#061b31] cursor-pointer"
                >
                  <option value="DOCTOR">Doctor</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <Button
                  onClick={handleAdd}
                  disabled={addLoading || !searchEmail.trim()}
                  size="sm"
                  className="h-8 px-3 bg-[#533afd] hover:bg-[#4434d4] text-white rounded-[4px] text-[13px] cursor-pointer disabled:opacity-50"
                >
                  {addLoading ? "Adding..." : "Add"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAddForm(false);
                    setAddError("");
                  }}
                  className="h-8 px-2 text-[#64748d] cursor-pointer"
                >
                  Cancel
                </Button>
              </div>
              {addError && (
                <p className="text-[13px] text-[#df1b41]">{addError}</p>
              )}
            </div>
          )}

          {/* Members list */}
          <div className="space-y-0">
            {members.length === 0 ? (
              <p className="text-center text-[14px] text-[#64748d] py-8">
                No doctors in this branch yet.
              </p>
            ) : (
              members.map((member) => {
                const initials = (member.name ?? member.email)
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 py-3 border-b border-[#e5edf5] last:border-b-0"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[12px] font-medium">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-[#061b31] truncate">
                        {member.name ?? member.email}
                      </div>
                      <div className="text-[13px] text-[#64748d] truncate">
                        {member.email}
                      </div>
                    </div>
                    {member.role !== "OWNER" ? (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          onChangeRole(branchId, member.id, e.target.value as BranchRole)
                        }
                        className="h-7 rounded-[4px] border border-[#e5edf5] bg-white px-2 text-[13px] text-[#273951] cursor-pointer"
                      >
                        <option value="DOCTOR">Doctor</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-[#ededfc] px-2 py-0.5 text-[12px] font-medium text-[#533afd]">
                        Owner
                      </span>
                    )}
                    {member.role !== "OWNER" && (
                      <button
                        onClick={() => onRemoveDoctor(branchId, member.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[#64748d] hover:bg-[#FEF2F2] hover:text-[#df1b41] transition-colors cursor-pointer"
                        title="Remove from branch"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
