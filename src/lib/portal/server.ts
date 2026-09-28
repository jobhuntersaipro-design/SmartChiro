import { cookies } from "next/headers";
import { getPortalSessionFromToken, type PortalSession } from "@/lib/portal/auth";
import { PORTAL_COOKIE } from "@/lib/portal/rules";

/** The portal session for a server component under /portal (read-only cookie access). */
export async function getPortalPageSession(): Promise<PortalSession | null> {
  const store = await cookies();
  return getPortalSessionFromToken(store.get(PORTAL_COOKIE)?.value, { touch: false });
}
