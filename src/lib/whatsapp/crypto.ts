import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * AES-256-GCM for secrets at rest (Meta access tokens, registration PINs).
 * Stored as `v1.<iv>.<tag>.<ciphertext>`, each part base64url.
 *
 * Key: WHATSAPP_TOKEN_KEY (64 hex chars) or, if unset, SHA-256 of AUTH_SECRET.
 * Rotating either makes stored tokens unreadable — branches then reconnect.
 */

const VERSION = "v1";

function key(): Buffer {
  const hex = process.env.WHATSAPP_TOKEN_KEY?.trim();
  if (hex) {
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error("WHATSAPP_TOKEN_KEY must be 64 hex characters");
    }
    return Buffer.from(hex, "hex");
  }
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("WHATSAPP_TOKEN_KEY or AUTH_SECRET must be set");
  return createHash("sha256").update(`whatsapp-token:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
