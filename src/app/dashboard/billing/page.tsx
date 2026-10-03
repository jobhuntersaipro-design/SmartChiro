import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { accountAccess, planViewProps } from "@/lib/subscription";
import { PlanView } from "@/components/billing/PlanView";

export const metadata = { title: "Plan & billing — SmartChiro" };

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/session/end");
  const access = await accountAccess(session.user.id);
  if (!access) redirect("/api/session/end");
  return <PlanView {...planViewProps(access)} />;
}
