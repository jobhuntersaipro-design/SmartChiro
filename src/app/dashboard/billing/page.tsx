import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { accountAccess, planViewProps } from "@/lib/subscription";
import { PlanView } from "@/components/billing/PlanView";

export const metadata = { title: "Plan & billing — SmartChiro" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ pending?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const access = await accountAccess(session.user.id);
  if (!access) redirect("/login");
  const { pending } = await searchParams;
  return <PlanView {...planViewProps(access)} justSubscribed={pending === "1"} />;
}
