import { describe, it, expect } from "vitest";
import { signRequest, verifyRequest } from "../hmac";

const SECRET = "test-shared-secret";

describe("signRequest / verifyRequest", () => {
  it("a freshly signed payload verifies", () => {
    const body = JSON.stringify({ to: "+60123", body: "hi" });
    const sig = signRequest({ secret: SECRET, body, timestamp: 1_700_000_000 });
    expect(verifyRequest({
      secret: SECRET, body, signature: sig, timestamp: 1_700_000_000, nowEpoch: 1_700_000_010,
    })).toEqual({ ok: true });
  });

  it("rejects when the signature is wrong", () => {
    const body = JSON.stringify({ to: "+60123", body: "hi" });
    const r = verifyRequest({
      secret: SECRET, body, signature: "deadbeef", timestamp: 1_700_000_000, nowEpoch: 1_700_000_010,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects when the timestamp is older than 60 seconds", () => {
    const body = "{}";
    const sig = signRequest({ secret: SECRET, body, timestamp: 1_700_000_000 });
    const r = verifyRequest({
      secret: SECRET, body, signature: sig, timestamp: 1_700_000_000, nowEpoch: 1_700_000_061,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/stale|expired/i);
  });

  it("rejects when the timestamp is more than 60s in the future", () => {
    const body = "{}";
    const sig = signRequest({ secret: SECRET, body, timestamp: 1_700_001_000 });
    const r = verifyRequest({
      secret: SECRET, body, signature: sig, timestamp: 1_700_001_000, nowEpoch: 1_700_000_000,
    });
    expect(r.ok).toBe(false);
  });
});
