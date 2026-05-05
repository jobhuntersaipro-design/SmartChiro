import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { BranchListView } from "@/components/dashboard/branches/BranchListView";

export default async function BranchesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <BranchListView userName={session.user.name ?? null} />
  );
}
