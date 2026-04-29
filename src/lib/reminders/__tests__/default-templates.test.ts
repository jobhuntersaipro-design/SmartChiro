import { describe, it, expect } from "vitest";
import { DEFAULT_TEMPLATES } from "../default-templates";
import { ALLOWED_PLACEHOLDERS } from "../placeholders";

describe("DEFAULT_TEMPLATES", () => {
  it("contains EN and MS variants for whatsapp and email", () => {
    expect(DEFAULT_TEMPLATES.whatsapp.en.length).toBeGreaterThan(0);
    expect(DEFAULT_TEMPLATES.whatsapp.ms.length).toBeGreaterThan(0);
    expect(DEFAULT_TEMPLATES.email.en.length).toBeGreaterThan(0);
    expect(DEFAULT_TEMPLATES.email.ms.length).toBeGreaterThan(0);
    expect(DEFAULT_TEMPLATES.email.htmlEn.length).toBeGreaterThan(0);
    expect(DEFAULT_TEMPLATES.email.htmlMs.length).toBeGreaterThan(0);
  });

  it("whatsapp templates are <= 400 chars", () => {
    expect(DEFAULT_TEMPLATES.whatsapp.en.length).toBeLessThanOrEqual(400);
    expect(DEFAULT_TEMPLATES.whatsapp.ms.length).toBeLessThanOrEqual(400);
  });

  it("uses only allowed placeholders", () => {
    const all = [
      DEFAULT_TEMPLATES.whatsapp.en,
      DEFAULT_TEMPLATES.whatsapp.ms,
      DEFAULT_TEMPLATES.email.en,
      DEFAULT_TEMPLATES.email.ms,
      DEFAULT_TEMPLATES.email.htmlEn,
      DEFAULT_TEMPLATES.email.htmlMs,
    ];
    const placeholderRe = /\{(\w+)\}/g;
    for (const tpl of all) {
      const matches = [...tpl.matchAll(placeholderRe)].map((m) => m[1]);
      for (const name of matches) {
        expect(ALLOWED_PLACEHOLDERS).toContain(name);
      }
    }
  });
});
