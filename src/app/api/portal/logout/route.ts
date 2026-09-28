import { deletePortalSession, portalTokenFromRequest, withPortalCookies } from "@/lib/portal/auth";
import { portalJson } from "@/lib/portal/http";
import { isSameOrigin } from "@/lib/portal/rules";

/** Deletes the session row and clears the cookie on both paths. */
export async function POST(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) return portalJson({ error: "forbidden" }, 403);
  await deletePortalSession(portalTokenFromRequest(req));
  return withPortalCookies(portalJson({ ok: true }), null, null);
}
