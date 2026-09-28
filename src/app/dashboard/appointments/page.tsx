import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadBranchContext } from "@/lib/branch-context";
import { AppointmentsPageShell } from "@/components/appointments/AppointmentsPageShell";

export default async function AppointmentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Resolve all branch memberships so the filter bar can offer the right options
  // and we can server-render the initial branch selection.
  const memberships = await prisma.branchMember.findMany({
    where: { userId: session.user.id },
    select: {
      role: true,
      branch: {
        select: {
          id: true,
          name: true,
          members: {
            select: {
              role: true,
              user: { select: { id: true, name: true, image: true } },
            },
          },
        },
      },
    },
    orderBy: { branch: { name: "asc" } },
  });

  const userBranches = memberships.map((m) => ({
    id: m.branch.id,
    name: m.branch.name,
    role: m.role,
    doctors: m.branch.members
      // Calendar columns are clinicians: doctors and practising owners, not
      // front-desk admins.
      .filter((mem) => mem.role === "DOCTOR" || mem.role === "OWNER")
      .map((mem) => ({
        id: mem.user.id,
        name: mem.user.name ?? "Unnamed",
        image: mem.user.image,
      })),
  }));

  // Defaults follow the sidebar branch switcher. In "All branches" the list
  // spans every branch; the calendar needs one branch for its doctor columns.
  const scope = await loadBranchContext(session.user.id);
  const calendarBranchId = scope.allBranches
    ? userBranches[0]?.id ?? ""
    : scope.activeBranchId ?? userBranches[0]?.id ?? "";

  return (
    <AppointmentsPageShell
      currentUserId={session.user.id}
      branches={userBranches}
      initialBranchId={scope.allBranches ? "all" : calendarBranchId}
      calendarBranchId={calendarBranchId}
      allowAllBranches={scope.canUseAllBranches}
    />
  );
}
