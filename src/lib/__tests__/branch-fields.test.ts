import { describe, expect, it } from "vitest";
import { formatClinicType, normalizeWebsite } from "@/lib/branch-fields";

describe("normalizeWebsite", () => {
  it("keeps empty and a bare scheme as null", () => {
    expect(normalizeWebsite("")).toEqual({ ok: true, value: null });
    expect(normalizeWebsite("   ")).toEqual({ ok: true, value: null });
    expect(normalizeWebsite(null)).toEqual({ ok: true, value: null });
    expect(normalizeWebsite("https://")).toEqual({ ok: true, value: null });
  });

  it("adds https:// to a host typed without a scheme", () => {
    expect(normalizeWebsite("www.klchiro.my")).toEqual({ ok: true, value: "https://www.klchiro.my" });
    expect(normalizeWebsite("klchiro.my/about")).toEqual({ ok: true, value: "https://klchiro.my/about" });
  });

  it("keeps http and https URLs as typed", () => {
    expect(normalizeWebsite("http://klchiro.my")).toEqual({ ok: true, value: "http://klchiro.my" });
    expect(normalizeWebsite(" https://klchiro.my ")).toEqual({ ok: true, value: "https://klchiro.my" });
  });

  it("rejects things that are not web addresses", () => {
    expect(normalizeWebsite("ftp://klchiro.my").ok).toBe(false);
    expect(normalizeWebsite("klchiro").ok).toBe(false);
    expect(normalizeWebsite("kl chiro.my").ok).toBe(false);
  });
});

describe("formatClinicType", () => {
  it("title-cases stored values", () => {
    expect(formatClinicType("group")).toBe("Group");
    expect(formatClinicType("solo")).toBe("Solo");
    expect(formatClinicType("multi_location")).toBe("Multi Location");
    expect(formatClinicType("GROUP practice")).toBe("Group Practice");
    expect(formatClinicType("multi-disciplinary")).toBe("Multi-Disciplinary");
    expect(formatClinicType(null)).toBe("");
  });
});
