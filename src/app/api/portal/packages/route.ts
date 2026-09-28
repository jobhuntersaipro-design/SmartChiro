import { loadPortalPackages } from "@/lib/portal/data";
import { portalJson, withPortal } from "@/lib/portal/http";

/** Prepaid packages: sessions left, expiry and effective status. */
export function GET(req: Request): Promise<Response> {
  return withPortal(req, async (session) => portalJson({ packages: await loadPortalPackages(session) }));
}
