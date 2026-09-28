import { describe, it, expect } from "vitest";
import {
  effectiveStatus,
  expiryFor,
  ineligibilityReason,
  pickPackageForAppointment,
  sessionsLeft,
  unitValue,
  type PackageLike,
} from "@/lib/packages";

const NOW = new Date("2026-10-10T04:00:00Z");

function pkg(partial: Partial<PackageLike> & { id: string }): PackageLike {
  return {
    status: "ACTIVE",
    sessionsTotal: 12,
    sessionsUsed: 0,
    expiresAt: null,
    treatmentTypes: [],
    price: 1200,
    ...partial,
  };
}

describe("effectiveStatus", () => {
  it("keeps an active package active", () => {
    expect(effectiveStatus(pkg({ id: "a", expiresAt: new Date("2026-12-01T00:00:00Z") }), NOW)).toBe("ACTIVE");
  });
  it("reads EXPIRED once expiresAt has passed", () => {
    expect(effectiveStatus(pkg({ id: "a", expiresAt: new Date("2026-10-01T00:00:00Z") }), NOW)).toBe("EXPIRED");
  });
  it("reads COMPLETED once every session is used (even if also expired)", () => {
    expect(effectiveStatus(pkg({ id: "a", sessionsUsed: 12, expiresAt: new Date("2026-10-01T00:00:00Z") }), NOW)).toBe("COMPLETED");
  });
  it("never revives a cancelled package", () => {
    expect(effectiveStatus(pkg({ id: "a", status: "CANCELLED" }), NOW)).toBe("CANCELLED");
  });
});

describe("pickPackageForAppointment", () => {
  const soon = pkg({ id: "soon", expiresAt: new Date("2026-11-01T00:00:00Z") });
  const later = pkg({ id: "later", expiresAt: new Date("2027-01-01T00:00:00Z") });
  const never = pkg({ id: "never" });

  it("picks the earliest-expiring eligible package; no expiry comes last", () => {
    expect(pickPackageForAppointment([never, later, soon], "ADJUSTMENT", NOW)?.id).toBe("soon");
    expect(pickPackageForAppointment([never, later], "ADJUSTMENT", NOW)?.id).toBe("later");
  });

  it("matches treatment types; an empty list redeems any treatment", () => {
    const adjOnly = pkg({ id: "adj", treatmentTypes: ["ADJUSTMENT"], expiresAt: new Date("2026-10-20T00:00:00Z") });
    expect(pickPackageForAppointment([adjOnly, later], "SOFT_TISSUE", NOW)?.id).toBe("later");
    expect(pickPackageForAppointment([adjOnly, later], "ADJUSTMENT", NOW)?.id).toBe("adj");
    expect(pickPackageForAppointment([adjOnly], null, NOW)).toBeNull();
  });

  it("skips used-up, cancelled and expired-at-appointment-time packages", () => {
    const usedUp = pkg({ id: "used", sessionsUsed: 12, expiresAt: new Date("2026-10-15T00:00:00Z") });
    const cancelled = pkg({ id: "cx", status: "CANCELLED", expiresAt: new Date("2026-10-15T00:00:00Z") });
    const expired = pkg({ id: "exp", expiresAt: new Date("2026-10-09T00:00:00Z") });
    expect(pickPackageForAppointment([usedUp, cancelled, expired, later], "ADJUSTMENT", NOW)?.id).toBe("later");
    expect(pickPackageForAppointment([usedUp, cancelled, expired], "ADJUSTMENT", NOW)).toBeNull();
  });

  it("uses the appointment time for expiry, not today", () => {
    const expired = pkg({ id: "exp", expiresAt: new Date("2026-10-09T00:00:00Z") });
    expect(pickPackageForAppointment([expired], null, new Date("2026-10-08T00:00:00Z"))?.id).toBe("exp");
  });

  it("prefers the requested package when it is eligible", () => {
    expect(pickPackageForAppointment([soon, later], null, NOW, "later")?.id).toBe("later");
    const usedUp = pkg({ id: "used", sessionsUsed: 12 });
    expect(pickPackageForAppointment([soon, usedUp], null, NOW, "used")?.id).toBe("soon");
  });
});

describe("ineligibilityReason", () => {
  it("names the reason", () => {
    expect(ineligibilityReason(pkg({ id: "a", status: "CANCELLED" }), null, NOW)).toBe("not_active");
    expect(ineligibilityReason(pkg({ id: "a", sessionsUsed: 12 }), null, NOW)).toBe("used_up");
    expect(ineligibilityReason(pkg({ id: "a", expiresAt: new Date("2026-10-01T00:00:00Z") }), null, NOW)).toBe("expired");
    expect(ineligibilityReason(pkg({ id: "a", treatmentTypes: ["GONSTEAD"] }), "ADJUSTMENT", NOW)).toBe("treatment_mismatch");
    expect(ineligibilityReason(pkg({ id: "a" }), "ADJUSTMENT", NOW)).toBeNull();
  });
});

describe("unitValue / sessionsLeft", () => {
  it("divides price by sessions, rounded to sen", () => {
    expect(unitValue(pkg({ id: "a", price: 1200, sessionsTotal: 12 }))).toBe(100);
    expect(unitValue(pkg({ id: "a", price: 1000, sessionsTotal: 3 }))).toBe(333.33);
    // Prisma Decimal-like
    expect(unitValue({ price: { toString: () => "450.00" }, sessionsTotal: 4 })).toBe(112.5);
    expect(unitValue({ price: 100, sessionsTotal: 0 })).toBe(0);
  });
  it("never reports negative sessions left", () => {
    expect(sessionsLeft({ sessionsTotal: 5, sessionsUsed: 7 })).toBe(0);
    expect(sessionsLeft({ sessionsTotal: 5, sessionsUsed: 2 })).toBe(3);
  });
});

describe("expiryFor", () => {
  it("is the end of the clinic day `validityDays` later", () => {
    // 11:00 MYT 1 Oct + 30 days → end of 31 Oct MYT = 16:00Z on 31 Oct.
    expect(expiryFor(new Date("2026-10-01T03:00:00Z"), 30)?.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    // 23:30 MYT 1 Oct (15:30Z) is still 1 Oct in the clinic.
    expect(expiryFor(new Date("2026-10-01T15:30:00Z"), 1)?.toISOString()).toBe("2026-10-02T16:00:00.000Z");
  });
  it("null / zero validity never expires", () => {
    expect(expiryFor(NOW, null)).toBeNull();
    expect(expiryFor(NOW, 0)).toBeNull();
  });
});
