import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DoctorListView } from "@/components/dashboard/doctors/DoctorListView";

export default async function DoctorsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <DoctorListView
      userId={session.user.id}
      userName={session.user.name ?? null}
      branchRole={(session.user as { branchRole?: string }).branchRole ?? null}
    />
  );
}
