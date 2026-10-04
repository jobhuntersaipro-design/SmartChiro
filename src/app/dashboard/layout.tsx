import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PlanView } from "@/components/billing/PlanView";
import { loadBranchContext } from "@/lib/branch-context";
import { accountAccess, planViewProps } from "@/lib/subscription";
import { trialDaysLeft } from "@/lib/plans";
import { activityStale, recordActivity } from "@/lib/login-activity";
import { pendingInvites } from "@/lib/branch-invites";
import { BranchInvitesBanner } from "@/components/dashboard/BranchInvitesBanner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    // The middleware let a session cookie through, but its account was
    // disabled or deleted: clear it (redirecting to /login would loop).
    redirect(`/api/session/end${session?.error === "account_disabled" ? "?reason=account_disabled" : ""}`);
  }
  const [{ branches, activeBranchId, allBranches, canUseAllBranches }, access, invites] = await Promise.all([
    loadBranchContext(session.user.id),
    accountAccess(session.user.id),
    pendingInvites(session.user.id),
  ]);
  if (!access || access.disabled) redirect(`/api/session/end${access ? "?reason=account_disabled" : ""}`);
  // "Last active" on the super admin page, written after the response.
  const userId = session.user.id;
  if (activityStale(access.lastActiveAt)) after(() => recordActivity(userId));
  // Staff work on their clinic's plan: no countdown of their own.
  const showTrial = access.state === "trial" && !access.superAdmin;

  return (
    <DashboardShell
      blocked={!access.allowed}
      banner={invites.length > 0 ? <BranchInvitesBanner invites={invites} /> : null}
      user={{
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email,
        image: session.user.image ?? null,
        branchRole: session.user.branchRole ?? null,
        activeBranchId,
        branches: branches.map(({ id, name, role }) => ({ id, name, role })),
        allBranches,
        canUseAllBranches,
        superAdmin: access.superAdmin,
        trialDaysLeft: showTrial ? trialDaysLeft(access.trialEndsAt) : null,
      }}
    >
      {access.allowed ? (
        children
      ) : (
        // Trial over and no plan: every dashboard page shows the plans instead.
        <PlanView {...planViewProps(access)} />
      )}
    </DashboardShell>
  );
}
