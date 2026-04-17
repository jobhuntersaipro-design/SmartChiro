"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus, Users, ImageIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { BranchMemberDetail } from "@/types/branch";
import type { BranchRole } from "@prisma/client";
import { ManageDoctorsSheet } from "../owner/ManageDoctorsSheet";

interface BranchDoctorsTabProps {
  branchId: string;
  members: BranchMemberDetail[];
  userRole: string;
  onRefresh: () => Promise<void>;
}

export function BranchDoctorsTab({ branchId, members, userRole, onRefresh }: BranchDoctorsTabProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const canManage = userRole === "OWNER" || userRole === "ADMIN";

  // ManageDoctorsSheet needs members in a specific format
  const sheetMembers = members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.name,
    email: m.email,
    role: m.role as BranchRole,
    joinedAt: m.joinedAt,
  }));

  async function handleAddDoctor(
    bId: string,
    email: string,
    role: BranchRole
  ): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`/api/branches/${bId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.error };
    }
    await onRefresh();
    return { success: true };
  }

  async function handleRemoveDoctor(bId: string, memberId: string) {
    await fetch(`/api/branches/${bId}/members/${memberId}`, { method: "DELETE" });
    await onRefresh();
  }

  async function handleChangeRole(bId: string, memberId: string, role: BranchRole) {
    await fetch(`/api/branches/${bId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    await onRefresh();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-normal text-[#061b31]">
          Doctors ({members.length})
        </h3>
        {canManage && (
          <Button
            onClick={() => setSheetOpen(true)}
            size="sm"
            className="h-8 px-3 bg-[#533afd] hover:bg-[#4434d4] text-white rounded-[4px] text-[14px] font-medium cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
            Add Doctor
          </Button>
        )}
      </div>

      {/* Doctor cards */}
      {members.length === 0 ? (
        <div className="py-12 text-center">
          <Users className="h-10 w-10 mx-auto text-[#e5edf5] mb-2" strokeWidth={1} />
          <p className="text-[15px] text-[#64748d]">No doctors in this branch yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((member) => {
            const initials = (member.name ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2);
            const isOwnerMember = member.role === "OWNER";

            return (
              <div
                key={member.id}
                className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4 transition-all duration-200 hover:border-[#c1c9d2]"
                style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[13px] font-medium">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-medium text-[#061b31]">
                          {member.name ?? member.email}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            isOwnerMember
                              ? "bg-[#ededfc] text-[#533afd]"
                              : member.role === "ADMIN"
                              ? "bg-[#E8F4FD] text-[#0570DE]"
                              : "bg-[#F0F3F7] text-[#64748d]"
                          }`}
                        >
                          {member.role}
                        </span>
                      </div>
                      <p className="text-[13px] text-[#64748d]">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Stats */}
                    <div className="hidden sm:flex items-center gap-4 text-[13px] text-[#64748d]">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {member.patientCount ?? 0} patients
                      </span>
                      <span className="flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {member.xrayCountThisMonth ?? 0} X-rays
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/doctors/${member.userId}`}
                        className="text-[13px] text-[#533afd] hover:text-[#4434d4] font-medium"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View Profile
                      </Link>
                      {canManage && !isOwnerMember && (
                        <button
                          onClick={async () => {
                            await handleRemoveDoctor(branchId, member.id);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[#64748d] hover:bg-[#FEF2F4] hover:text-[#DF1B41] transition-colors cursor-pointer"
                          title="Remove doctor"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Joined date */}
                <p className="text-[12px] text-[#c1c9d2] mt-2">
                  Joined {new Date(member.joinedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Doctor Sheet */}
      <ManageDoctorsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        branchName=""
        branchId={branchId}
        members={sheetMembers}
        onAddDoctor={handleAddDoctor}
        onRemoveDoctor={handleRemoveDoctor}
        onChangeRole={handleChangeRole}
      />
    </div>
  );
}
