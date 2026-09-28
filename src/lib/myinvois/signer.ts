/**
 * Document signing. MyInvois document version 1.1 requires an XAdES-style
 * enveloped signature (UBLExtensions + cac:Signature) made with the
 * taxpayer's own digital certificate from an MCMC-licensed CA (SDK
 * "Signature" section, 06-signature/signature-creation-json). SmartChiro does
 * not hold a certificate, so it submits version 1.0 (signature validation
 * disabled; allowed until LHDN retires it — official FAQ) and exposes this
 * interface for a real signer later.
 *
 * GAP: no v1.1 signer is implemented. Implementing one needs the owner's
 * certificate + private key (PKCS#12), the SDK's canonicalisation of the JSON
 * without UBLExtensions/Signature, SHA-256 digests of the document and of the
 * certificate, RSA-SHA256 over the SignedProperties, and the UBLExtensions
 * block shape from the SDK's signed samples.
 */
import type { DocumentVersion } from "./codes";
import type { UblDocument } from "./document";

export interface DocumentSigner {
  /** The listVersionID documents must carry for this signer. */
  readonly version: DocumentVersion;
  /** Returns the document with its signature blocks added (or unchanged for v1.0). */
  sign(doc: UblDocument): Promise<UblDocument>;
}

export class SignerNotConfiguredError extends Error {
  readonly code = "signer_not_configured";
  constructor() {
    super("MyInvois document version 1.1 needs a digital certificate signer, which isn't configured.");
    this.name = "SignerNotConfiguredError";
  }
}

/** Version 1.0: no signature is added or validated. */
export class UnsignedSigner implements DocumentSigner {
  readonly version = "1.0" as const;
  async sign(doc: UblDocument): Promise<UblDocument> {
    return doc;
  }
}

/** Version 1.1 without a certificate: refuses rather than sending an unsigned 1.1 document LHDN will reject. */
export class NotConfiguredSigner implements DocumentSigner {
  readonly version = "1.1" as const;
  async sign(): Promise<UblDocument> {
    throw new SignerNotConfiguredError();
  }
}

let override: DocumentSigner | null = null;

/** Plug in a real v1.1 signer (e.g. at start-up once a certificate is available). */
export function setDocumentSigner(signer: DocumentSigner | null): void {
  override = signer;
}

/**
 * The signer to use: an installed one, else by `MYINVOIS_DOCUMENT_VERSION`
 * ("1.0" default; "1.1" without an installed signer → NotConfiguredSigner).
 */
export function getDocumentSigner(env: Record<string, string | undefined> = process.env): DocumentSigner {
  if (override) return override;
  return env.MYINVOIS_DOCUMENT_VERSION?.trim() === "1.1" ? new NotConfiguredSigner() : new UnsignedSigner();
}
