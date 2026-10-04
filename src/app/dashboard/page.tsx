import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { loadBranchContext } from "@/lib/branch-context";
import { scopeRole } from "@/lib/branch-scope";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Cached per request: the layout already loaded it.
  const ctx = await loadBranchContext(session.user.id);

  return (
    <Suspense>
      <DashboardView
        userId={session.user.id}
        userName={session.user.name ?? null}
        branchRole={scopeRole(ctx)}
        roles={ctx.roles}
        activeBranchId={ctx.activeBranchId}
        allBranches={ctx.allBranches}
      />
    </Suspense>
  );
}
