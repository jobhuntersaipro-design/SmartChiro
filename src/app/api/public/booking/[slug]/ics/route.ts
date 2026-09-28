import { prisma } from "@/lib/prisma";
import { guardPublic, notFound } from "@/lib/booking/public";
import { buildIcs, verifyIcsToken } from "@/lib/booking/ics";
import { treatmentLabelFor } from "@/lib/treatment-colors";
import { displayDoctorName } from "@/lib/format";

type RouteCtx = { params: Promise<{ slug: string }> };

/** GET ?appointment=<id>&token=<hmac> → text/calendar for a booking made on this page. */
export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  const { slug } = await ctx.params;
  const guard = await guardPublic(req, slug);
  if ("response" in guard) return guard.response;
  const { branch } = guard;

  const url = new URL(req.url);
  const appointmentId = url.searchParams.get("appointment") ?? "";
  if (!appointmentId || !verifyIcsToken(appointmentId, url.searchParams.get("token"))) return notFound();

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      branchId: true,
      dateTime: true,
      duration: true,
      status: true,
      treatmentType: true,
      doctor: { select: { name: true } },
    },
  });
  if (!appt || appt.branchId !== branch.id) return notFound();

  const location = [branch.name, branch.address, branch.city, branch.state].filter(Boolean).join(", ");
  const description = [
    `${treatmentLabelFor(appt.treatmentType)} with ${displayDoctorName(appt.doctor.name, "your doctor")}`,
    branch.phone ? `Clinic phone: ${branch.phone}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const body = buildIcs({
    uid: appt.id,
    start: appt.dateTime,
    durationMin: appt.duration,
    summary: `${treatmentLabelFor(appt.treatmentType)} at ${branch.name}`,
    location,
    description,
    cancelled: appt.status === "CANCELLED",
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="appointment-${slug}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
