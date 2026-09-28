import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, type TreatmentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { isBranchManager } from "@/lib/branch-scope";
import { CLINICIAN_ROLES } from "@/lib/clinician";
import { displayDoctorName } from "@/lib/format";
import { hasAnyHours, normalizeWorkingSchedule, parseOperatingHours } from "@/lib/operating-hours";
import { hasWorkingSchedule } from "@/lib/reports/utilisation";
import { TREATMENT_OPTIONS } from "@/lib/treatment-colors";
import { BOOKING_LIMITS, effectiveTreatments, isValidSlug, suggestSlug } from "@/lib/booking/config";
import type { BranchBookingSettingsResponse } from "@/types/booking";

type RouteCtx = { params: Promise<{ branchId: string }> };

const SELECT = {
  id: true,
  name: true,
  operatingHours: true,
  bookingEnabled: true,
  bookingSlug: true,
  bookingLeadMinutes: true,
  bookingHorizonDays: true,
  bookingSlotMinutes: true,
  bookingTreatments: true,
  bookingDoctorIds: true,
  bookingNote: true,
} satisfies Prisma.BranchSelect;

const Body = z.object({
  enabled: z.boolean(),
  slug: z.string().trim().toLowerCase(),
  leadMinutes: z.number().int().min(BOOKING_LIMITS.leadMinutes.min).max(BOOKING_LIMITS.leadMinutes.max),
  horizonDays: z.number().int().min(BOOKING_LIMITS.horizonDays.min).max(BOOKING_LIMITS.horizonDays.max),
  slotMinutes: z
    .number()
    .int()
    .refine((n) => (BOOKING_LIMITS.slotMinutes as readonly number[]).includes(n)),
  treatments: z.array(z.enum(TREATMENT_OPTIONS as [TreatmentType, ...TreatmentType[]])).min(1).max(TREATMENT_OPTIONS.length),
  doctorIds: z.array(z.string().min(1)).max(100),
  note: z.string().trim().max(BOOKING_LIMITS.noteMax),
});

/** OWNER / ADMIN of the branch, else a 401/403 Response. */
async function authorize(branchId: string): Promise<{ ok: true } | { ok: false; response: Response }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return { ok: false, response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  if (!isBranchManager(role)) return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { ok: true };
}

async function loadClinicians(branchId: string) {
  const members = await prisma.branchMember.findMany({
    where: { branchId, role: { in: CLINICIAN_ROLES } },
    select: { user: { select: { id: true, name: true, doctorProfile: { select: { workingSchedule: true } } } } },
  });
  return members
    .map((m) => ({
      id: m.user.id,
      name: displayDoctorName(m.user.name, "Doctor"),
      hasSchedule: hasWorkingSchedule(normalizeWorkingSchedule(m.user.doctorProfile?.workingSchedule)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function respond(branchId: string): Promise<Response> {
  const [branch, clinicians] = await Promise.all([
    prisma.branch.findUnique({ where: { id: branchId }, select: SELECT }),
    loadClinicians(branchId),
  ]);
  if (!branch) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const payload: BranchBookingSettingsResponse = {
    settings: {
      enabled: branch.bookingEnabled,
      slug: branch.bookingSlug ?? "",
      leadMinutes: branch.bookingLeadMinutes,
      horizonDays: branch.bookingHorizonDays,
      slotMinutes: branch.bookingSlotMinutes,
      treatments: effectiveTreatments(branch.bookingTreatments),
      doctorIds: branch.bookingDoctorIds,
      note: branch.bookingNote ?? "",
    },
    suggestedSlug: suggestSlug(branch.name),
    clinicians: clinicians.map(({ id, name }) => ({ id, name })),
    branchName: branch.name,
    hasHours: hasAnyHours(parseOperatingHours(branch.operatingHours)) || clinicians.some((c) => c.hasSchedule),
    canEdit: true,
  };
  return NextResponse.json(payload);
}

export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const auth = await authorize(branchId);
  if (!auth.ok) return auth.response;
  return respond(branchId);
}

export async function PUT(req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const auth = await authorize(branchId);
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 422 });
  }
  const data = parsed.data;
  if (data.slug && !isValidSlug(data.slug)) return NextResponse.json({ error: "invalid_slug" }, { status: 422 });
  if (data.enabled && !data.slug) return NextResponse.json({ error: "slug_required" }, { status: 422 });

  const clinicianIds = new Set((await loadClinicians(branchId)).map((c) => c.id));
  const doctorIds = [...new Set(data.doctorIds)];
  if (doctorIds.some((id) => !clinicianIds.has(id))) {
    return NextResponse.json({ error: "doctor_not_in_branch" }, { status: 422 });
  }

  if (data.slug) {
    const taken = await prisma.branch.findFirst({
      where: { bookingSlug: data.slug, id: { not: branchId } },
      select: { id: true },
    });
    if (taken) return NextResponse.json({ error: "slug_taken" }, { status: 409 });
  }

  try {
    await prisma.branch.update({
      where: { id: branchId },
      data: {
        bookingEnabled: data.enabled,
        bookingSlug: data.slug || null,
        bookingLeadMinutes: data.leadMinutes,
        bookingHorizonDays: data.horizonDays,
        bookingSlotMinutes: data.slotMinutes,
        bookingTreatments: [...new Set(data.treatments)],
        bookingDoctorIds: doctorIds,
        bookingNote: data.note || null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "slug_taken" }, { status: 409 });
    }
    throw e;
  }
  return respond(branchId);
}
