import { prisma } from "@/lib/prisma";
import {
  generateCode,
  generateSessionToken,
  hashCode,
  hashSessionToken,
  normalizeEmail,
  safeEqualHex,
} from "@/lib/portal/crypto";
import {
  CODE_TTL_MS,
  EMAIL_CODE_DAY_MS,
  MAX_CODE_ATTEMPTS,
  PORTAL_COOKIE,
  PORTAL_COOKIE_PATHS,
  SESSION_TTL_MS,
  emailMaySendCode,
  sessionNeedsTouch,
} from "@/lib/portal/rules";
import { sendPortalCodeEmail } from "@/lib/portal/email";

/**
 * Patient portal sign-in (Phase 7.2): one-time email codes and cookie
 * sessions, entirely separate from staff NextAuth sessions.
 */

/** Patient rows a verified email may see: every branch, case-insensitive. */
export async function patientIdsForEmail(email: string): Promise<string[]> {
  const rows = await prisma.patient.findMany({
    where: { email: { equals: normalizeEmail(email), mode: "insensitive" } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export type RequestCodeResult = "sent" | "no_patient" | "rate_limited";

/**
 * Issue and email a code when at least one patient has this email and the
 * per-email limits allow it. The caller answers the same way in every case,
 * so the response never reveals whether the email belongs to a patient.
 */
export async function requestPortalCode(
  rawEmail: string,
  ip: string | null,
  now: Date = new Date(),
): Promise<{ result: RequestCodeResult; send?: () => Promise<void> }> {
  const email = normalizeEmail(rawEmail);
  const patient = await prisma.patient.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { branch: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!patient) return { result: "no_patient" };

  const recent = await prisma.portalLoginCode.findMany({
    where: { email, createdAt: { gt: new Date(now.getTime() - EMAIL_CODE_DAY_MS) } },
    select: { createdAt: true },
  });
  if (!emailMaySendCode(recent.map((r) => r.createdAt), now)) return { result: "rate_limited" };

  const code = generateCode();
  // Only the newest code works: retire any earlier unused ones.
  await prisma.portalLoginCode.updateMany({
    where: { email, consumedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
  await prisma.portalLoginCode.create({
    data: {
      email,
      codeHash: hashCode(email, code),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      ip: ip?.slice(0, 64) ?? null,
      createdAt: now,
    },
  });
  return { result: "sent", send: () => sendPortalCodeEmail(email, code, patient.branch.name) };
}

export type VerifyResult = { ok: true; token: string; expiresAt: Date } | { ok: false };

/**
 * Check a code against the newest live code for the email. Every guess uses
 * one of MAX_CODE_ATTEMPTS (counted atomically before comparing), and a
 * matching code is consumed exactly once. Failures are indistinguishable.
 */
export async function verifyPortalCode(
  rawEmail: string,
  code: string,
  userAgent: string | null,
  now: Date = new Date(),
): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  const row = await prisma.portalLoginCode.findFirst({
    where: { email, consumedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false };

  const counted = await prisma.portalLoginCode.updateMany({
    where: { id: row.id, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_CODE_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1) return { ok: false };
  if (!safeEqualHex(hashCode(email, code), row.codeHash)) return { ok: false };

  const consumed = await prisma.portalLoginCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) return { ok: false };

  // The patient may have been removed (or their email changed) since the code went out.
  if ((await patientIdsForEmail(email)).length === 0) return { ok: false };

  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await prisma.portalSession.create({
    data: {
      tokenHash: hashSessionToken(token),
      email,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
      userAgent: userAgent?.slice(0, 300) ?? null,
    },
  });
  // Housekeeping for this email only (indexed): spent codes and dead sessions.
  await prisma.portalLoginCode
    .deleteMany({ where: { email, createdAt: { lt: new Date(now.getTime() - EMAIL_CODE_DAY_MS) } } })
    .catch(() => undefined);
  await prisma.portalSession.deleteMany({ where: { email, expiresAt: { lt: now } } }).catch(() => undefined);
  return { ok: true, token, expiresAt };
}

export interface PortalSession {
  sessionId: string;
  email: string;
  /** Every Patient row with this email, across branches. Empty = no access. */
  patientIds: string[];
  expiresAt: Date;
  /** The expiry slid forward on this request — re-send the cookie. */
  refreshed: boolean;
}

/**
 * Resolve a cookie token to a live session with at least one patient. With
 * `touch`, an idle-for-a-while session slides its expiry (API routes do this
 * so they can re-send the cookie; server pages can't set cookies and don't).
 */
export async function getPortalSessionFromToken(
  token: string | null | undefined,
  { now = new Date(), touch = true }: { now?: Date; touch?: boolean } = {},
): Promise<PortalSession | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.portalSession.findUnique({ where: { tokenHash: hashSessionToken(token) } });
  if (!session || session.expiresAt.getTime() <= now.getTime()) return null;

  const patientIds = await patientIdsForEmail(session.email);
  if (patientIds.length === 0) return null;

  let expiresAt = session.expiresAt;
  let refreshed = false;
  if (touch && sessionNeedsTouch(session.lastSeenAt, now)) {
    expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await prisma.portalSession.update({ where: { id: session.id }, data: { lastSeenAt: now, expiresAt } });
    refreshed = true;
  }
  return { sessionId: session.id, email: session.email, patientIds, expiresAt, refreshed };
}

/** The `sc_portal` cookie value from a request's Cookie header. */
export function portalTokenFromRequest(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === PORTAL_COOKIE) return rest.join("=") || null;
  }
  return null;
}

export function getPortalSession(req: Request, now: Date = new Date()): Promise<PortalSession | null> {
  return getPortalSessionFromToken(portalTokenFromRequest(req), { now });
}

export async function deletePortalSession(token: string | null): Promise<void> {
  if (!token) return;
  await prisma.portalSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

/**
 * Set-Cookie values for the session: one per path, so the cookie reaches the
 * portal pages and its API but nothing else on the site.
 */
export function portalCookieHeaders(token: string | null, expiresAt: Date | null, now: Date = new Date()): string[] {
  const maxAge = token && expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)) : 0;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return PORTAL_COOKIE_PATHS.map(
    (path) => `${PORTAL_COOKIE}=${token ?? ""}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`,
  );
}

export function withPortalCookies(res: Response, token: string | null, expiresAt: Date | null): Response {
  for (const c of portalCookieHeaders(token, expiresAt)) res.headers.append("Set-Cookie", c);
  return res;
}
