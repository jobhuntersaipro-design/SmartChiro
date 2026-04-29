import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET } from "../route";

vi.mock("@/lib/reminders/dispatcher", () => ({
  materializePending: vi.fn().mockResolvedValue(0),
  dispatchDue: vi.fn().mockResolvedValue({ processed: 0 }),
}));

beforeEach(() => {
  process.env.CRON_SECRET = "secret-x";
});

function req(secret?: string, useBearer = false): Request {
  const headers: Record<string, string> = {};
  if (secret && !useBearer) headers["x-cron-secret"] = secret;
  if (secret && useBearer) headers["authorization"] = `Bearer ${secret}`;
  return new Request("http://x/api/reminders/dispatch", {
    method: "POST",
    headers,
  });
}

describe("POST /api/reminders/dispatch", () => {
  it("rejects without the cron secret", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("rejects with the wrong secret", async () => {
    const res = await POST(req("nope"));
    expect(res.status).toBe(401);
  });

  it("accepts x-cron-secret header", async () => {
    const res = await POST(req("secret-x"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
  });

  it("accepts Authorization: Bearer header (Vercel Cron format)", async () => {
    const res = await GET(req("secret-x", true));
    expect(res.status).toBe(200);
  });
});
