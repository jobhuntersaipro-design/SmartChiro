import { describe, it, expect, beforeEach } from "vitest";
import { effectiveTreatments, isValidSlug, suggestSlug, whatsAppShareUrl, DEFAULT_BOOKING_TREATMENTS } from "../config";
import { buildIcs, icsPath, icsToken, verifyIcsToken } from "../ics";
import { clientIp, resetRateLimits, takeToken } from "../rate-limit";
import { BookingRequestSchema, splitName } from "../schema";
import { keyToLocalDate, localDateToKey, longDateLabel } from "../date-keys";

describe("slug helpers", () => {
  it("validates lowercase slugs of 3–40 chars", () => {
    expect(isValidSlug("smartchiro-klcc")).toBe(true);
    expect(isValidSlug("abc")).toBe(true);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("a".repeat(41))).toBe(false);
    expect(isValidSlug("Upper")).toBe(false);
    expect(isValidSlug("-lead")).toBe(false);
    expect(isValidSlug("trail-")).toBe(false);
    expect(isValidSlug("double--hyphen")).toBe(false);
    expect(isValidSlug("under_score")).toBe(false);
  });

  it("suggests a valid slug from the branch name", () => {
    expect(suggestSlug("SmartChiro KLCC")).toBe("smartchiro-klcc");
    expect(suggestSlug("  Klinik Kiropraktik Pulau Pinang (Georgetown) ")).toBe("klinik-kiropraktik-pulau-pinang-georgeto");
    expect(suggestSlug("Café Chiro")).toBe("cafe-chiro");
    expect(suggestSlug("A")).toBe("a-book");
    expect(suggestSlug("诊所")).toBe("clinic-book");
    for (const name of ["SmartChiro KLCC", "A", "诊所", "x".repeat(80) + " y"]) expect(isValidSlug(suggestSlug(name))).toBe(true);
  });

  it("offers the default treatments when none are stored, in standard order", () => {
    expect(effectiveTreatments([])).toEqual(DEFAULT_BOOKING_TREATMENTS);
    expect(effectiveTreatments(["FOLLOW_UP", "INITIAL_CONSULT"])).toEqual(["INITIAL_CONSULT", "FOLLOW_UP"]);
  });

  it("builds a wa.me share link with the encoded URL", () => {
    const url = whatsAppShareUrl("SmartChiro KLCC", "https://x.test/book/klcc");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toContain("https://x.test/book/klcc");
  });
});

describe("ics", () => {
  it("signs appointment ids and rejects tampering", () => {
    const token = icsToken("appt_1");
    expect(verifyIcsToken("appt_1", token)).toBe(true);
    expect(verifyIcsToken("appt_2", token)).toBe(false);
    expect(verifyIcsToken("appt_1", token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"))).toBe(false);
    expect(verifyIcsToken("appt_1", "")).toBe(false);
    expect(verifyIcsToken("appt_1", null)).toBe(false);
    expect(icsPath("klcc", "appt_1")).toBe(`/api/public/booking/klcc/ics?appointment=appt_1&token=${token}`);
  });

  it("builds a VEVENT in UTC with escaped text and CRLF lines", () => {
    const ics = buildIcs({
      uid: "appt_1",
      start: new Date("2026-10-05T01:00:00Z"),
      durationMin: 45,
      summary: "Adjustment at SmartChiro, KLCC; Level 2",
      location: "Suria KLCC",
      description: "Line one\nLine two",
      now: new Date("2026-09-28T00:00:00Z"),
    });
    expect(ics).toContain("DTSTART:20261005T010000Z\r\n");
    expect(ics).toContain("DTEND:20261005T014500Z\r\n");
    expect(ics).toContain("SUMMARY:Adjustment at SmartChiro\\, KLCC\\; Level 2\r\n");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two\r\n");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("folds long lines at 75 octets", () => {
    const ics = buildIcs({ uid: "a", start: new Date(0), durationMin: 30, summary: "x".repeat(200) });
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
});

describe("rate limit", () => {
  beforeEach(() => resetRateLimits());

  it("allows a burst up to capacity, then refills over time", () => {
    const cfg = { capacity: 2, refillPerSec: 1 / 60 };
    expect(takeToken("k", cfg, 0)).toBe(true);
    expect(takeToken("k", cfg, 0)).toBe(true);
    expect(takeToken("k", cfg, 1000)).toBe(false);
    expect(takeToken("other", cfg, 1000)).toBe(true);
    expect(takeToken("k", cfg, 61_000)).toBe(true);
    expect(takeToken("k", cfg, 62_000)).toBe(false);
  });

  it("reads the first x-forwarded-for address", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } }))).toBe("1.2.3.4");
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "5.6.7.8" } }))).toBe("5.6.7.8");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("request schema", () => {
  const base = {
    treatment: "ADJUSTMENT",
    doctorId: "any",
    dateTime: "2026-10-05T01:00:00.000Z",
    name: "Siti Nurhaliza binti Ahmad",
    phone: "012-345 6789",
    consentData: true,
  };

  it("accepts a minimal booking and blanks optional fields", () => {
    const r = BookingRequestSchema.safeParse({ ...base, email: "", icNumber: "", notes: "  " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBeUndefined();
      expect(r.data.icNumber).toBeUndefined();
      expect(r.data.notes).toBeUndefined();
    }
  });

  it("requires data consent and a real phone number", () => {
    expect(BookingRequestSchema.safeParse({ ...base, consentData: false }).success).toBe(false);
    expect(BookingRequestSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
    expect(BookingRequestSchema.safeParse({ ...base, phone: "call me" }).success).toBe(false);
    expect(BookingRequestSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
    expect(BookingRequestSchema.safeParse({ ...base, treatment: "NOPE" }).success).toBe(false);
  });

  it("lower-cases emails", () => {
    const r = BookingRequestSchema.safeParse({ ...base, email: "Siti@Example.COM" });
    expect(r.success && r.data.email).toBe("siti@example.com");
  });

  it("splits names at the first space", () => {
    expect(splitName(" Siti  Nurhaliza binti Ahmad ")).toEqual({ firstName: "Siti", lastName: "Nurhaliza binti Ahmad" });
    expect(splitName("Madonna")).toEqual({ firstName: "Madonna", lastName: "" });
  });
});

describe("date keys", () => {
  it("round-trips keys through local dates", () => {
    expect(localDateToKey(keyToLocalDate("2026-02-28"))).toBe("2026-02-28");
    expect(longDateLabel("2026-10-05")).toBe("Monday, 5 October 2026");
  });
});
