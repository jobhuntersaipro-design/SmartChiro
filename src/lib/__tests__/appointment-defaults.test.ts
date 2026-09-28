import { describe, expect, it } from "vitest";
import { defaultStart } from "@/lib/appointment-defaults";

describe("defaultStart", () => {
  it("uses the clicked calendar slot when one is given", () => {
    const slot = new Date(2026, 8, 30, 15, 0).toISOString();
    expect(defaultStart(slot, new Date(2026, 8, 28, 10, 0))).toEqual({ date: "2026-09-30", time: "15:00" });
  });

  it("defaults to the next half hour today for walk-ins", () => {
    expect(defaultStart(null, new Date(2026, 8, 28, 14, 7))).toEqual({ date: "2026-09-28", time: "14:30" });
    expect(defaultStart(null, new Date(2026, 8, 28, 14, 40))).toEqual({ date: "2026-09-28", time: "15:00" });
  });

  it("rolls over to 09:00 tomorrow in the evening", () => {
    expect(defaultStart(null, new Date(2026, 8, 28, 20, 15))).toEqual({ date: "2026-09-29", time: "09:00" });
  });
});
