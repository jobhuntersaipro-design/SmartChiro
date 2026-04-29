import { signRequest } from "./hmac";
import type { WorkerSendResult, WorkerErrorCode } from "@/types/reminder";

const KNOWN_CODES = new Set<WorkerErrorCode>([
  "not_on_whatsapp",
  "invalid_e164",
  "session_disconnected",
  "session_logged_out",
  "rate_limited",
  "unknown",
]);

function workerEnv() {
  const url = process.env.WORKER_URL;
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!url || !secret) throw new Error("WORKER_URL and WORKER_SHARED_SECRET must be set");
  return { url, secret };
}

async function signedPost(path: string, body: object): Promise<Response> {
  const { url, secret } = workerEnv();
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000);
  const sig = signRequest({ secret, body: raw, timestamp: ts });
  return fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": sig,
      "x-timestamp": String(ts),
    },
    body: raw,
  });
}

async function signedGet(path: string): Promise<Response> {
  const { url, secret } = workerEnv();
  const ts = Math.floor(Date.now() / 1000);
  const sig = signRequest({ secret, body: "", timestamp: ts });
  return fetch(`${url}${path}`, {
    method: "GET",
    headers: { "x-signature": sig, "x-timestamp": String(ts) },
  });
}

export async function sendMessage(args: {
  branchId: string;
  to: string;
  body: string;
}): Promise<WorkerSendResult> {
  try {
    const res = await signedPost(`/branches/${args.branchId}/send`, {
      to: args.to,
      body: args.body,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && typeof json.msgId === "string") {
      return { ok: true, msgId: json.msgId };
    }
    const err = (json.error ?? {}) as { code?: string; message?: string };
    const code: WorkerErrorCode = KNOWN_CODES.has(err.code as WorkerErrorCode)
      ? (err.code as WorkerErrorCode)
      : "unknown";
    return { ok: false, code, message: err.message ?? `worker returned ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      code: "unknown",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function startSession(branchId: string): Promise<{ ok: boolean }> {
  try {
    const res = await signedPost(`/branches/${branchId}/session`, {});
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

export async function getSessionStatus(branchId: string): Promise<{
  status: string;
  phoneNumber?: string;
  lastSeenAt?: string;
}> {
  const res = await signedGet(`/branches/${branchId}/status`);
  return (await res.json()) as { status: string; phoneNumber?: string; lastSeenAt?: string };
}

export async function logoutSession(branchId: string): Promise<{ ok: boolean }> {
  try {
    const res = await signedPost(`/branches/${branchId}/logout`, {});
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
