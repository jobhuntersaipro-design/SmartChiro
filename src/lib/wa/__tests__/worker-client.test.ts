import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMessage } from "../worker-client";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.WORKER_URL = "https://worker.example";
  process.env.WORKER_SHARED_SECRET = "secret";
});

describe("sendMessage", () => {
  it("returns ok with msgId on 200", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ msgId: "wamid.123" }), { status: 200 })
    );
    const r = await sendMessage({ branchId: "br_1", to: "+60123", body: "hi" });
    expect(r).toEqual({ ok: true, msgId: "wamid.123" });
  });

  it("returns ok=false with mapped code on 4xx error body", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: "not_on_whatsapp", message: "no WA" } }),
        { status: 400 }
      )
    );
    const r = await sendMessage({ branchId: "br_1", to: "+60123", body: "hi" });
    expect(r).toEqual({ ok: false, code: "not_on_whatsapp", message: "no WA" });
  });

  it("returns ok=false with code=unknown on network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const r = await sendMessage({ branchId: "br_1", to: "+60123", body: "hi" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unknown");
  });

  it("includes HMAC signature and timestamp headers", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ msgId: "x" }), { status: 200 })
    );
    await sendMessage({ branchId: "br_1", to: "+60123", body: "hi" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-signature"]).toMatch(/^[a-f0-9]{64}$/);
    expect(Number(headers["x-timestamp"])).toBeGreaterThan(1_600_000_000);
  });
});
