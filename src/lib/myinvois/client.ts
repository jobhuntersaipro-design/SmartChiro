/**
 * LHDN MyInvois API client (server only).
 *
 * Endpoints (MyInvois SDK, via github.com/deadboy18/myinvois-docs which mirrors
 * sdk.myinvois.hasil.gov.my — the SDK site isn't reachable from the build
 * environment):
 * - Login as taxpayer / intermediary: POST {identity}/connect/token,
 *   x-www-form-urlencoded client_id, client_secret, grant_type=client_credentials,
 *   scope=InvoicingAPI; intermediaries add an `onbehalfof: <TIN>` header.
 *   Tokens last `expires_in` seconds (3600) and must be reused, not re-requested.
 * - Submit documents: POST /api/v1.0/documentsubmissions/ → 202
 *   { submissionUid, acceptedDocuments[{uuid, invoiceCodeNumber}], rejectedDocuments[{invoiceCodeNumber, error}] }
 * - Get submission: GET /api/v1.0/documentsubmissions/{uid}?pageNo=&pageSize= (poll every 3–5 s)
 * - Get document details: GET /api/v1.0/documents/{uuid}/details (validation errors)
 * - Cancel document: PUT /api/v1.0/documents/state/{uuid}/state { status: "cancelled", reason } (72 h)
 * - 429 TooManyRequests carries `Retry-After` in seconds (standard error response).
 *
 * The client never logs or returns the client secret or tokens.
 */
export type MyInvoisEnvironment = "sandbox" | "production";

/**
 * Base URLs. The official Postman environments give preprod-api / api for
 * the API and preprod-api for sandbox identity; the production identity base
 * is listed as "TBD" in the SDK's Postman file, and community SDKs use the API
 * host for both — hence the MYINVOIS_IDENTITY_URL override.
 */
export const MYINVOIS_URLS: Record<MyInvoisEnvironment, { api: string; identity: string; portal: string }> = {
  sandbox: {
    api: "https://preprod-api.myinvois.hasil.gov.my",
    identity: "https://preprod-api.myinvois.hasil.gov.my",
    portal: "https://preprod.myinvois.hasil.gov.my",
  },
  production: {
    api: "https://api.myinvois.hasil.gov.my",
    identity: "https://api.myinvois.hasil.gov.my",
    portal: "https://myinvois.hasil.gov.my",
  },
};

export interface MyInvoisConfig {
  clientId: string;
  clientSecret: string;
  environment: MyInvoisEnvironment;
  /** Intermediary acting for this taxpayer TIN (`onbehalfof` header on login). */
  onBehalfOf: string | null;
  apiBaseUrl: string;
  identityBaseUrl: string;
  portalBaseUrl: string;
}

/** Reads MYINVOIS_* env vars; null when the client id or secret is missing. */
export function readMyInvoisConfig(env: Record<string, string | undefined> = process.env): MyInvoisConfig | null {
  const clientId = env.MYINVOIS_CLIENT_ID?.trim();
  const clientSecret = env.MYINVOIS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const environment: MyInvoisEnvironment = env.MYINVOIS_ENV?.trim().toLowerCase() === "production" ? "production" : "sandbox";
  const urls = MYINVOIS_URLS[environment];
  const strip = (u: string | undefined) => u?.trim().replace(/\/+$/, "") || undefined;
  return {
    clientId,
    clientSecret,
    environment,
    onBehalfOf: env.MYINVOIS_ON_BEHALF_OF?.trim() || null,
    apiBaseUrl: strip(env.MYINVOIS_API_URL) ?? urls.api,
    identityBaseUrl: strip(env.MYINVOIS_IDENTITY_URL) ?? urls.identity,
    portalBaseUrl: strip(env.MYINVOIS_PORTAL_URL) ?? urls.portal,
  };
}

/** What the UI may show about the configuration — never the id or secret. */
export function myInvoisStatus(env: Record<string, string | undefined> = process.env) {
  const config = readMyInvoisConfig(env);
  return {
    configured: config !== null,
    environment: config?.environment ?? (env.MYINVOIS_ENV?.trim().toLowerCase() === "production" ? "production" : "sandbox"),
    intermediary: Boolean(config?.onBehalfOf),
  };
}

/** Public validation link: {portal}/{uuid}/share/{longId} (Get Document Details API). */
export function validationLink(portalBaseUrl: string, uuid: string, longId: string): string {
  return `${portalBaseUrl.replace(/\/+$/, "")}/${encodeURIComponent(uuid)}/share/${encodeURIComponent(longId)}`;
}

