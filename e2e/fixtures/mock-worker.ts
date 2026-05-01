import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import { signRequest, verifyRequest } from "../../src/lib/wa/hmac";

type SessionState = {
  status: "NONE" | "PAIRING" | "CONNECTED" | "DISCONNECTED" | "LOGGED_OUT";
  phoneNumber?: string;
  lastSeenAt?: string;
};

const PORT = Number(process.env.MOCK_WORKER_PORT ?? 8788);
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SHARED = process.env.WORKER_SHARED_SECRET ?? "";
const OUTBOUND = process.env.WORKER_OUTBOUND_SECRET ?? "";

if (!SHARED || !OUTBOUND) {
  throw new Error("mock-worker: WORKER_SHARED_SECRET and WORKER_OUTBOUND_SECRET required");
}

const sessions = new Map<string, SessionState>();
const sends: Array<{ branchId: string; to: string; body: string; ts: number }> = [];

const app = new Hono();

async function verify(c: { req: { raw: Request } }, raw: string) {
  const sig = c.req.raw.headers.get("x-signature") ?? "";
  const ts = Number(c.req.raw.headers.get("x-timestamp") ?? "0");
  const v = verifyRequest({
    secret: SHARED,
    body: raw,
    signature: sig,
    timestamp: ts,
    nowEpoch: Math.floor(Date.now() / 1000),
  });
  return v;
}

app.get("/healthz", (c) => c.text("ok"));

app.post("/branches/:branchId/session", async (c) => {
  const raw = await c.req.text();
  const v = await verify(c, raw);
  if (!v.ok) return c.json({ error: v.message }, 401);
  const branchId = c.req.param("branchId");
  sessions.set(branchId, { status: "PAIRING" });
  return c.json({ status: "PAIRING" }, 202);
});

app.get("/branches/:branchId/status", async (c) => {
  const v = await verify(c, "");
  if (!v.ok) return c.json({ error: v.message }, 401);
  const branchId = c.req.param("branchId");
  const s = sessions.get(branchId) ?? { status: "NONE" };
  return c.json({ branchId, ...s });
});

app.post("/branches/:branchId/send", async (c) => {
  const raw = await c.req.text();
  const v = await verify(c, raw);
  if (!v.ok) return c.json({ error: v.message }, 401);
  const branchId = c.req.param("branchId");
  let body: { to: string; body: string };
  try {
    body = JSON.parse(raw) as { to: string; body: string };
  } catch {
    return c.json({ error: { code: "invalid_json", message: "body is not valid JSON" } }, 400);
  }
  sends.push({ branchId, to: body.to, body: body.body, ts: Date.now() });
  return c.json({ msgId: `mock-${randomUUID()}` });
});

app.post("/branches/:branchId/logout", async (c) => {
  const raw = await c.req.text();
  const v = await verify(c, raw);
  if (!v.ok) return c.json({ error: v.message }, 401);
  const branchId = c.req.param("branchId");
  sessions.set(branchId, { status: "LOGGED_OUT" });
  return c.json({ ok: true });
});

// ─── Test-only hooks (loopback only) ────────────────────────────────────
// NOTE: the real defense against off-box traffic is the `hostname: "127.0.0.1"`
// bind passed to serve() at the bottom of this file — the OS rejects non-loopback
// connections at the socket layer. This isLoopback() check is a sanity guard on
// the request URL's host header for clarity at the route level; it does NOT
// substitute for the bind.
function isLoopback(req: Request): boolean {
  const host = new URL(req.url).hostname;
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

app.post("/__test/emit", async (c) => {
  if (!isLoopback(c.req.raw)) return c.json({ error: "loopback only" }, 403);
  const raw = await c.req.text();
  let event: { type: string; branchId: string; [k: string]: unknown };
  try {
    event = JSON.parse(raw) as { type: string; branchId: string; [k: string]: unknown };
  } catch {
    return c.json({ error: { code: "invalid_json", message: "body is not valid JSON" } }, 400);
  }

  // Mirror DB-side state for status endpoint coherence
  const cur = sessions.get(event.branchId) ?? { status: "NONE" };
  if (event.type === "qr") sessions.set(event.branchId, { ...cur, status: "PAIRING" });
  if (event.type === "connected")
    sessions.set(event.branchId, {
      status: "CONNECTED",
      phoneNumber: event.phoneNumber as string,
      lastSeenAt: new Date().toISOString(),
    });
  if (event.type === "disconnected")
    sessions.set(event.branchId, { ...cur, status: "DISCONNECTED" });
  if (event.type === "logged_out")
    sessions.set(event.branchId, { status: "LOGGED_OUT" });

  // Sign + POST to app webhook
  const ts = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(event);
  const sig = signRequest({ secret: OUTBOUND, body, timestamp: ts });
  const res = await fetch(`${APP_URL}/api/wa/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": sig, "x-timestamp": String(ts) },
    body,
  });
  return c.json({ posted: res.status }, res.ok ? 200 : 502);
});

app.post("/__test/reset", (c) => {
  if (!isLoopback(c.req.raw)) return c.json({ error: "loopback only" }, 403);
  sessions.clear();
  sends.length = 0;
  return c.json({ ok: true });
});

app.get("/__test/sends", (c) => {
  if (!isLoopback(c.req.raw)) return c.json({ error: "loopback only" }, 403);
  return c.json({ sends });
});

serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" });
console.log(`[mock-worker] listening on http://127.0.0.1:${PORT}`);
