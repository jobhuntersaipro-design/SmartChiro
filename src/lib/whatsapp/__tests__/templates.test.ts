import { describe, it, expect } from "vitest";
import { reminderTemplateParams } from "../templates";
import { pickTemplateLanguage, renderTemplatePreview } from "../template-text";
import type { TemplateContext } from "@/types/reminder";

const ctx: TemplateContext = {
  patientName: "Aisyah Rahman",
  firstName: "Aisyah",
  lastName: "Rahman",
  date: "6 October 2026",
  time: "10:30",
  dayOfWeek: "Monday",
  doctorName: "Dr. Tan",
  branchName: "SmartChiro  KLCC\n",
  branchAddress: "",
  branchPhone: "",
};

describe("reminderTemplateParams", () => {
  it("orders params to match the template and strips newlines / double spaces", () => {
    expect(reminderTemplateParams(ctx)).toEqual([
      "Aisyah",
      "SmartChiro KLCC",
      "Monday, 6 October 2026",
      "10:30",
      "Dr. Tan",
    ]);
  });

  it("never sends an empty parameter", () => {
    expect(reminderTemplateParams({ ...ctx, firstName: "  " })[0]).toBe("-");
  });
});

describe("pickTemplateLanguage", () => {
  it("uses the preferred language when approved", () => {
    expect(pickTemplateLanguage("ms", { en: "APPROVED", ms: "APPROVED" })).toBe("ms");
  });
  it("falls back to the other approved language", () => {
    expect(pickTemplateLanguage("ms", { en: "APPROVED", ms: "PENDING" })).toBe("en");
  });
  it("returns null when nothing is approved", () => {
    expect(pickTemplateLanguage("en", { en: "REJECTED" })).toBeNull();
  });
});

describe("renderTemplatePreview", () => {
  it("fills positional params", () => {
    expect(renderTemplatePreview("en", ["A", "B", "C", "D", "E"])).toBe(
      "Hi A, this is a reminder of your appointment at B on C at D with E. If you need to reschedule, please reply to this message or call the clinic.",
    );
  });
});