// ─── API shapes ───

export interface MyInvoisError {
  propertyName?: string | null;
  propertyPath?: string | null;
  errorCode?: string | null;
  error?: string | null;
  errorMS?: string | null;
  target?: string | null;
  details?: MyInvoisError[] | null;
  innerError?: MyInvoisError[] | null;
}

export interface SubmitDocument {
  format: "JSON";
  document: string;
  documentHash: string;
  codeNumber: string;
}

export interface SubmitResponse {
  submissionUid: string;
  acceptedDocuments: { uuid: string; invoiceCodeNumber: string }[];
  rejectedDocuments: { invoiceCodeNumber: string; error: MyInvoisError }[];
}

export type DocumentStatusText = "Submitted" | "Valid" | "Invalid" | "Cancelled";

export interface SubmissionDocumentSummary {
  uuid: string;
  submissionUid: string;
  longId?: string | null;
  internalId: string;
  status: DocumentStatusText;
  dateTimeReceived?: string;
  dateTimeValidated?: string | null;
  documentStatusReason?: string | null;
  cancelDateTime?: string | null;
}

export interface SubmissionResponse {
  submissionUid: string;
  documentCount: number;
  dateTimeReceived: string;
  /** "in progress" | "valid" | "partially valid" | "invalid" (casing varies between docs). */
  overallStatus: string;
  documentSummary: SubmissionDocumentSummary[];
}

export interface DocumentDetailsResponse {
  uuid: string;
  submissionUid: string;
  longId?: string | null;
  internalId: string;
  status: DocumentStatusText;
  dateTimeValidated?: string | null;
  documentStatusReason?: string | null;
  validationResults?: {
    status: string;
    validationSteps?: { name: string; status: string; error?: MyInvoisError | null }[];
  } | null;
}

/** An API call failed. `code` is LHDN's error code when it sent one. */
export class MyInvoisApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: MyInvoisError | null = null,
    /** Seconds LHDN asked us to wait (429 / duplicate submission). */
    public retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "MyInvoisApiError";
  }
}

// ─── Client ───

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Retries after a 429 / 503 before giving up. */
  maxRetries?: number;
  /** Longest wait we accept inside a request; a longer Retry-After fails fast with `retryAfter` set. */
  maxRetryWaitMs?: number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

/** Tokens are shared by every client for the same credentials in this process. */
const TOKEN_CACHE = new Map<string, CachedToken>();
/** Renew this long before `expires_in` runs out. */
const TOKEN_SKEW_MS = 60_000;

export function clearMyInvoisTokenCache(): void {
  TOKEN_CACHE.clear();
}

/** Seconds from a Retry-After header (delta-seconds or HTTP date). */
export function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.max(0, Number(trimmed));
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - nowMs) / 1000));
}

export class MyInvoisClient {
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private readonly maxRetryWaitMs: number;

