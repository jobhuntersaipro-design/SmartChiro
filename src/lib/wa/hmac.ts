import { createHmac, timingSafeEqual } from "crypto";

const WINDOW_SECONDS = 60;

export function signRequest(args: {
  secret: string;
  body: string;
  timestamp: number; // epoch seconds
}): string {
  const { secret, body, timestamp } = args;
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export type VerifyResult = { ok: true } | { ok: false; message: string };

export function verifyRequest(args: {
  secret: string;
  body: string;
  signature: string;
  timestamp: number;
  nowEpoch: number;
}): VerifyResult {
  const { secret, body, signature, timestamp, nowEpoch } = args;
  if (Math.abs(nowEpoch - timestamp) > WINDOW_SECONDS) {
    return { ok: false, message: "timestamp stale or expired" };
  }
  const expected = signRequest({ secret, body, timestamp });
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, message: "signature mismatch" };
  }
  return { ok: true };
}
