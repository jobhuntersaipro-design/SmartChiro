import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PatientListView } from "@/components/patients/PatientListView";

export default async function PatientsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      activeBranchId: true,
      branchMemberships: {
        select: { branchId: true, role: true },
        take: 1,
      },
    },
  });

  const activeBranchId = user?.activeBranchId || user?.branchMemberships[0]?.branchId;
  const membership = user?.branchMemberships.find((m) => m.branchId === activeBranchId);
  const branchRole = membership?.role || "DOCTOR";

  return (
    <PatientListView
      userId={session.user.id}
      userName={user?.name ?? null}
      branchRole={branchRole}
    />
  );
}
