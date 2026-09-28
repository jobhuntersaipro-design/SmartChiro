import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ensureWhatsAppTemplates, recallTemplateParams, reviewTemplateParams } from "../templates";
import {
  RECALL_TEMPLATE_TEXT,
  RECALL_TEMPLATE_NAME,
  REMINDER_TEMPLATE_NAME,
  REMINDER_TEMPLATE_TEXT,
  REVIEW_TEMPLATE_NAME,
  REVIEW_TEMPLATE_TEXT,
  TEMPLATE_LANGS,
  allTemplateStatuses,
  langFromMetaCode,
  metaLanguageCode,
  pickTemplateLanguage,
  renderTemplateText,
  statusForTemplate,
  toStoredTemplateStatus,
  toTemplateLang,
  withTemplateStatus,
} from "../template-text";

describe("outreach template params", () => {
  it("recall: first name, branch, phone (clinic fallback)", () => {
    expect(recallTemplateParams({ firstName: "Mei Ling", branchName: "KLCC\n", branchPhone: "03-2181 1234" })).toEqual([
      "Mei Ling",
      "KLCC",
      "03-2181 1234",
    ]);
    expect(recallTemplateParams({ firstName: "", branchName: "KLCC", branchPhone: null })).toEqual(["-", "KLCC", "the clinic"]);
  });

  it("review: first name, branch, review URL", () => {
    expect(reviewTemplateParams({ firstName: "Ali", branchName: "Bangsar", reviewUrl: " https://g.page/r/x " })).toEqual([
      "Ali",
      "Bangsar",
      "https://g.page/r/x",
    ]);
  });
});

describe("template texts", () => {
  it("has en / ms / zh for every template, with 3 params for outreach and an opt-out line", () => {
    for (const lang of TEMPLATE_LANGS) {
      expect(REMINDER_TEMPLATE_TEXT[lang]).toContain("{{5}}");
      for (const text of [RECALL_TEMPLATE_TEXT[lang], REVIEW_TEMPLATE_TEXT[lang]]) {
        expect(text).toContain("{{3}}");
        expect(text).not.toContain("{{4}}");
        expect(text).toMatch(/STOP|BERHENTI|停止/);
      }
    }
  });

  it("never starts or ends with a parameter (Meta rejects those)", () => {
    for (const map of [REMINDER_TEMPLATE_TEXT, RECALL_TEMPLATE_TEXT, REVIEW_TEMPLATE_TEXT]) {
      for (const text of Object.values(map)) {
        expect(text.trim().startsWith("{{")).toBe(false);
        expect(text.trim().endsWith("}}")).toBe(false);
      }
    }
  });

  it("renders a preview with sample values", () => {
    expect(renderTemplateText("review", "zh")).toContain("https://g.page/r/smartchiro-klcc/review");
  });
});

describe("languages", () => {
  it("maps Chinese to Meta's zh_CN and back", () => {
    expect(metaLanguageCode("zh")).toBe("zh_CN");
    expect(metaLanguageCode("ms")).toBe("ms");
    expect(langFromMetaCode("zh_CN")).toBe("zh");
    expect(langFromMetaCode("en_US")).toBe("en");
    expect(langFromMetaCode("fr")).toBeNull();
    expect(toTemplateLang("zh")).toBe("zh");
    expect(toTemplateLang("xx")).toBe("en");
  });

  it("picks zh when approved, else the first approved language", () => {
    expect(pickTemplateLanguage("zh", { en: "APPROVED", zh: "APPROVED" })).toBe("zh");
    expect(pickTemplateLanguage("zh", { en: "APPROVED", zh: "PENDING" })).toBe("en");
    expect(pickTemplateLanguage("zh", { ms: "APPROVED" })).toBe("ms");
  });
});

describe("stored template status (backward compatible)", () => {
  const legacy = { en: "APPROVED", ms: "PENDING" };

  it("reads a pre-outreach row as the reminder status with nothing for the others", () => {
    expect(statusForTemplate(legacy, REMINDER_TEMPLATE_NAME)).toEqual(legacy);
    expect(statusForTemplate(legacy, RECALL_TEMPLATE_NAME)).toEqual({});
    expect(allTemplateStatuses(legacy)).toEqual({
      [REMINDER_TEMPLATE_NAME]: legacy,
      [RECALL_TEMPLATE_NAME]: {},
      [REVIEW_TEMPLATE_NAME]: {},
    });
    expect(statusForTemplate(null, REMINDER_TEMPLATE_NAME)).toEqual({});
  });

  it("writes reminder statuses top-level and others under templates", () => {
    let s = withTemplateStatus(legacy, REMINDER_TEMPLATE_NAME, "zh", "APPROVED");
    s = withTemplateStatus(s, RECALL_TEMPLATE_NAME, "ms", "REJECTED");
    expect(s).toEqual({ en: "APPROVED", ms: "PENDING", zh: "APPROVED", templates: { [RECALL_TEMPLATE_NAME]: { ms: "REJECTED" } } });
    expect(legacy).toEqual({ en: "APPROVED", ms: "PENDING" });
  });

  it("round-trips per-template maps", () => {
    const byName = {
      [REMINDER_TEMPLATE_NAME]: { en: "APPROVED" },
      [RECALL_TEMPLATE_NAME]: { zh: "PENDING" },
      [REVIEW_TEMPLATE_NAME]: {},
    };
    expect(allTemplateStatuses(toStoredTemplateStatus(byName))).toEqual(byName);
  });
});

describe("ensureWhatsAppTemplates", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("creates every missing language of all three templates and reports status per template", async () => {
    const created: Array<{ name: string; language: string; category: string }> = [];
    fetchMock.mockImplementation(async (url: URL, init: RequestInit) => {
      if (init.method === "POST") {
        const body = JSON.parse(String(init.body));
        created.push({ name: body.name, language: body.language, category: body.category });
        return new Response(JSON.stringify({ id: "t", status: "PENDING" }), { status: 200 });
      }
      const name = url.searchParams.get("name");
      const data = name === REMINDER_TEMPLATE_NAME
        ? [
            { name, language: "en", status: "APPROVED" },
            { name, language: "ms", status: "APPROVED" },
          ]
        : [];
      return new Response(JSON.stringify({ data }), { status: 200 });
    });

    const { status, errors } = await ensureWhatsAppTemplates("WABA", "tok");

    expect(errors).toEqual([]);
    expect(created).toEqual([
      { name: REMINDER_TEMPLATE_NAME, language: "zh_CN", category: "UTILITY" },
      ...[RECALL_TEMPLATE_NAME, REVIEW_TEMPLATE_NAME].flatMap((name) =>
        ["en", "ms", "zh_CN"].map((language) => ({ name, language, category: "MARKETING" })),
      ),
    ]);
    expect(status).toEqual({
      en: "APPROVED",
      ms: "APPROVED",
      zh: "PENDING",
      templates: {
        [RECALL_TEMPLATE_NAME]: { en: "PENDING", ms: "PENDING", zh: "PENDING" },
        [REVIEW_TEMPLATE_NAME]: { en: "PENDING", ms: "PENDING", zh: "PENDING" },
      },
    });
  });
});
