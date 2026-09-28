import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { loadBranchContext } from "@/lib/branch-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const { branches, activeBranchId } = await loadBranchContext(session.user.id);

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
      }}
    >
      {children}
    </DashboardShell>
  );
}
