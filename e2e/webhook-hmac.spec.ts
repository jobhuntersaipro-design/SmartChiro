import { test, expect } from "@playwright/test";
import { signRequest } from "../src/lib/wa/hmac";

const BRANCH_ID = process.env.E2E_BRANCH_ID ?? "e2e-test-branch";
const OUTBOUND = process.env.WORKER_OUTBOUND_SECRET ?? "test-outbound";

function eventBody() {
  return JSON.stringify({ type: "qr", branchId: BRANCH_ID, qrPayload: "abc" });
}

test("webhook rejects missing signature", async ({ request }) => {
  const res = await request.post("/api/wa/webhook", {
    data: eventBody(),
    headers: { "content-type": "application/json" },
  });
  expect(res.status()).toBe(401);
});

test("webhook rejects bad signature", async ({ request }) => {
  const ts = Math.floor(Date.now() / 1000);
  const res = await request.post("/api/wa/webhook", {
    data: eventBody(),
    headers: {
      "content-type": "application/json",
      "x-signature": "deadbeef".repeat(8),
      "x-timestamp": String(ts),
    },
  });
  expect(res.status()).toBe(401);
});

test("webhook rejects stale timestamp", async ({ request }) => {
  const ts = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago, > 60s window
  const body = eventBody();
  const sig = signRequest({ secret: OUTBOUND, body, timestamp: ts });
  const res = await request.post("/api/wa/webhook", {
    data: body,
    headers: { "content-type": "application/json", "x-signature": sig, "x-timestamp": String(ts) },
  });
  expect(res.status()).toBe(401);
});

test("webhook accepts valid signed event", async ({ request }) => {
  const ts = Math.floor(Date.now() / 1000);
  const body = eventBody();
  const sig = signRequest({ secret: OUTBOUND, body, timestamp: ts });
  const res = await request.post("/api/wa/webhook", {
    data: body,
    headers: { "content-type": "application/json", "x-signature": sig, "x-timestamp": String(ts) },
  });
  expect(res.status()).toBe(200);
});
