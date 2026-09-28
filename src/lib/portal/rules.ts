/**
 * Patient portal limits and pure decisions (Phase 7.2). No DB access here so
 * the rules can be unit-tested with fake timers.
 */

export const CODE_TTL_MS = 10 * 60_000;
export const MAX_CODE_ATTEMPTS = 5;

/** Codes one email can be sent: 3 per 15 minutes, 10 per day. */
export const EMAIL_CODE_WINDOW_MS = 15 * 60_000;
export const EMAIL_CODE_MAX_PER_WINDOW = 3;
export const EMAIL_CODE_DAY_MS = 24 * 60 * 60_000;
export const EMAIL_CODE_MAX_PER_DAY = 10;

/** Code requests one IP can make: 10 per hour. */
export const IP_CODE_WINDOW_MS = 60 * 60_000;
export const IP_CODE_MAX = 10;

/** Code guesses one IP can make: 30 per 15 minutes (on top of 5 per code). */
export const IP_VERIFY_WINDOW_MS = 15 * 60_000;
export const IP_VERIFY_MAX = 30;

export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
/** Sliding expiry is written at most this often per session. */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60_000;

export const PORTAL_COOKIE = "sc_portal";
export const PORTAL_COOKIE_PATHS = ["/portal", "/api/portal"] as const;

/** Whether a new code may be sent, given the send times of recent codes for that email. */
export function emailMaySendCode(recentCodeTimes: Date[], now: Date = new Date()): boolean {
  const t = now.getTime();
  const inWindow = recentCodeTimes.filter((d) => t - d.getTime() < EMAIL_CODE_WINDOW_MS).length;
  const inDay = recentCodeTimes.filter((d) => t - d.getTime() < EMAIL_CODE_DAY_MS).length;
  return inWindow < EMAIL_CODE_MAX_PER_WINDOW && inDay < EMAIL_CODE_MAX_PER_DAY;
}

export interface CodeRowState {
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
}

/** A code can still be tried: not used, not expired, attempts left. */
export function codeIsUsable(row: CodeRowState, now: Date = new Date()): boolean {
  return row.consumedAt === null && row.expiresAt.getTime() > now.getTime() && row.attempts < MAX_CODE_ATTEMPTS;
}

/** Slide the session when it hasn't been touched for a while. */
export function sessionNeedsTouch(lastSeenAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;
}

/**
 * Patients may cancel a SCHEDULED appointment online until `cancelHours`
 * before it starts; after that they call the clinic.
 */
export function portalCanCancel(
  appt: { status: string; dateTime: Date },
  cancelHours: number,
  now: Date = new Date(),
): boolean {
  if (appt.status !== "SCHEDULED") return false;
  return appt.dateTime.getTime() - now.getTime() >= cancelHours * 60 * 60_000;
}

/** Fixed-window-per-key limiter kept in process memory (per server instance). */
export class MemoryRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Records a hit and returns whether it is allowed. */
  hit(key: string, now: number = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.delete(key);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) this.hits.delete(oldest);
    }
    return true;
  }

  reset(): void {
    this.hits.clear();
  }
}

/** Client IP as seen by the platform proxy (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Cross-site POST guard: browsers send Origin on POST; when present it must
 * match the request host. (Cookies are SameSite=Lax as well.)
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === (host ?? new URL(req.url).host);
  } catch {
    return false;
  }
}

/** Shared per-process limiters for the sign-in routes. */
export const ipCodeLimiter = new MemoryRateLimiter(IP_CODE_MAX, IP_CODE_WINDOW_MS);
export const ipVerifyLimiter = new MemoryRateLimiter(IP_VERIFY_MAX, IP_VERIFY_WINDOW_MS);
