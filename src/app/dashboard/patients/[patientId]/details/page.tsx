import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadPatientDetail } from "@/lib/patient-detail";
import { PatientDetailPage } from "@/components/patients/PatientDetailPage";

export default async function PatientDetailsPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { patientId } = await params;
  const loaded = await loadPatientDetail(session.user.id, patientId);
  if (!loaded.ok) {
    if (loaded.status === 404) notFound();
    redirect("/dashboard/patients");
  }

  return (
    <PatientDetailPage
      patientId={patientId}
      branchRole={loaded.branchRole ?? session.user.branchRole ?? null}
      currentUserId={session.user.id}
      initialPatient={loaded.patient}
    />
  );
}
