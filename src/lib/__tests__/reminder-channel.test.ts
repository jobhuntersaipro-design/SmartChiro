import { describe, expect, it } from "vitest";
import { defaultReminderChannel, reminderChannelError } from "@/lib/reminder-channel";

describe("defaultReminderChannel", () => {
  it("follows the contact details entered", () => {
    expect(defaultReminderChannel({ phone: "012-345 6789" })).toBe("WHATSAPP");
    expect(defaultReminderChannel({ email: "a@b.co" })).toBe("EMAIL");
    expect(defaultReminderChannel({ phone: "0123456789", email: "a@b.co" })).toBe("WHATSAPP");
    expect(defaultReminderChannel({})).toBe("NONE");
    expect(defaultReminderChannel({ phone: "  ", email: "" })).toBe("NONE");
  });
});

describe("reminderChannelError", () => {
  it("WhatsApp needs a phone", () => {
    expect(reminderChannelError("WHATSAPP", { email: "a@b.co" })).toMatch(/phone number/);
    expect(reminderChannelError("WHATSAPP", { phone: "0123456789" })).toBeNull();
  });

  it("email needs an email address", () => {
    expect(reminderChannelError("EMAIL", { phone: "0123456789" })).toMatch(/email address/);
    expect(reminderChannelError("EMAIL", { email: "a@b.co" })).toBeNull();
  });

  it("both needs both", () => {
    expect(reminderChannelError("BOTH", { phone: "0123456789" })).toBe("Email reminders need an email address.");
    expect(reminderChannelError("BOTH", { email: "a@b.co" })).toBe("WhatsApp reminders need a phone number.");
    expect(reminderChannelError("BOTH", {})).toMatch(/phone number and an email address/);
    expect(reminderChannelError("BOTH", { phone: "0123456789", email: "a@b.co" })).toBeNull();
  });

  it("none, or no channel given, never errors", () => {
    expect(reminderChannelError("NONE", {})).toBeNull();
    expect(reminderChannelError(undefined, {})).toBeNull();
  });

  it("whitespace-only contacts count as missing", () => {
    expect(reminderChannelError("WHATSAPP", { phone: "   " })).not.toBeNull();
  });
});
