import { graphVersion } from "./config";
import type { WhatsAppErrorCode } from "@/types/reminder";

const GRAPH_HOST = "https://graph.facebook.com";

/** A Graph API error with Meta's numeric code, e.g. 131026 (undeliverable). */
export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null,
    readonly subcode: number | null,
    readonly details: string | null,
  ) {
    super(message);
    this.name = "GraphError";
  }

  /** Human-readable text for toasts and `lastError`. */
  get userMessage(): string {
    return this.details ? `${this.message} — ${this.details}` : this.message;
  }
}

interface GraphErrorBody {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_user_msg?: string;
    error_data?: { details?: string };
  };
}

export interface GraphRequest {
  method?: "GET" | "POST" | "DELETE";
  token?: string;
  query?: Record<string, string>;
  body?: unknown;
}

export async function graphRequest<T>(path: string, req: GraphRequest = {}): Promise<T> {
  const url = new URL(`${GRAPH_HOST}/${graphVersion()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.set(k, v);

  const headers: Record<string, string> = {};
  if (req.token) headers.authorization = `Bearer ${req.token}`;
  if (req.body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(url, {
    method: req.method ?? "GET",
    headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new GraphError(
      e.message ?? `Graph API returned ${res.status}`,
      res.status,
      e.code ?? null,
      e.error_subcode ?? null,
      e.error_user_msg ?? e.error_data?.details ?? null,
    );
  }
  return json;
}

const AUTH_CODES = new Set([10, 102, 190, 200]);
const RATE_CODES = new Set([4, 80007, 130429, 131048, 131056]);

/** Maps a Cloud API send error to the reminder pipeline's error codes. */
export function mapGraphError(err: unknown): WhatsAppErrorCode {
  if (!(err instanceof GraphError) || err.code === null) return "unknown";
  const c = err.code;
  if (AUTH_CODES.has(c) || (c >= 200 && c < 300)) return "session_logged_out";
  if (RATE_CODES.has(c)) return "rate_limited";
  if (c === 131026) return "not_on_whatsapp";
  if (c === 131030) return "recipient_not_allowed";
  if (c === 131009 || c === 131021) return "invalid_e164";
  if (c >= 132000 && c < 133000) return "template_not_approved";
  if (c === 133010) return "session_disconnected";
  return "unknown";
}
