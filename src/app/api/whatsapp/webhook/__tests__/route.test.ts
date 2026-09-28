import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const updateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointmentReminder: { updateMany: (a: unknown) => updateMany(a) },
    whatsAppAccount: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    patientOutreach: { updateMany: vi.fn() },
  },
}));

import { GET, POST } from "../route";

const SECRET = "app-secret";

describe("/api/whatsapp/webhook", () => {
  beforeEach(() => {
    process.env.META_APP_SECRET = SECRET;
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-me";
    updateMany.mockReset();
  });

  it("answers Meta's verification handshake only with the right token", async () => {
    const ok = await GET(new Request("https://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");
    const bad = await GET(new Request("https://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42"));
    expect(bad.status).toBe(403);
  });

  it("rejects unsigned posts", async () => {
    const res = await POST(new Request("https://x/api/whatsapp/webhook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("marks the reminder failed on a signed failure status", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "W", changes: [{ field: "messages", value: { statuses: [{ id: "wamid.7", status: "failed", errors: [{ code: 131026, title: "Undeliverable" }] }] } }] }],
    });
    const sig = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
    const res = await POST(
      new Request("https://x/api/whatsapp/webhook", { method: "POST", body, headers: { "x-hub-signature-256": sig } }),
    );
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { externalId: "wamid.7", channel: "WHATSAPP" },
      data: { status: "FAILED", failureReason: "wa_failed: Undeliverable (131026)" },
    });
  });
});
