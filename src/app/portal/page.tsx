import { redirect } from "next/navigation";
import { getPortalPageSession } from "@/lib/portal/server";
import { PortalSignIn } from "@/components/portal/PortalSignIn";

export const dynamic = "force-dynamic";

export default async function PortalSignInPage() {
  if (await getPortalPageSession()) redirect("/portal/home");
  return (
    <div className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center">
      <PortalSignIn />
    </div>
  );
}
