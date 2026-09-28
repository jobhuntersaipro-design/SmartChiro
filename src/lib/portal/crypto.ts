import { createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "crypto";

/**
 * Patient portal secrets (Phase 7.2). Server-only.
 *
 * Sign-in codes and session tokens are never stored in the clear: the DB holds
 * an HMAC-SHA256 keyed with a key derived from AUTH_SECRET, so a database leak
 * alone can't be replayed as codes or cookies.
 */

export const CODE_LENGTH = 6;

let cachedKey: { secret: string; key: Buffer } | null = null;

function portalKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for the patient portal");
  if (cachedKey?.secret !== secret) {
    const key = Buffer.from(hkdfSync("sha256", secret, "smartchiro", "patient-portal-v1", 32));
    cachedKey = { secret, key };
  }
  return cachedKey.key;
}

/** Lowercased, trimmed email — the form every portal table stores. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Uniformly random 6-digit code, leading zeros kept ("004213"). */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/** 32 random bytes, base64url — the value that goes in the cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function hmac(message: string): string {
  return createHmac("sha256", portalKey()).update(message).digest("hex");
}

/** A code is bound to the email it was sent to, so it can't be used for another address. */
export function hashCode(email: string, code: string): string {
  return hmac(`code:${normalizeEmail(email)}:${code}`);
}

export function hashSessionToken(token: string): string {
  return hmac(`session:${token}`);
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
