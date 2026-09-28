import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  MemoryRateLimiter,
  SESSION_TOUCH_INTERVAL_MS,
  clientIp,
  codeIsUsable,
  emailMaySendCode,
  isSameOrigin,
  portalCanCancel,
  sessionNeedsTouch,
} from "@/lib/portal/rules";
import {
  generateCode,
  generateSessionToken,
  hashCode,
  hashSessionToken,
  normalizeEmail,
  safeEqualHex,
} from "@/lib/portal/crypto";
import { portalEmailConfigured, sendPortalCodeEmail } from "@/lib/portal/email";

const T0 = new Date("2026-09-29T02:00:00Z");
const mins = (n: number) => new Date(T0.getTime() + n * 60_000);

describe("portal codes and hashing", () => {
  it("generates 6-digit codes, keeping leading zeros", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it("session tokens are 32 random bytes in base64url", () => {
    const t = generateSessionToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateSessionToken()).not.toBe(t);
  });

  it("hashes codes per email (case-insensitive) and never stores the code", () => {
    const h = hashCode("Ann@Example.com", "123456");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("123456");
    expect(hashCode("ann@example.com", "123456")).toBe(h);
    expect(hashCode("bob@example.com", "123456")).not.toBe(h);
    expect(hashCode("ann@example.com", "123457")).not.toBe(h);
    expect(hashSessionToken("abc")).not.toBe(hashCode("x@y.z", "abc"));
  });

  it("depends on AUTH_SECRET", () => {
    const before = hashSessionToken("token");
    vi.stubEnv("AUTH_SECRET", "a-different-secret");
    expect(hashSessionToken("token")).not.toBe(before);
    vi.unstubAllEnvs();
    expect(hashSessionToken("token")).toBe(before);
  });

  it("compares digests in constant time and rejects malformed input", () => {
    const h = hashCode("a@b.co", "000001");
    expect(safeEqualHex(h, h)).toBe(true);
    expect(safeEqualHex(h, hashCode("a@b.co", "000002"))).toBe(false);
    expect(safeEqualHex(h, h.slice(2))).toBe(false);
    expect(safeEqualHex("", "")).toBe(false);
  });

  it("normalises emails", () => {
    expect(normalizeEmail("  Ann@Example.COM ")).toBe("ann@example.com");
  });
});

describe("portal limits", () => {
  it("allows 3 codes per email per 15 minutes", () => {
    expect(emailMaySendCode([], T0)).toBe(true);
    expect(emailMaySendCode([mins(-1), mins(-2)], T0)).toBe(true);
    expect(emailMaySendCode([mins(-1), mins(-2), mins(-14)], T0)).toBe(false);
    expect(emailMaySendCode([mins(-1), mins(-2), mins(-15)], T0)).toBe(true);
  });

  it("caps codes per email at 10 per day", () => {
    const spread = Array.from({ length: 10 }, (_, i) => mins(-60 * (i + 1)));
    expect(emailMaySendCode(spread, T0)).toBe(false);
    expect(emailMaySendCode(spread.slice(0, 9), T0)).toBe(true);
  });

  it("a code expires after 10 minutes, after 5 attempts, and once used", () => {
    const row = { expiresAt: new Date(T0.getTime() + CODE_TTL_MS), attempts: 0, consumedAt: null };
    expect(codeIsUsable(row, T0)).toBe(true);
    expect(codeIsUsable(row, mins(9.9))).toBe(true);
    expect(codeIsUsable(row, mins(10))).toBe(false);
    expect(codeIsUsable({ ...row, attempts: MAX_CODE_ATTEMPTS - 1 }, T0)).toBe(true);
    expect(codeIsUsable({ ...row, attempts: MAX_CODE_ATTEMPTS }, T0)).toBe(false);
    expect(codeIsUsable({ ...row, consumedAt: T0 }, T0)).toBe(false);
  });

  it("slides the session at most once an hour", () => {
    expect(sessionNeedsTouch(T0, new Date(T0.getTime() + SESSION_TOUCH_INTERVAL_MS - 1))).toBe(false);
    expect(sessionNeedsTouch(T0, new Date(T0.getTime() + SESSION_TOUCH_INTERVAL_MS))).toBe(true);
  });

  it("online cancel: only SCHEDULED and only before the cutoff", () => {
    const at = mins(24 * 60);
    expect(portalCanCancel({ status: "SCHEDULED", dateTime: at }, 24, T0)).toBe(true);
    expect(portalCanCancel({ status: "SCHEDULED", dateTime: at }, 24, mins(1))).toBe(false);
    expect(portalCanCancel({ status: "CHECKED_IN", dateTime: at }, 24, T0)).toBe(false);
    expect(portalCanCancel({ status: "CANCELLED", dateTime: at }, 0, T0)).toBe(false);
    expect(portalCanCancel({ status: "SCHEDULED", dateTime: mins(5) }, 0, T0)).toBe(true);
    expect(portalCanCancel({ status: "SCHEDULED", dateTime: mins(-5) }, 0, T0)).toBe(false);
  });
});

