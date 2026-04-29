import { describe, it, expect } from "vitest";
import { renderTemplate, validateTemplate } from "../templates";
import type { TemplateContext } from "@/types/reminder";

const ctx: TemplateContext = {
  patientName: "Ahmad Bin Ali",
  firstName: "Ahmad",
  lastName: "Bin Ali",
  date: "29 April 2026",
  time: "14:30",
  dayOfWeek: "Wednesday",
  doctorName: "Dr Lee",
  branchName: "SmartChiro KL",
  branchAddress: "1 Jalan Sentral, KL",
  branchPhone: "+60312345678",
};

describe("renderTemplate", () => {
  it("substitutes all placeholders", () => {
    const out = renderTemplate("Hi {firstName}, see {doctorName} on {date}", ctx);
    expect(out).toBe("Hi Ahmad, see Dr Lee on 29 April 2026");
  });

  it("substitutes the same placeholder multiple times", () => {
    const out = renderTemplate("{firstName}-{firstName}", ctx);
    expect(out).toBe("Ahmad-Ahmad");
  });

  it("throws when a placeholder is unknown", () => {
    expect(() => renderTemplate("Hi {nope}", ctx)).toThrow(/unknown placeholder/i);
  });

  it("throws when a placeholder is unclosed", () => {
    expect(() => renderTemplate("Hi {firstName, see you", ctx)).toThrow(/unclosed/i);
  });
});

describe("validateTemplate", () => {
  it("returns ok for a valid template", () => {
    expect(validateTemplate("Hi {firstName}")).toEqual({ ok: true });
  });

  it("returns error for unknown placeholder", () => {
    const r = validateTemplate("Hi {nope}");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/unknown placeholder.*nope/i);
  });

  it("returns error for unclosed placeholder", () => {
    const r = validateTemplate("Hi {firstName, see you");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/unclosed/i);
  });

  it("returns error for empty template", () => {
    const r = validateTemplate("");
    expect(r.ok).toBe(false);
  });
});
