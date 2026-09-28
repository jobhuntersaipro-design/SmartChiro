import { NextResponse } from "next/server";
import { guardPublic, parseSlotQuery } from "@/lib/booking/public";
import { clampToWindow, loadBookingAvailability, monthKeys, windowFor } from "@/lib/booking/availability";
import { availableDays } from "@/lib/booking/slots";

type RouteCtx = { params: Promise<{ slug: string }> };

/** GET ?treatment=&doctorId=<id>|any&month=YYYY-MM → the month's days that have at least one slot. */
export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  const { slug } = await ctx.params;
  const guard = await guardPublic(req, slug);
  if ("response" in guard) return guard.response;
  const { branch } = guard;

  const url = new URL(req.url);
  const query = await parseSlotQuery(branch, url);
  if ("response" in query) return query.response;

  const month = monthKeys(url.searchParams.get("month") ?? "");
  if (!month) return NextResponse.json({ error: "invalid_month" }, { status: 400 });

  const now = new Date();
  const range = clampToWindow(month.from, month.to, windowFor(branch, now));
  if (!range) return NextResponse.json({ days: [] });

  const availability = await loadBookingAvailability({
    branch,
    doctors: query.candidates,
    fromKey: range.from,
    toKey: range.to,
    treatment: query.treatment,
    now,
  });
  const days = availableDays(availability.doctors, query.doctorId, range.from, range.to, availability.rules);
  return NextResponse.json({ days });
}