describe("MemoryRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it("allows max hits per window per key, then recovers", () => {
    const limiter = new MemoryRateLimiter(10, 60 * 60_000);
    for (let i = 0; i < 10; i++) expect(limiter.hit("1.2.3.4")).toBe(true);
    expect(limiter.hit("1.2.3.4")).toBe(false);
    expect(limiter.hit("5.6.7.8")).toBe(true);
    vi.advanceTimersByTime(60 * 60_000);
    expect(limiter.hit("1.2.3.4")).toBe(true);
  });

  it("bounds memory by evicting the oldest key", () => {
    const limiter = new MemoryRateLimiter(1, 60_000, 2);
    limiter.hit("a");
    limiter.hit("b");
    limiter.hit("c");
    expect(limiter.hit("a")).toBe(true);
    expect(limiter.hit("c")).toBe(false);
  });
});

describe("request helpers", () => {
  it("reads the client IP from the proxy headers", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "8.8.8.8" } }))).toBe("8.8.8.8");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });

  it("rejects cross-site POSTs by Origin", () => {
    const req = (origin?: string) =>
      new Request("https://app.smartchiro.org/api/portal/verify", {
        method: "POST",
        headers: { host: "app.smartchiro.org", ...(origin ? { origin } : {}) },
      });
    expect(isSameOrigin(req())).toBe(true);
    expect(isSameOrigin(req("https://app.smartchiro.org"))).toBe(true);
    expect(isSameOrigin(req("https://evil.example"))).toBe(false);
    expect(isSameOrigin(req("null"))).toBe(false);
  });
});

describe("sign-in email", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("treats a missing or placeholder Resend key as not configured", () => {
    expect(portalEmailConfigured(undefined)).toBe(false);
    expect(portalEmailConfigured("")).toBe(false);
    expect(portalEmailConfigured("re_placeholder")).toBe(false);
    expect(portalEmailConfigured("re_xxxxxxxx")).toBe(false);
    expect(portalEmailConfigured("re_AbC123dEf456")).toBe(true);
  });

  it("logs the code in development only when email isn't configured", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("RESEND_API_KEY", "re_placeholder");

    vi.stubEnv("NODE_ENV", "development");
    await sendPortalCodeEmail("a@b.co", "123456", "KLCC");
    expect(info.mock.calls.flat().join(" ")).toContain("123456");

    info.mockClear();
    vi.stubEnv("NODE_ENV", "production");
    await sendPortalCodeEmail("a@b.co", "654321", "KLCC");
    const logged = [...info.mock.calls, ...err.mock.calls].flat().join(" ");
    expect(logged).not.toContain("654321");
    expect(err).toHaveBeenCalled();
  });
});
