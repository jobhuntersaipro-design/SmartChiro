/**
 * In-memory token buckets for the public booking endpoints, keyed by
 * "<bucket>:<ip>". Module-level state: correct for one server process. On a
 * multi-instance deployment each instance keeps its own buckets, so the real
 * limit is N × capacity — the per-phone daily cap in the database is the hard
 * limit for bookings.
 */

export interface BucketConfig {
  /** Burst size. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSec: number;
}

export const BOOKING_LIMITS_PER_IP = {
  /** POST /book: 5 at once, then one every 2 minutes. */
  book: { capacity: 5, refillPerSec: 1 / 120 },
  /** Config / days / slots / ics reads. */
  read: { capacity: 120, refillPerSec: 2 },
} satisfies Record<string, BucketConfig>;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();
const IDLE_TTL_MS = 60 * 60 * 1000;
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) if (now - b.updatedAt > IDLE_TTL_MS) buckets.delete(key);
}

/** Take one token; false when the caller is over the limit. */
export function takeToken(key: string, config: BucketConfig, now: number = Date.now()): boolean {
  sweep(now);
  const current = buckets.get(key);
  const elapsed = current ? Math.max(0, now - current.updatedAt) / 1000 : 0;
  const tokens = current ? Math.min(config.capacity, current.tokens + elapsed * config.refillPerSec) : config.capacity;
  if (tokens < 1) {
    buckets.set(key, { tokens, updatedAt: now });
    return false;
  }
  buckets.set(key, { tokens: tokens - 1, updatedAt: now });
  return true;
}

/** Tests only. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Seconds until one token is available again. */
export function retryAfterSeconds(config: BucketConfig): number {
  return Math.ceil(1 / config.refillPerSec);
}
