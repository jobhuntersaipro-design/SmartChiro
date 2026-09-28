import { NextResponse } from "next/server";
import { guardPublic } from "@/lib/booking/public";
import { BookingRequestSchema } from "@/lib/booking/schema";
import { createOnlineBooking, type BookingError } from "@/lib/booking/book";
import { icsPath } from "@/lib/booking/ics";
import { buildWhatsAppUrl } from "@/lib/format";
import { clinicDateLabel, clinicTimeLabel } from "@/lib/clinic-time";
import type { PublicBookingConfirmation } from "@/types/booking";

type RouteCtx = { params: Promise<{ slug: string }> };

const ERROR_STATUS: Record<BookingError, number> = {
  treatment_not_offered: 422,
  doctor_not_bookable: 422,
  outside_window: 422,
  slot_taken: 409,
  daily_limit: 429,
};

/** Book an appointment from the public page. No login; rate-limited per IP and per phone. */
export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const { slug } = await ctx.params;
  const guard = await guardPublic(req, slug, "book");
  if ("response" in guard) return guard.response;
  const { branch } = guard;

  const body: unknown = await req.json().catch(() => null);
  const parsed = BookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 422 });
  }
  // Honeypot filled in → a bot. Same answer as any invalid request.
  if (parsed.data.website) return NextResponse.json({ error: "validation" }, { status: 422 });

  const result = await createOnlineBooking(branch, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: ERROR_STATUS[result.error] });

  const b = result.booking;
  const address = [branch.address, branch.city, branch.state].filter(Boolean).join(", ") || null;
  const booking: PublicBookingConfirmation = {
    dateTime: b.dateTime.toISOString(),
    dateLabel: clinicDateLabel(b.dateTime, "day"),
    timeLabel: clinicTimeLabel(b.dateTime),
    duration: b.duration,
    treatment: b.treatment,
    doctorName: b.doctorName,
    firstName: b.firstName,
    branch: { name: branch.name, address, phone: branch.phone },
    icsUrl: icsPath(slug, b.appointmentId),
    whatsappUrl: buildWhatsAppUrl(branch.phone),
  };
  return NextResponse.json({ booking }, { status: 201 });
}
