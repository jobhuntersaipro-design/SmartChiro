import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { whatsAppAccount: { findUnique: (a: unknown) => findUnique(a), update: (a: unknown) => update(a) } },
}));

import { sendReminderTemplate } from "../send";
import { encryptSecret } from "../crypto";

const PARAMS = ["Aisyah", "KLCC", "Monday, 6 October 2026", "10:30", "Dr. Tan"];

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "acc1",
    branchId: "b1",
    phoneNumberId: "555",
    status: "CONNECTED",
    templateName: "smartchiro_appt_reminder_v1",
    templateStatus: { en: "APPROVED", ms: "PENDING" },
    accessTokenEnc: encryptSecret("tok"),
    ...overrides,
  };
}

describe("sendReminderTemplate", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.WHATSAPP_TOKEN_KEY = "c".repeat(64);
    findUnique.mockReset();
    update.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the approved template, falling back to English, to a normalised MY number", async () => {
    findUnique.mockResolvedValue(account());
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.9" }] }), { status: 200 }));

    const r = await sendReminderTemplate({ branchId: "b1", to: "012-345 6789", lang: "ms", params: PARAMS });

    expect(r).toEqual({ ok: true, msgId: "wamid.9", lang: "en" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/v\d+\.\d+\/555\/messages$/);
    expect(init.headers.authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body);
    expect(body.to).toBe("60123456789");
    expect(body.template.name).toBe("smartchiro_appt_reminder_v1");
    expect(body.template.language.code).toBe("en");
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(PARAMS);
  });

  it("reports session_disconnected without an account", async () => {
    findUnique.mockResolvedValue(null);
    const r = await sendReminderTemplate({ branchId: "b1", to: "0123456789", lang: "en", params: PARAMS });
    expect(r).toMatchObject({ ok: false, code: "session_disconnected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports template_not_approved when no language is approved", async () => {
    findUnique.mockResolvedValue(account({ templateStatus: { en: "PENDING" } }));
    const r = await sendReminderTemplate({ branchId: "b1", to: "0123456789", lang: "en", params: PARAMS });
    expect(r).toMatchObject({ ok: false, code: "template_not_approved" });
  });

  it("marks the account as errored on an expired token", async () => {
    findUnique.mockResolvedValue(account());
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Session has expired", code: 190 } }), { status: 401 }),
    );
    const r = await sendReminderTemplate({ branchId: "b1", to: "0123456789", lang: "en", params: PARAMS });
    expect(r).toMatchObject({ ok: false, code: "session_logged_out" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "acc1" },
      data: { status: "ERROR", lastError: "Session has expired" },
    });
  });

  it("maps undeliverable numbers to not_on_whatsapp without touching the account", async () => {
    findUnique.mockResolvedValue(account());
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Message undeliverable", code: 131026 } }), { status: 400 }),
    );
    const r = await sendReminderTemplate({ branchId: "b1", to: "0123456789", lang: "en", params: PARAMS });
    expect(r).toMatchObject({ ok: false, code: "not_on_whatsapp" });
    expect(update).not.toHaveBeenCalled();
  });
});
