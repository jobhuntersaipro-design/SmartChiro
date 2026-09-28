import { after } from "next/server";
import { z } from "zod";
import { requestPortalCode } from "@/lib/portal/auth";
import { portalJson } from "@/lib/portal/http";
import { clientIp, ipCodeLimiter, isSameOrigin } from "@/lib/portal/rules";

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/** Same answer whether or not the email belongs to a patient (no account enumeration). */
const SENT_MESSAGE =
  "If that email is on file with the clinic, we've sent a 6-digit code to it. It expires in 10 minutes.";

/** Send after the response so the response time doesn't reveal whether an email went out. */
async function sendLater(send: () => Promise<void>): Promise<void> {
  try {
    after(send);
  } catch {
    await send();
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) return portalJson({ error: "forbidden" }, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return portalJson({ error: "invalid_email", message: "Enter a valid email address." }, 422);

  const ip = clientIp(req);
  if (!ipCodeLimiter.hit(ip)) {
    return portalJson({ error: "rate_limited", message: "Too many requests. Please try again later." }, 429);
  }

  const { send } = await requestPortalCode(parsed.data.email, ip);
  if (send) await sendLater(send);
  return portalJson({ ok: true, message: SENT_MESSAGE });
}
