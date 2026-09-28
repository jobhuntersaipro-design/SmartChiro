import { describe, it, expect } from "vitest";
import { extractWebhookEvents, isOptOutText } from "../webhook";

const inbound = (messages: unknown[], phoneNumberId = "PN1") => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA1",
      changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneNumberId }, messages } }],
    },
  ],
});

describe("isOptOutText", () => {
  it.each(["STOP", "stop", " Stop! ", "BERHENTI", "berhenti.", "停止", "“停止”", "Unsubscribe"])("treats %j as opt-out", (t) => {
    expect(isOptOutText(t)).toBe(true);
  });
  it.each(["stop please call me", "Can I stop by tomorrow?", "", null, "ok"])("ignores %j", (t) => {
    expect(isOptOutText(t)).toBe(false);
  });
});

describe("extractWebhookEvents: inbound messages", () => {
  it("reports STOP replies with the sending number and our phone number id", () => {
    const events = extractWebhookEvents(
      inbound([
        { from: "60123456789", type: "text", text: { body: "STOP" } },
        { from: "60111111111", type: "text", text: { body: "Hi, can I book?" } },
        { from: "60122222222", type: "button", button: { text: "Berhenti" } },
      ]),
    );
    expect(events).toEqual([
      { kind: "opt_out", phoneNumberId: "PN1", from: "60123456789" },
      { kind: "opt_out", phoneNumberId: "PN1", from: "60122222222" },
    ]);
  });

  it("reports status updates for Chinese templates", () => {
    const events = extractWebhookEvents({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA1",
          changes: [
            {
              field: "message_template_status_update",
              value: { event: "APPROVED", message_template_name: "smartchiro_recall_v1", message_template_language: "zh_CN" },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([
      { kind: "template_status", wabaId: "WABA1", name: "smartchiro_recall_v1", lang: "zh", status: "APPROVED" },
    ]);
  });
});
