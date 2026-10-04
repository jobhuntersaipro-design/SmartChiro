import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadBranchContext } from "@/lib/branch-context";
import { scopeKey, scopeRole } from "@/lib/branch-scope";
import { PatientListView } from "@/components/patients/PatientListView";

export default async function PatientsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // The directory follows the sidebar branch switcher (one branch or "All branches").
  const scope = await loadBranchContext(session.user.id);

  return (
    <PatientListView
      userId={session.user.id}
      userName={session.user.name ?? null}
      branchRole={scopeRole(scope) ?? "DOCTOR"}
      scopeKey={scopeKey(scope)}
      activeBranchId={scope.activeBranchId}
      multiBranch={scope.branchIds.length > 1}
    />
  );
}
