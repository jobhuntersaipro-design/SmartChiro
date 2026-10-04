import { describe, it, expect } from "vitest";
import {
  DEFAULT_OUTREACH_SETTINGS,
  latestDate,
  nextSendTime,
  outreachChannel,
  recallBlocker,
  reviewBlocker,
  withinCooldown,
  type RecallFacts,
  type ReviewFacts,
} from "../rules";
import { consentFields, isPatientLanguage, languageLabel } from "../consent";
import { renderOutreachEmail } from "../email-templates";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const now = new Date("2026-09-29T04:00:00Z"); // 12:00 in Kuala Lumpur
const s = DEFAULT_OUTREACH_SETTINGS;

const lapsed: RecallFacts = {
  marketingConsent: true,
  status: "active",
  phone: "012-345 6789",
  email: null,
  lastCompletedAt: new Date(now.getTime() - 60 * DAY),
  hasUpcoming: false,
  lastRecallAt: null,
};

describe("recallBlocker", () => {
  it("accepts a consenting, active, lapsed patient with nothing booked", () => {
    expect(recallBlocker(lapsed, s, now)).toBeNull();
  });

  it("requires marketing consent before anything else", () => {
    expect(recallBlocker({ ...lapsed, marketingConsent: false }, s, now)).toBe("no_consent");
    expect(recallBlocker({ ...lapsed, marketingConsent: false }, s, now, { ignoreCooldown: true, ignoreTiming: true })).toBe(
      "no_consent",
    );
  });

  it("skips inactive patients and patients without contact details", () => {
    expect(recallBlocker({ ...lapsed, status: "discharged" }, s, now)).toBe("inactive");
    expect(recallBlocker({ ...lapsed, phone: null, email: "  " }, s, now)).toBe("no_contact");
  });

  it("waits the recall interval since the last completed visit", () => {
    expect(recallBlocker({ ...lapsed, lastCompletedAt: new Date(now.getTime() - 41 * DAY) }, s, now)).toBe("too_recent");
    expect(recallBlocker({ ...lapsed, lastCompletedAt: new Date(now.getTime() - 42 * DAY) }, s, now)).toBeNull();
    expect(recallBlocker({ ...lapsed, lastCompletedAt: null }, s, now)).toBe("no_visit");
  });

  it("skips patients who already have a booking", () => {
    expect(recallBlocker({ ...lapsed, hasUpcoming: true }, s, now)).toBe("has_booking");
  });

  it("respects the cooldown unless overridden", () => {
    const recent = { ...lapsed, lastRecallAt: new Date(now.getTime() - 89 * DAY) };
    expect(recallBlocker(recent, s, now)).toBe("cooldown");
    expect(recallBlocker(recent, s, now, { ignoreCooldown: true })).toBeNull();
    expect(recallBlocker({ ...lapsed, lastRecallAt: new Date(now.getTime() - 91 * DAY) }, s, now)).toBeNull();
  });

  it("lets staff recall regardless of timing (manual send)", () => {
    const recentVisit = { ...lapsed, lastCompletedAt: new Date(now.getTime() - DAY), hasUpcoming: true };
    expect(recallBlocker(recentVisit, s, now, { ignoreTiming: true })).toBeNull();
  });
});

describe("reviewBlocker", () => {
  const settings = { ...s, googleReviewUrl: "https://g.page/r/abc/review" };
  const facts: ReviewFacts = {
    marketingConsent: true,
    phone: "0123456789",
    email: null,
    completedAt: new Date(now.getTime() - 4 * HOUR),
    lastReviewAt: null,
    alreadyRequestedForAppointment: false,
  };

  it("accepts a completed visit inside the window", () => {
    expect(reviewBlocker(facts, settings, now)).toBeNull();
  });

  it("needs a review link and consent", () => {
    expect(reviewBlocker(facts, { ...settings, googleReviewUrl: null }, now)).toBe("no_review_url");
    expect(reviewBlocker({ ...facts, marketingConsent: false }, settings, now)).toBe("no_consent");
  });

  it("waits the delay and gives up after 3 days", () => {
    expect(reviewBlocker({ ...facts, completedAt: new Date(now.getTime() - 2 * HOUR) }, settings, now)).toBe("outside_window");
    expect(reviewBlocker({ ...facts, completedAt: new Date(now.getTime() - 3 * DAY - HOUR) }, settings, now)).toBe(
      "outside_window",
    );
  });

  it("sends one per appointment and respects the per-patient cooldown", () => {
    expect(reviewBlocker({ ...facts, alreadyRequestedForAppointment: true }, settings, now)).toBe("cooldown");
    expect(reviewBlocker({ ...facts, lastReviewAt: new Date(now.getTime() - 100 * DAY) }, settings, now)).toBe("cooldown");
    expect(reviewBlocker({ ...facts, lastReviewAt: new Date(now.getTime() - 181 * DAY) }, settings, now)).toBeNull();
  });
});

