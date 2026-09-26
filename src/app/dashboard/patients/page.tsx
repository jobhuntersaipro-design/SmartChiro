import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listPatients } from "@/lib/patient-list";
import { PatientListView } from "@/components/patients/PatientListView";

export default async function PatientsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const patients = await listPatients(session.user.id);

  return (
    <PatientListView
      userId={session.user.id}
      userName={session.user.name ?? null}
      branchRole={session.user.branchRole ?? "DOCTOR"}
      initialPatients={patients}
    />
  );
}
