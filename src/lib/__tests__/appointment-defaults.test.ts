import { describe, expect, it } from "vitest";
import { defaultStart } from "@/lib/appointment-defaults";
import { clinicInstant } from "@/lib/clinic-time";

// Times are clinic wall-clock (Asia/Kuala_Lumpur); results must not depend on
// the process time zone.
describe("defaultStart", () => {
  it("uses the clicked calendar slot when one is given", () => {
    const slot = clinicInstant(2026, 9, 30, 15, 0).toISOString();
    expect(defaultStart(slot, clinicInstant(2026, 9, 28, 10, 0))).toEqual({ date: "2026-09-30", time: "15:00" });
  });

  it("defaults to the next half hour today for walk-ins", () => {
    expect(defaultStart(null, clinicInstant(2026, 9, 28, 14, 7))).toEqual({ date: "2026-09-28", time: "14:30" });
    expect(defaultStart(null, clinicInstant(2026, 9, 28, 14, 40))).toEqual({ date: "2026-09-28", time: "15:00" });
  });

  it("rolls over to 09:00 tomorrow in the evening", () => {
    expect(defaultStart(null, clinicInstant(2026, 9, 28, 20, 15))).toEqual({ date: "2026-09-29", time: "09:00" });
    expect(defaultStart(null, clinicInstant(2026, 9, 28, 19, 45))).toEqual({ date: "2026-09-29", time: "09:00" });
  });

  it("uses the clinic day before 8 AM, when UTC is still yesterday", () => {
    expect(defaultStart(null, clinicInstant(2026, 9, 29, 7, 10))).toEqual({ date: "2026-09-29", time: "07:30" });
  });
});
