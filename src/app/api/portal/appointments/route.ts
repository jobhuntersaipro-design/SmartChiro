import { loadPortalAppointments } from "@/lib/portal/data";
import { portalJson, withPortal } from "@/lib/portal/http";

/** Upcoming appointments and the last 10 past ones, with whether each can still be cancelled online. */
export function GET(req: Request): Promise<Response> {
  return withPortal(req, async (session) => portalJson(await loadPortalAppointments(session)));
}
