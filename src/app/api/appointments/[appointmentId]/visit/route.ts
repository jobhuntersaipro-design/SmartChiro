import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

type RouteCtx = { params: Promise<{ appointmentId: string }> };

const Body = z
  .object({
    visitType: z.string().optional(),
    chiefComplaint: z.string().optional(),
  })
  .optional();

export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const { appointmentId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      branchId: true,
      doctorId: true,
      patientId: true,
      status: true,
      dateTime: true,
    },
  });
  if (!appt) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // RBAC: OWNER/ADMIN at the branch only.
  const role = await getUserBranchRole(user.id, appt.branchId);
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Idempotent: existing visit linked → return without creating.
  const existing = await prisma.visit.findUnique({
    where: { appointmentId },
  });
  if (existing) {
    return NextResponse.json({ visit: existing }, { status: 200 });
  }

  if (appt.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "appointment_not_completed" },
      { status: 422 }
    );
  }

  let parsedBody: { visitType?: string; chiefComplaint?: string } = {};
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", details: parsed.error.flatten() },
        { status: 422 }
      );
    }
    parsedBody = parsed.data ?? {};
  } catch {
    parsedBody = {};
  }

  const visit = await prisma.visit.create({
    data: {
      patientId: appt.patientId,
      doctorId: appt.doctorId,
      appointmentId: appt.id,
      visitDate: appt.dateTime,
      visitType: parsedBody.visitType ?? null,
      chiefComplaint: parsedBody.chiefComplaint ?? null,
    },
  });

  return NextResponse.json({ visit }, { status: 201 });
}
