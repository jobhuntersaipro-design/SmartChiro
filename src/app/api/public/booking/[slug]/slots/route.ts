import { NextResponse } from "next/server";
import { guardPublic, parseSlotQuery } from "@/lib/booking/public";
import { clampToWindow, loadBookingAvailability, windowFor } from "@/lib/booking/availability";
import { slotsFor } from "@/lib/booking/slots";
import { clinicTimeLabel } from "@/lib/clinic-time";
import type { PublicSlot } from "@/types/booking";

type RouteCtx = { params: Promise<{ slug: string }> };

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * GET ?treatment=&doctorId=<id>|any&date=YYYY-MM-DD → slot start times on that
 * clinic day. Doctor ids are not returned: "any" is resolved when booking.
 */
export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  const { slug } = await ctx.params;
  const guard = await guardPublic(req, slug);
  if ("response" in guard) return guard.response;
  const { branch } = guard;

  const url = new URL(req.url);
  const query = await parseSlotQuery(branch, url);
  if ("response" in query) return query.response;

  const date = url.searchParams.get("date") ?? "";
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });

  const now = new Date();
  if (!clampToWindow(date, date, windowFor(branch, now))) return NextResponse.json({ slots: [] });

  const availability = await loadBookingAvailability({
    branch,
    doctors: query.candidates,
    fromKey: date,
    toKey: date,
    treatment: query.treatment,
    now,
  });
  const slots: PublicSlot[] = slotsFor(availability.doctors, query.doctorId, date, availability.rules).map((s) => ({
    start: s.start.toISOString(),
    label: clinicTimeLabel(s.start),
  }));
  return NextResponse.json({ slots, durationMin: availability.rules.durationMin });
}