describe("helpers", () => {
  it("withinCooldown / latestDate", () => {
    expect(withinCooldown(null, 90, now)).toBe(false);
    expect(withinCooldown(new Date(now.getTime() - DAY), 1, now)).toBe(false);
    const a = new Date(1);
    const b = new Date(2);
    expect(latestDate(a, null, b, undefined)).toBe(b);
    expect(latestDate(null)).toBeNull();
  });

  it("outreachChannel prefers WhatsApp unless the patient prefers email", () => {
    expect(outreachChannel({ phone: "012", email: "a@b.c", reminderChannel: "BOTH" })).toBe("WHATSAPP");
    expect(outreachChannel({ phone: "012", email: "a@b.c", reminderChannel: "EMAIL" })).toBe("EMAIL");
    expect(outreachChannel({ phone: null, email: "a@b.c", reminderChannel: "WHATSAPP" })).toBe("EMAIL");
    expect(outreachChannel({ phone: "", email: null, reminderChannel: "WHATSAPP" })).toBeNull();
  });

  it("nextSendTime keeps daytime and moves night sends to 10:00 clinic time", () => {
    expect(nextSendTime(now)).toBe(now);
    // 22:00 MYT → next day 10:00 MYT (02:00Z)
    expect(nextSendTime(new Date("2026-09-29T14:00:00Z")).toISOString()).toBe("2026-09-30T02:00:00.000Z");
    // 03:00 MYT → same day 10:00 MYT
    expect(nextSendTime(new Date("2026-09-28T19:00:00Z")).toISOString()).toBe("2026-09-29T02:00:00.000Z");
  });
});

describe("consent + languages", () => {
  it("stamps consent once and clears it on withdrawal", () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    expect(consentFields(true, null, now)).toEqual({ marketingConsent: true, marketingConsentAt: now });
    expect(consentFields(true, { marketingConsent: true, marketingConsentAt: t0 }, now).marketingConsentAt).toBe(t0);
    expect(consentFields(false, { marketingConsent: true, marketingConsentAt: t0 }, now)).toEqual({
      marketingConsent: false,
      marketingConsentAt: null,
    });
  });

  it("accepts zh and labels languages", () => {
    expect(isPatientLanguage("zh")).toBe(true);
    expect(isPatientLanguage("fr")).toBe(false);
    expect(languageLabel("zh")).toBe("中文");
    expect(languageLabel(undefined)).toBe("English");
  });
});

describe("renderOutreachEmail", () => {
  const ctx = {
    firstName: "Mei <b>",
    branchName: "SmartChiro KLCC",
    branchPhone: "03-2181 1234",
    reviewUrl: "https://g.page/r/x/review",
    unsubscribeUrl: "https://smartchiro.org/unsubscribe?p=pat1&t=tok",
  };

  it.each(["en", "ms", "zh"] as const)("renders recall and review in %s with an opt-out line", (lang) => {
    const recall = renderOutreachEmail("RECALL", lang, ctx);
    expect(recall.text).toContain("03-2181 1234");
    // W4: replies aren't read, so the email links to an unsubscribe page instead of "reply STOP".
    expect(recall.text).not.toMatch(/STOP|BERHENTI|停止/);
    expect(recall.text).toContain("https://smartchiro.org/unsubscribe?p=pat1&t=tok");
    expect(recall.html).toContain('href="https://smartchiro.org/unsubscribe?p=pat1&amp;t=tok"');
    const review = renderOutreachEmail("REVIEW", lang, ctx);
    expect(review.text).toContain("https://g.page/r/x/review");
    expect(review.html).toContain('href="https://g.page/r/x/review"');
  });

  it("escapes patient values in HTML", () => {
    const { html, subject } = renderOutreachEmail("RECALL", "zh", ctx);
    expect(html).toContain("Mei &lt;b&gt;");
    expect(html).not.toContain("Mei <b>");
    expect(subject).toContain("SmartChiro KLCC");
  });
});
