import { describe, it, expect } from "vitest";
import { shouldFallback, oppositeChannel } from "../fallback";

describe("shouldFallback", () => {
  it("WhatsApp 'not_on_whatsapp' on first attempt with email available => true", () => {
    expect(shouldFallback({
      channel: "WHATSAPP",
      reason: "not_on_whatsapp",
      attemptCount: 1,
      isFallback: false,
      hasOtherChannelContact: true,
      pref: "WHATSAPP",
    })).toBe(true);
  });

  it("on a row that is already a fallback => false (no chain)", () => {
    expect(shouldFallback({
      channel: "WHATSAPP",
      reason: "not_on_whatsapp",
      attemptCount: 1,
      isFallback: true,
      hasOtherChannelContact: true,
      pref: "WHATSAPP",
    })).toBe(false);
  });

  it("when other channel contact missing => false", () => {
    expect(shouldFallback({
      channel: "WHATSAPP",
      reason: "not_on_whatsapp",
      attemptCount: 1,
      isFallback: false,
      hasOtherChannelContact: false,
      pref: "WHATSAPP",
    })).toBe(false);
  });

  it("when pref is NONE => false (patient explicitly opted out)", () => {
    expect(shouldFallback({
      channel: "WHATSAPP",
      reason: "not_on_whatsapp",
      attemptCount: 1,
      isFallback: false,
      hasOtherChannelContact: true,
      pref: "NONE",
    })).toBe(false);
  });

  it("non-terminal failure (e.g. rate_limited) => false (retry instead)", () => {
    expect(shouldFallback({
      channel: "WHATSAPP",
      reason: "rate_limited",
      attemptCount: 1,
      isFallback: false,
      hasOtherChannelContact: true,
      pref: "WHATSAPP",
    })).toBe(false);
  });

  it("after attempt 2 (not first) => false (retry instead, fallback only on first)", () => {
    expect(shouldFallback({
      channel: "WHATSAPP",
      reason: "not_on_whatsapp",
      attemptCount: 2,
      isFallback: false,
      hasOtherChannelContact: true,
      pref: "WHATSAPP",
    })).toBe(false);
  });

  it("Email hard bounce on first attempt with phone available => true", () => {
    expect(shouldFallback({
      channel: "EMAIL",
      reason: "bounce_hard",
      attemptCount: 1,
      isFallback: false,
      hasOtherChannelContact: true,
      pref: "EMAIL",
    })).toBe(true);
  });
});

describe("oppositeChannel", () => {
  it("WHATSAPP => EMAIL", () => expect(oppositeChannel("WHATSAPP")).toBe("EMAIL"));
  it("EMAIL => WHATSAPP", () => expect(oppositeChannel("EMAIL")).toBe("WHATSAPP"));
});
