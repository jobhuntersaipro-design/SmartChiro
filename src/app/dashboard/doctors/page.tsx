import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadBranchContext } from "@/lib/branch-context";
import { can } from "@/lib/permissions";
import { DoctorListView } from "@/components/dashboard/doctors/DoctorListView";

export default async function DoctorsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  // "Add staff" offers only branches where the caller manages staff.
  const context = await loadBranchContext(session.user.id);
  const staffBranches = context.branches.filter((b) => can(b.role, "staff.manage")).map(({ id, name }) => ({ id, name }));

  return (
    <DoctorListView
      userId={session.user.id}
      userName={session.user.name ?? null}
      branchRole={(session.user as { branchRole?: string }).branchRole ?? null}
      staffBranches={staffBranches}
    />
  );
}
