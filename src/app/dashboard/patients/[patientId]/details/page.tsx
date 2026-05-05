import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserBranchRole } from "@/lib/auth-utils";
import { PatientDetailPage } from "@/components/patients/PatientDetailPage";

export default async function PatientDetailsPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { patientId } = await params;

  // Resolve the user's role at the patient's branch so role-gated UI
  // (kebab actions, edit buttons) renders correctly without a client round-trip.
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { branchId: true },
  });
  const branchRole = patient
    ? await getUserBranchRole(session.user.id, patient.branchId)
    : null;

  return (
    <PatientDetailPage
      patientId={patientId}
      branchRole={branchRole}
      currentUserId={session.user.id}
    />
  );
}
