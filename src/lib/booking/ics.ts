import { createHmac, timingSafeEqual } from "crypto";

/**
 * Calendar file for an online booking. The download link carries an HMAC of
 * the appointment id (AUTH_SECRET) so appointment ids can't be enumerated.
 */

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

export function icsToken(appointmentId: string): string {
  return createHmac("sha256", secret()).update(`booking-ics:${appointmentId}`).digest("base64url").slice(0, 32);
}

export function verifyIcsToken(appointmentId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(icsToken(appointmentId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function icsPath(slug: string, appointmentId: string): string {
  return `/api/public/booking/${slug}/ics?appointment=${encodeURIComponent(appointmentId)}&token=${icsToken(appointmentId)}`;
}

/** RFC 5545 TEXT escaping. */
function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** 20260929T013000Z */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

export interface IcsEvent {
  uid: string;
  start: Date;
  durationMin: number;
  summary: string;
  location?: string | null;
  description?: string | null;
  cancelled?: boolean;
  now?: Date;
}

export function buildIcs(event: IcsEvent): string {
  const end = new Date(event.start.getTime() + event.durationMin * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SmartChiro//Online booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}@smartchiro`,
    `DTSTAMP:${utcStamp(event.now ?? new Date())}`,
    `DTSTART:${utcStamp(event.start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${esc(event.summary)}`,
    ...(event.location ? [`LOCATION:${esc(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${esc(event.description)}`] : []),
    `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
