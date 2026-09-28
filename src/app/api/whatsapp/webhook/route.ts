import { NextResponse } from "next/server";
import { appSecret, webhookVerifyToken } from "@/lib/whatsapp/config";
import { applyWebhookEvent, extractWebhookEvents, verifyMetaSignature } from "@/lib/whatsapp/webhook";

/** Meta's subscription handshake when the webhook URL is saved in the app dashboard. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const expected = webhookVerifyToken();
  if (
    expected &&
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === expected
  ) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: Request): Promise<Response> {
  const secret = appSecret();
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 500 });

  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Always 200 once authenticated: Meta retries non-2xx for days, and a bad
  // event shouldn't block the rest of the batch.
  for (const event of extractWebhookEvents(payload)) {
    try {
      await applyWebhookEvent(event);
    } catch (e) {
      console.error("whatsapp webhook event failed", { kind: event.kind, error: String(e) });
    }
  }
  return NextResponse.json({ ok: true });
}
