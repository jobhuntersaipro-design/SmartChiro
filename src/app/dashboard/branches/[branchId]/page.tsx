import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { BranchDetailView } from "@/components/dashboard/branches/BranchDetailView";

export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { branchId } = await params;

  return (
    <BranchDetailView
      branchId={branchId}
      userId={session.user.id}
      userName={session.user.name ?? null}
    />
  );
}
