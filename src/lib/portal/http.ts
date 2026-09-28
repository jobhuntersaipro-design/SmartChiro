import { NextResponse } from "next/server";
import {
  getPortalSession,
  portalTokenFromRequest,
  withPortalCookies,
  type PortalSession,
} from "@/lib/portal/auth";
import { isSameOrigin } from "@/lib/portal/rules";

const NO_STORE = { "Cache-Control": "private, no-store" };

export function portalJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Run a portal API handler with the caller's session: 401 without one, 403
 * for a cross-site POST, and the cookie re-sent when the session slid.
 */
export async function withPortal(
  req: Request,
  handler: (session: PortalSession) => Promise<Response>,
): Promise<Response> {
  if (req.method !== "GET" && !isSameOrigin(req)) return portalJson({ error: "forbidden" }, 403);
  const session = await getPortalSession(req);
  if (!session) return portalJson({ error: "unauthorized" }, 401);
  const res = await handler(session);
  if (session.refreshed) withPortalCookies(res, portalTokenFromRequest(req), session.expiresAt);
  return res;
}
