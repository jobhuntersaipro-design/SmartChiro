import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { extractWebhookEvents, verifyMetaSignature } from "../webhook";

const SECRET = "app-secret";
const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

describe("verifyMetaSignature", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account" });
  it("accepts a valid signature", () => {
    expect(verifyMetaSignature(body, sign(body), SECRET)).toBe(true);
  });
  it("rejects a missing, malformed or wrong signature", () => {
    expect(verifyMetaSignature(body, null, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "abc", SECRET)).toBe(false);
    expect(verifyMetaSignature(body, sign(body + " "), SECRET)).toBe(false);
  });
});

const wrap = (field: string, value: unknown, id = "WABA1") => ({
  object: "whatsapp_business_account",
  entry: [{ id, changes: [{ field, value }] }],
});

describe("extractWebhookEvents", () => {
  it("reports failed message statuses and ignores delivered/read", () => {
    const events = extractWebhookEvents(
      wrap("messages", {
        statuses: [
          { id: "wamid.1", status: "delivered" },
          { id: "wamid.2", status: "failed", errors: [{ code: 131026, title: "Message undeliverable" }] },
        ],
      }),
    );
    expect(events).toEqual([
      { kind: "message_failed", msgId: "wamid.2", reason: "wa_failed: Message undeliverable (131026)" },
    ]);
  });

  it("reports template status updates with the base language", () => {
    const events = extractWebhookEvents(
      wrap("message_template_status_update", {
        event: "APPROVED",
        message_template_name: "smartchiro_appt_reminder_v1",
        message_template_language: "en_US",
      }),
    );
    expect(events).toEqual([
      { kind: "template_status", wabaId: "WABA1", name: "smartchiro_appt_reminder_v1", lang: "en", status: "APPROVED" },
    ]);
  });

  it("reports account removal and ignores other account updates", () => {
    expect(extractWebhookEvents(wrap("account_update", { event: "PARTNER_REMOVED" }))).toEqual([
      { kind: "account_removed", wabaId: "WABA1", reason: "PARTNER_REMOVED" },
    ]);
    expect(extractWebhookEvents(wrap("account_update", { event: "VERIFIED_ACCOUNT" }))).toEqual([]);
  });

  it("ignores payloads for other objects", () => {
    expect(extractWebhookEvents({ object: "page", entry: [] })).toEqual([]);
    expect(extractWebhookEvents(null)).toEqual([]);
  });
});
