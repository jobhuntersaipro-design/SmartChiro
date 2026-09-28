import { z } from "zod";
import { verifyPortalCode, withPortalCookies } from "@/lib/portal/auth";
import { portalJson } from "@/lib/portal/http";
import { clientIp, ipVerifyLimiter, isSameOrigin } from "@/lib/portal/rules";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  code: z.string().trim().regex(/^\d{6}$/),
});

/** One answer for every failure: wrong, expired, used up, or no such account. */
const INVALID = { error: "invalid_code", message: "That code is wrong or has expired. Check it or request a new one." };

export async function POST(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) return portalJson({ error: "forbidden" }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return portalJson(INVALID, 400);

  if (!ipVerifyLimiter.hit(clientIp(req))) {
    return portalJson({ error: "rate_limited", message: "Too many attempts. Please try again later." }, 429);
  }

  const result = await verifyPortalCode(parsed.data.email, parsed.data.code, req.headers.get("user-agent"));
  if (!result.ok) return portalJson(INVALID, 400);
  return withPortalCookies(portalJson({ ok: true }), result.token, result.expiresAt);
}
