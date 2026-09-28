import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { decryptSecret, encryptSecret } from "../crypto";

describe("encryptSecret / decryptSecret", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.WHATSAPP_TOKEN_KEY = "a".repeat(64);
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("round-trips a token", () => {
    const enc = encryptSecret("EAAG-token-123");
    expect(enc).not.toContain("EAAG");
    expect(decryptSecret(enc)).toBe("EAAG-token-123");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects tampered ciphertext", () => {
    const [v, iv, tag, data] = encryptSecret("secret").split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 0xff;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64url")].join("."))).toThrow();
  });

  it("fails with a different key", () => {
    const enc = encryptSecret("secret");
    process.env.WHATSAPP_TOKEN_KEY = "b".repeat(64);
    expect(() => decryptSecret(enc)).toThrow();
  });

  it("falls back to AUTH_SECRET when no dedicated key is set", () => {
    delete process.env.WHATSAPP_TOKEN_KEY;
    process.env.AUTH_SECRET = "auth-secret";
    expect(decryptSecret(encryptSecret("x"))).toBe("x");
  });

  it("rejects a malformed key", () => {
    process.env.WHATSAPP_TOKEN_KEY = "short";
    expect(() => encryptSecret("x")).toThrow(/64 hex/);
  });
});
