import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PlanView } from "@/components/billing/PlanView";
import { loadBranchContext } from "@/lib/branch-context";
import { accountAccess, planViewProps } from "@/lib/subscription";
import { trialDaysLeft } from "@/lib/plans";

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
  const [{ branches, activeBranchId, allBranches, canUseAllBranches }, access] = await Promise.all([
    loadBranchContext(session.user.id),
    accountAccess(session.user.id),
  ]);
  if (!access || access.disabled) redirect(`/api/session/end${access ? "?reason=account_disabled" : ""}`);
  // Staff work on their clinic's plan: no countdown of their own.
  const showTrial = access.state === "trial" && !access.superAdmin;

  return (
    <DashboardShell
      blocked={!access.allowed}
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
