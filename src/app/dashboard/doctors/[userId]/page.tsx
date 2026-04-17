import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DoctorDetailView } from "@/components/dashboard/doctors/DoctorDetailView";

export default async function DoctorDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { userId } = await params;

  return (
    <DoctorDetailView
      doctorId={userId}
      currentUserId={session.user.id}
    />
  );
}
