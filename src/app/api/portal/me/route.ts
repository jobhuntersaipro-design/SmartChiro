import { loadPortalMe } from "@/lib/portal/data";
import { portalJson, withPortal } from "@/lib/portal/http";

/** The signed-in email's patient records: name, contact details, clinic name and phone. */
export function GET(req: Request): Promise<Response> {
  return withPortal(req, async (session) => portalJson(await loadPortalMe(session)));
}
