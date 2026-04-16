import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardView } from "@/components/dashboard/DashboardView";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <Suspense>
      <DashboardView
        userId={session.user.id}
        userName={session.user.name ?? null}
        branchRole={session.user.branchRole ?? null}
        activeBranchId={session.user.activeBranchId ?? null}
      />
    </Suspense>
  );
}
