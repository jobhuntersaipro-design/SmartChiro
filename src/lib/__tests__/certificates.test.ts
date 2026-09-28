import { describe, it, expect } from "vitest";
import { clinicInstant } from "@/lib/clinic-time";
import {
  alertThresholdForDays,
  certificateStage,
  daysUntilExpiry,
  describeExpiry,
  expiryChanged,
  expiryInstant,
  expiryKey,
  parseCertificateInput,
  shouldSendAlert,
  stageForDays,
} from "@/lib/certificates";

// 28 Sep 2026, 10:00 in Kuala Lumpur.
const NOW = clinicInstant(2026, 9, 28, 10);

describe("certificate stages", () => {
  it("counts whole clinic days to the expiry date", () => {
    expect(daysUntilExpiry("2026-09-28", NOW)).toBe(0);
    expect(daysUntilExpiry("2026-10-18", NOW)).toBe(20);
    expect(daysUntilExpiry("2026-09-27", NOW)).toBe(-1);
  });

  it("uses the clinic day, not the UTC day", () => {
    // 17:30 UTC on the 28th is already 29 Sep 01:30 in Malaysia.
    const lateUtc = new Date("2026-09-28T17:30:00.000Z");
    expect(daysUntilExpiry("2026-09-29", lateUtc)).toBe(0);
    expect(certificateStage("2026-09-28", lateUtc)).toBe("expired");
    // 15:59 UTC is still the 28th in Malaysia.
    expect(certificateStage("2026-09-28", new Date("2026-09-28T15:59:00.000Z"))).toBe("d7");
  });

  it("buckets expired / 7 / 30 / 60 / ok", () => {
    expect(stageForDays(-3)).toBe("expired");
    expect(stageForDays(0)).toBe("d7");
    expect(stageForDays(7)).toBe("d7");
    expect(stageForDays(8)).toBe("d30");
    expect(stageForDays(30)).toBe("d30");
    expect(stageForDays(31)).toBe("d60");
    expect(stageForDays(60)).toBe("d60");
    expect(stageForDays(61)).toBe("ok");
    expect(certificateStage("2026-10-18", NOW)).toBe("d30");
  });

  it("alert thresholds: 60, 30, 7, then 0 on the expiry day", () => {
    expect(alertThresholdForDays(61)).toBeNull();
    expect(alertThresholdForDays(60)).toBe(60);
    expect(alertThresholdForDays(20)).toBe(30);
    expect(alertThresholdForDays(7)).toBe(7);
    expect(alertThresholdForDays(0)).toBe(0);
    expect(alertThresholdForDays(-10)).toBe(0);
  });

  it("sends once per threshold, only for tighter thresholds", () => {
    expect(shouldSendAlert(45, null)).toBe(60);
    expect(shouldSendAlert(45, 60)).toBeNull();
    expect(shouldSendAlert(25, 60)).toBe(30);
    expect(shouldSendAlert(25, 30)).toBeNull();
    // Entered late: jumps straight to the current threshold.
    expect(shouldSendAlert(5, null)).toBe(7);
    expect(shouldSendAlert(-1, 7)).toBe(0);
    expect(shouldSendAlert(-5, 0)).toBeNull();
    expect(shouldSendAlert(90, null)).toBeNull();
  });

  it("describes the expiry", () => {
    expect(describeExpiry(-1)).toBe("Expired 1 day ago");
    expect(describeExpiry(-4)).toBe("Expired 4 days ago");
    expect(describeExpiry(0)).toBe("Expires today");
    expect(describeExpiry(1)).toBe("Expires in 1 day");
    expect(describeExpiry(20)).toBe("Expires in 20 days");
  });

  it("stores the date at 00:00 UTC and reads it back", () => {
    expect(expiryInstant("2026-12-31").toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(expiryKey(expiryInstant("2026-12-31"))).toBe("2026-12-31");
  });
});

describe("parseCertificateInput", () => {
  it("leaves omitted fields out", () => {
    expect(parseCertificateInput({ name: "x" })).toEqual({ ok: true, data: {} });
  });

  it("trims text and clears blanks", () => {
    const r = parseCertificateInput({ tcmRegistrationNo: "  T&CM/CHI/001 ", apcNumber: "", apcExpiresAt: "2027-01-31" });
    expect(r).toEqual({
      ok: true,
      data: { tcmRegistrationNo: "T&CM/CHI/001", apcNumber: null, apcExpiresAt: new Date("2027-01-31T00:00:00.000Z") },
    });
    expect(parseCertificateInput({ apcExpiresAt: null })).toEqual({ ok: true, data: { apcExpiresAt: null } });
  });

  it("rejects bad input", () => {
    expect(parseCertificateInput({ apcExpiresAt: "31/01/2027" }).ok).toBe(false);
    expect(parseCertificateInput({ apcExpiresAt: "2027-02-30" }).ok).toBe(false);
    expect(parseCertificateInput({ apcNumber: 12 }).ok).toBe(false);
    expect(parseCertificateInput({ tcmRegistrationNo: "x".repeat(51) }).ok).toBe(false);
  });

  it("detects a changed expiry", () => {
    const d = new Date("2027-01-31T00:00:00.000Z");
    expect(expiryChanged(d, undefined)).toBe(false);
    expect(expiryChanged(d, new Date(d))).toBe(false);
    expect(expiryChanged(d, new Date("2028-01-31T00:00:00.000Z"))).toBe(true);
    expect(expiryChanged(null, d)).toBe(true);
    expect(expiryChanged(d, null)).toBe(true);
    expect(expiryChanged(null, null)).toBe(false);
  });
});
