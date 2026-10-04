"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MailPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { roleLabel } from "@/lib/permissions";
import type { PendingInvite } from "@/lib/branch-invites";

/** Pending "join this branch" invitations, answered from the dashboard. */
export function BranchInvitesBanner({ invites }: { invites: PendingInvite[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function answer(invite: PendingInvite, accept: boolean) {
    setBusy(invite.id);
    try {
      const res = await fetch(`/api/me/invites/${invite.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      if (!res.ok) throw new Error();
      // Joining changes the sidebar, branch switcher and every page's data:
      // reload the dashboard rather than patch client state.
      if (accept) {
        window.location.assign("/dashboard");
        return;
      }
      toast.success("Invitation declined");
      router.refresh();
    } catch {
      toast.error("Couldn't answer the invitation. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-4 space-y-2">
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="flex flex-wrap items-center gap-3 rounded-panel border border-border bg-brand-subtle px-4 py-3"
        >
          <MailPlus className="size-5 shrink-0 text-brand" aria-hidden />
          <p className="min-w-0 flex-1 text-[14px] text-foreground">
            {invite.invitedBy ? `${invite.invitedBy} invited you` : "You're invited"} to join{" "}
            <strong className="font-medium">{invite.branchName}</strong> as {roleLabel(invite.role).toLowerCase()}.
            <span className="text-fg-secondary"> They&apos;ll see your work at that branch once you accept.</span>
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy === invite.id} onClick={() => answer(invite, false)}>
              Decline
            </Button>
            <Button size="sm" disabled={busy === invite.id} onClick={() => answer(invite, true)}>
              Accept
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
