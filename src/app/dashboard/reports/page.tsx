import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadBranchContext } from "@/lib/branch-context";
import { can } from "@/lib/permissions";
import { ReportsView } from "@/components/reports/ReportsView";

/**
 * Owner / admin reports. Follows the sidebar branch scope: one branch, or
 * "All branches" = every branch where the user may read reports. Anyone
 * else gets the dashboard 404 (the page isn't advertised to them).
 */
export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { activeBranchId, branchRole, branches, allBranches } = await loadBranchContext(session.user.id);

  if (allBranches) {
    const readable = branches.filter((b) => can(b.role, "reports.read"));
    if (readable.length === 0) notFound();
    return <ReportsView branchId="all" scopeLabel="All branches" branchCount={readable.length} />;
  }

  if (!activeBranchId || !can(branchRole, "reports.read")) notFound();
  const name = branches.find((b) => b.id === activeBranchId)?.name ?? "This branch";
  return <ReportsView branchId={activeBranchId} scopeLabel={name} branchCount={1} />;
}
