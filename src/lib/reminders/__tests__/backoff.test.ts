import { describe, it, expect } from "vitest";
import { backoffMs, MAX_ATTEMPTS } from "../backoff";

describe("backoffMs", () => {
  it("returns 5 minutes after attempt 1", () => {
    expect(backoffMs(1)).toBe(5 * 60_000);
  });
  it("returns 30 minutes after attempt 2", () => {
    expect(backoffMs(2)).toBe(30 * 60_000);
  });
  it("returns 2 hours after attempt 3", () => {
    expect(backoffMs(3)).toBe(2 * 60 * 60_000);
  });
  it("clamps anything beyond max attempts to 2 hours", () => {
    expect(backoffMs(99)).toBe(2 * 60 * 60_000);
  });
});

describe("MAX_ATTEMPTS", () => {
  it("equals 3", () => {
    expect(MAX_ATTEMPTS).toBe(3);
  });
});
