import { createHash } from "node:crypto";

export interface EncodedDocument {
  /** Minified JSON — exactly what is hashed and base64-encoded. */
  json: string;
  /** SHA-256 of the UTF-8 bytes of `json`, lowercase hex. */
  documentHash: string;
  /** Base64 of the same bytes (the `document` field of a submission). */
  base64: string;
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Serialises a document once and derives the hash and base64 from the same
 * bytes (Submit Documents API: `document` = base64 of the JSON,
 * `documentHash` = SHA-256 of the document). Minified, as the SDK recommends.
 */
export function encodeDocument(doc: unknown): EncodedDocument {
  const json = JSON.stringify(doc);
  const bytes = Buffer.from(json, "utf8");
  return { json, documentHash: sha256Hex(bytes), base64: bytes.toString("base64") };
}
