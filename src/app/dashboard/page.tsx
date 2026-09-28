import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { loadBranchContext } from "@/lib/branch-context";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Cached per request: the layout already loaded it.
  const { allBranches } = await loadBranchContext(session.user.id);

  return (
    <Suspense>
      <DashboardView
        userId={session.user.id}
        userName={session.user.name ?? null}
        branchRole={session.user.branchRole ?? null}
        activeBranchId={session.user.activeBranchId ?? null}
        allBranches={allBranches}
      />
    </Suspense>
  );
}
