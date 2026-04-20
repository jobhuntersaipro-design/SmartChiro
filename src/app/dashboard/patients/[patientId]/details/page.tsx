import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PatientDetailPage } from "@/components/patients/PatientDetailPage";

export default async function PatientDetailsPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { patientId } = await params;

  return <PatientDetailPage patientId={patientId} currentUserId={session.user.id} />;
}
