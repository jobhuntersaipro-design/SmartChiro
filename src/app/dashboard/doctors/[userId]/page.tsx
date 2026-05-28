import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DoctorDetailView } from "@/components/dashboard/doctors/DoctorDetailView";

export default async function DoctorDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { userId } = await params;

  // Resolve whether the caller has an OWNER/ADMIN seat anywhere. Used to gate
  // the Availability tab's edit buttons in the UI. The API routes enforce the
  // real, branch-scoped RBAC — this is purely a UX hint so DOCTORs don't see
  // affordances that the server will reject.
  const adminMembership = await prisma.branchMember.findFirst({
    where: {
      userId: session.user.id,
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: { userId: true },
  });

  return (
    <DoctorDetailView
      doctorId={userId}
      currentUserId={session.user.id}
      isAdminLike={Boolean(adminMembership) || session.user.id === userId}
    />
  );
}
