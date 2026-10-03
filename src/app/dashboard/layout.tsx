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
    redirect("/login");
  }
  const [{ branches, activeBranchId, allBranches, canUseAllBranches }, access] = await Promise.all([
    loadBranchContext(session.user.id),
    accountAccess(session.user.id),
  ]);
  if (!access) redirect("/login");
  // Staff whose clinic owner pays don't see a trial countdown of their own.
  const staffOnly = branches.length > 0 && branches.every((b) => b.role !== "OWNER");
  const showTrial = access.state === "trial" && !staffOnly && !access.superAdmin;

  return (
    <DashboardShell
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
      ) : access.disabled ? (
        <div className="mx-auto max-w-xl rounded-panel border border-border bg-surface p-6 text-center shadow-(--shadow-card)">
          <h1 className="font-heading text-[19px] font-medium text-foreground">This account has been disabled</h1>
          <p className="mt-2 text-[14px] text-fg-secondary">Contact SmartChiro support to have it turned back on.</p>
        </div>
      ) : (
        // Trial over and no plan: every dashboard page shows the plans instead.
        <PlanView {...planViewProps(access)} />
      )}
    </DashboardShell>
  );
}
