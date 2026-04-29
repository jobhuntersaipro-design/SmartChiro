import { describe, it, expect } from "vitest";
import { resolveChannels, plannedReminders } from "../materialize";

describe("resolveChannels", () => {
  it("WHATSAPP + phone => [WHATSAPP]", () => {
    expect(resolveChannels({ pref: "WHATSAPP", hasPhone: true, hasEmail: false })).toEqual(["WHATSAPP"]);
  });
  it("WHATSAPP + no phone + email => [EMAIL] (downgrade)", () => {
    expect(resolveChannels({ pref: "WHATSAPP", hasPhone: false, hasEmail: true })).toEqual(["EMAIL"]);
  });
  it("EMAIL + email => [EMAIL]", () => {
    expect(resolveChannels({ pref: "EMAIL", hasPhone: true, hasEmail: true })).toEqual(["EMAIL"]);
  });
  it("EMAIL + no email + phone => [WHATSAPP] (downgrade)", () => {
    expect(resolveChannels({ pref: "EMAIL", hasPhone: true, hasEmail: false })).toEqual(["WHATSAPP"]);
  });
  it("BOTH + phone + email => [WHATSAPP, EMAIL]", () => {
    expect(resolveChannels({ pref: "BOTH", hasPhone: true, hasEmail: true })).toEqual(["WHATSAPP", "EMAIL"]);
  });
  it("BOTH + only phone => [WHATSAPP]", () => {
    expect(resolveChannels({ pref: "BOTH", hasPhone: true, hasEmail: false })).toEqual(["WHATSAPP"]);
  });
  it("NONE => []", () => {
    expect(resolveChannels({ pref: "NONE", hasPhone: true, hasEmail: true })).toEqual([]);
  });
  it("any pref + no phone + no email => []", () => {
    expect(resolveChannels({ pref: "WHATSAPP", hasPhone: false, hasEmail: false })).toEqual([]);
  });
});

describe("plannedReminders", () => {
  const apptAt = new Date("2026-05-01T10:00:00.000Z");
  const now = new Date("2026-04-29T10:00:00.000Z");

  it("creates one row per (channel × offset) for offsets in the future", () => {
    const rows = plannedReminders({
      appointmentDateTime: apptAt,
      now,
      offsetsMin: [1440, 120],
      channels: ["WHATSAPP", "EMAIL"],
    });
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.channel).sort()).toEqual(["EMAIL", "EMAIL", "WHATSAPP", "WHATSAPP"]);
  });

  it("scheduledFor = appointmentDateTime - offsetMin", () => {
    const rows = plannedReminders({
      appointmentDateTime: apptAt,
      now,
      offsetsMin: [1440],
      channels: ["WHATSAPP"],
    });
    expect(rows[0].scheduledFor.toISOString()).toBe("2026-04-30T10:00:00.000Z");
  });

  it("skips offsets whose scheduledFor is already in the past (with 5min grace)", () => {
    const closeAppt = new Date("2026-04-29T10:30:00.000Z");
    const rows = plannedReminders({
      appointmentDateTime: closeAppt,
      now,
      offsetsMin: [1440, 120, 30],
      channels: ["WHATSAPP"],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].offsetMin).toBe(30);
  });

  it("returns nothing when channels is empty", () => {
    expect(plannedReminders({
      appointmentDateTime: apptAt,
      now,
      offsetsMin: [1440],
      channels: [],
    })).toHaveLength(0);
  });
});
