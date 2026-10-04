"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { UserPlus, Users, ImageIcon, Trash2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { BranchMemberDetail } from "@/types/branch";
import type { BranchRole } from "@prisma/client";
import { ManageDoctorsSheet } from "../owner/ManageDoctorsSheet";
import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";
import { roleLabel } from "@/lib/permissions";
import { plural } from "@/lib/format";

interface BranchDoctorsTabProps {
  branchId: string;
  branchName: string;
  members: BranchMemberDetail[];
  userRole: string;
  onRefresh: () => Promise<void>;
}

interface PendingInvite {
  id: string;
  role: BranchRole;
  name: string | null;
  email: string;
  sentAt: string;
}

export function BranchDoctorsTab({ branchId, branchName, members, userRole, onRefresh }: BranchDoctorsTabProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const canManage = userRole === "OWNER" || userRole === "ADMIN";

  const loadInvites = useCallback(async () => {
    if (!canManage) return;
    const res = await fetch(`/api/branches/${branchId}/invites`).catch(() => null);
    if (res?.ok) setInvites((await res.json()).invites);
  }, [branchId, canManage]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  async function withdraw(invite: PendingInvite) {
    const res = await fetch(`/api/branches/${branchId}/invites/${invite.id}`, { method: "DELETE" });
    if (!res.ok) toast.error((await res.json().catch(() => null))?.error ?? "Couldn't withdraw the invite.");
    else toast.success(`Invite to ${invite.email} withdrawn.`);
    await loadInvites();
  }

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
    if (res.status === 202) {
      toast.success(`Invitation sent to ${email}. They join once they accept.`);
      await loadInvites();
      return { success: true };
    }
    await onRefresh();
    return { success: true };
  }

  async function handleRemoveDoctor(bId: string, memberId: string) {
    const res = await fetch(`/api/branches/${bId}/members/${memberId}`, { method: "DELETE" });
    if (!res.ok) toast.error((await res.json().catch(() => null))?.error ?? "Couldn't remove them from the branch.");
    await onRefresh();
  }

  async function handleChangeRole(bId: string, memberId: string, role: BranchRole) {
    const res = await fetch(`/api/branches/${bId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) toast.error((await res.json().catch(() => null))?.error ?? "Couldn't change the role.");
    await onRefresh();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-normal text-foreground">
          Doctors ({members.length})
        </h3>
        {canManage && (
          <Button
            onClick={() => setSheetOpen(true)}
            size="sm"
            className="h-8 px-3 bg-primary hover:bg-primary/90 text-white rounded-control text-[14px] font-medium cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
            Add Doctor
          </Button>
        )}
      </div>

      {/* Doctor cards */}
      {members.length === 0 ? (
        <div className="py-12 text-center">
          <Users className="h-10 w-10 mx-auto text-border mb-2" strokeWidth={1} />
          <p className="text-[15px] text-fg-secondary">No doctors in this branch yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((member) => {
            const initials = (member.name ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2);
            const isOwnerMember = member.role === "OWNER";

            return (
              <div
                key={member.id}
                className="rounded-panel border border-border bg-white px-5 py-4 transition-all duration-200 hover:border-border-strong"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-brand-subtle text-brand text-[13px] font-medium">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="text-[15px] font-medium text-foreground truncate"
                          title={member.name ?? member.email}
                        >
                          {member.name ?? member.email}
                        </span>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            isOwnerMember
                              ? "bg-brand-subtle text-brand"
                              : member.role === "ADMIN"
                              ? "bg-info-subtle text-info"
                              : "bg-surface-hover text-fg-secondary"
                          }`}
                        >
                          {roleLabel(member.role)}
                        </span>
                      </div>
                      <p className="text-[13px] text-fg-secondary truncate" title={member.email}>{member.email}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    {/* Stats */}
                    <div className="hidden sm:flex items-center gap-4 text-[13px] text-fg-secondary whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {plural(member.patientCount ?? 0, "patient")}
                      </span>
                      <span className="flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {plural(member.xrayCountThisMonth ?? 0, "X-ray")}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <Link
                        href={`/dashboard/doctors/${member.userId}`}
                        className="text-[13px] text-brand hover:text-brand-strong font-medium"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View Profile
                      </Link>
                      {canManage && !isOwnerMember && (
                        <button
                          onClick={async () => {
                            await handleRemoveDoctor(branchId, member.id);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-control text-fg-secondary hover:bg-danger-subtle hover:text-danger transition-colors cursor-pointer"
                          title="Remove doctor"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Joined date */}
                <p className="text-[12px] text-border-strong mt-2">
                  Joined {new Date(member.joinedAt).toLocaleDateString("en-US", { timeZone: CLINIC_TIME_ZONE, month: "short", year: "numeric" })}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {canManage && invites.length > 0 && (
        <div className="rounded-panel border border-border bg-white p-4">
          <h4 className="text-[14px] font-medium text-foreground mb-2">
            Waiting to accept ({invites.length})
          </h4>
          <ul className="divide-y divide-border">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Mail className="h-4 w-4 text-fg-muted" strokeWidth={1.5} />
                <span className="min-w-0 flex-1 text-[14px] text-foreground">
                  {invite.name ?? invite.email}
                  <span className="text-fg-secondary"> · {roleLabel(invite.role)} · sent{" "}
                    {new Date(invite.sentAt).toLocaleDateString("en-GB", { timeZone: CLINIC_TIME_ZONE, day: "numeric", month: "short" })}
                  </span>
                </span>
                <Button variant="outline" size="sm" className="h-7 text-[13px]" onClick={() => withdraw(invite)}>
                  Withdraw
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-fg-muted">Invites lapse after 14 days.</p>
        </div>
      )}

      {/* Add Doctor Sheet */}
      <ManageDoctorsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        branchName={branchName}
        branchId={branchId}
        members={sheetMembers}
        onAddDoctor={handleAddDoctor}
        onRemoveDoctor={handleRemoveDoctor}
        onChangeRole={handleChangeRole}
        canChangeRole={userRole === "OWNER"}
      />
    </div>
  );
}