  constructor(
    readonly config: MyInvoisConfig,
    options: ClientOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => Date.now());
    this.maxRetries = options.maxRetries ?? 3;
    this.maxRetryWaitMs = options.maxRetryWaitMs ?? 10_000;
  }

  private get cacheKey(): string {
    return `${this.config.identityBaseUrl}|${this.config.clientId}|${this.config.onBehalfOf ?? ""}`;
  }

  /** Cached access token; logs in again only when it is about to expire. */
  async getToken(): Promise<string> {
    const cached = TOKEN_CACHE.get(this.cacheKey);
    if (cached && cached.expiresAt - TOKEN_SKEW_MS > this.now()) return cached.token;

    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "client_credentials",
      scope: "InvoicingAPI",
    });
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
    if (this.config.onBehalfOf) headers.onbehalfof = this.config.onBehalfOf;
    const res = await this.send(`${this.config.identityBaseUrl}/connect/token`, { method: "POST", headers, body: body.toString() });
    const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string; error_description?: string } | null;
    if (!res.ok || !data?.access_token) {
      throw new MyInvoisApiError(res.status, data?.error ?? "login_failed", `MyInvois login failed${data?.error_description ? `: ${data.error_description}` : ""}`);
    }
    const token = { token: data.access_token, expiresAt: this.now() + (data.expires_in ?? 3600) * 1000 };
    TOKEN_CACHE.set(this.cacheKey, token);
    return token.token;
  }

  /** fetch with retry on 429 / 503, honouring Retry-After (else exponential backoff 1 s, 2 s, 4 s). */
  private async send(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(url, init);
      if (res.status !== 429 && res.status !== 503) return res;
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"), this.now());
      const waitMs = retryAfter !== null ? retryAfter * 1000 : 1000 * 2 ** attempt;
      if (attempt >= this.maxRetries || waitMs > this.maxRetryWaitMs) {
        throw new MyInvoisApiError(
          res.status,
          res.status === 429 ? "TooManyRequests" : "ServiceUnavailable",
          res.status === 429 ? "LHDN is rate-limiting requests; try again shortly." : "LHDN MyInvois is unavailable; try again shortly.",
          null,
          retryAfter ?? Math.ceil(waitMs / 1000),
        );
      }
      await this.sleep(waitMs);
    }
  }

  /** Authenticated JSON call; a 401 drops the cached token and retries once. */
  private async call<T>(method: string, path: string, body?: unknown, expected: number[] = [200]): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getToken();
      const res = await this.send(`${this.config.apiBaseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Accept-Language": "en",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 401 && attempt === 0) {
        TOKEN_CACHE.delete(this.cacheKey);
        continue;
      }
      const data = (await res.json().catch(() => null)) as (T & { error?: MyInvoisError | string }) | null;
      if (expected.includes(res.status)) return data as T;
      const err = data && typeof data.error === "object" ? data.error : null;
      throw new MyInvoisApiError(
        res.status,
        err?.errorCode ?? (typeof data?.error === "string" ? data.error : `http_${res.status}`),
        err?.error ?? `MyInvois request failed (${res.status})`,
        err,
        parseRetryAfter(res.headers.get("retry-after"), this.now()),
      );
    }
    throw new MyInvoisApiError(401, "Unauthorized", "MyInvois rejected the access token.");
  }

  /** The SDK spells the id `submissionUID` in this response (and `submissionUid` elsewhere); both are accepted. */
  async submitDocuments(documents: SubmitDocument[]): Promise<SubmitResponse> {
    const data = await this.call<Partial<SubmitResponse> & { submissionUID?: string }>(
      "POST",
      "/api/v1.0/documentsubmissions/",
      { documents },
      [202],
    );
    return {
      submissionUid: data?.submissionUid ?? data?.submissionUID ?? "",
      acceptedDocuments: data?.acceptedDocuments ?? [],
      rejectedDocuments: data?.rejectedDocuments ?? [],
    };
  }

  getSubmission(submissionUid: string, pageNo = 1, pageSize = 100): Promise<SubmissionResponse> {
    const q = new URLSearchParams({ pageNo: String(pageNo), pageSize: String(pageSize) });
    return this.call<SubmissionResponse>("GET", `/api/v1.0/documentsubmissions/${encodeURIComponent(submissionUid)}?${q}`);
  }

  getDocumentDetails(uuid: string): Promise<DocumentDetailsResponse> {
    return this.call<DocumentDetailsResponse>("GET", `/api/v1.0/documents/${encodeURIComponent(uuid)}/details`);
  }

  cancelDocument(uuid: string, reason: string): Promise<{ uuid: string; status: string }> {
    return this.call("PUT", `/api/v1.0/documents/state/${encodeURIComponent(uuid)}/state`, {
      status: "cancelled",
      reason: reason.slice(0, 300),
    });
  }

  validationLink(uuid: string, longId: string): string {
    return validationLink(this.config.portalBaseUrl, uuid, longId);
  }
}

/** A client from the environment, or null when MyInvois isn't configured. */
export function getMyInvoisClient(): MyInvoisClient | null {
  const config = readMyInvoisConfig();
  return config ? new MyInvoisClient(config) : null;
}

/** "in progress" / "InProgress" / "Partially Valid" → "inprogress" / "partiallyvalid". */
export function normaliseOverallStatus(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[\s_-]+/g, "");
}

/** Flattens LHDN's nested error structure (details / innerError) into readable lines. */
export function flattenErrors(err: MyInvoisError | null | undefined): { code: string | null; message: string; path: string | null }[] {
  if (!err) return [];
  const children = [...(err.details ?? []), ...(err.innerError ?? [])];
  const self = err.error ? [{ code: err.errorCode ?? null, message: err.error, path: err.propertyPath ?? err.propertyName ?? null }] : [];
  return children.length > 0 ? [...self, ...children.flatMap(flattenErrors)] : self;
}
