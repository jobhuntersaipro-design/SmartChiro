import { redirect } from "next/navigation";
import { getPortalPageSession } from "@/lib/portal/server";
import { PortalHome } from "@/components/portal/PortalHome";

export const dynamic = "force-dynamic";

export default async function PortalHomePage() {
  const session = await getPortalPageSession();
  if (!session) redirect("/portal");
  return <PortalHome email={session.email} />;
}
