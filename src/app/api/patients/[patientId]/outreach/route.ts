import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getPatientAccess } from "@/lib/auth/patient-access";
import { OUTREACH_LOG_SELECT } from "@/lib/outreach/dispatcher";
import { sendManualRecall } from "@/lib/outreach/manual";
import { toLogItems } from "@/lib/outreach/log";
import type { PatientOutreachHistory } from "@/types/outreach";
import { paywallCurrentUser } from "@/lib/paywall";

type RouteCtx = { params: Promise<{ patientId: string }> };

const Body = z.object({
  type: z.literal("RECALL"),
  force: z.boolean().optional().default(false),
});

async function load(patientId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const access = await getPatientAccess(session.user.id, patientId);
  if (!access.patient) {
    return { ok: false as const, res: NextResponse.json({ error: "Patient not found" }, { status: 404 }) };
  }
  if (!access.allowed) {
    return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return {
    ok: true as const,
    userId: session.user.id,
    // Sending is a front-desk / management action; the cooldown override is OWNER/ADMIN.
    canSend: can(access.role, "appointment.manageAll"),
    canForce: can(access.role, "reminders.manage"),
  };
}

/** Consent and the recall / review requests sent to this patient (newest first, last 50). */
export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { patientId } = await ctx.params;
  const a = await load(patientId);
  if (!a.ok) return a.res;

  const [patient, rows] = await Promise.all([
    prisma.patient.findUnique({
      where: { id: patientId },
      select: { marketingConsent: true, marketingConsentAt: true },
    }),
    prisma.patientOutreach.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: OUTREACH_LOG_SELECT,
    }),
  ]);
  const body: PatientOutreachHistory = {
    marketingConsent: patient?.marketingConsent ?? false,
    marketingConsentAt: patient?.marketingConsentAt?.toISOString() ?? null,
    items: await toLogItems(rows),
    canSend: a.canSend,
    canForce: a.canForce,
  };
  return NextResponse.json(body);
}

/**
 * Send a recall now. 422 without consent or contact details; 409 when one is
 * already queued or the patient was recalled within the cooldown (OWNER /
 * ADMIN may resend with `force: true`).
 */
export async function POST(req: Request, ctx: RouteCtx): Promise<Response> {
  const blocked = await paywallCurrentUser();
  if (blocked) return blocked;
  const { patientId } = await ctx.params;
  const a = await load(patientId);
  if (!a.ok) return a.res;
  if (!a.canSend) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", message: 'Body must be { "type": "RECALL" }' }, { status: 422 });
  }
  if (parsed.data.force && !a.canForce) {
    return NextResponse.json(
      { error: "forbidden", message: "Only an owner or admin can send a recall inside the cooldown." },
      { status: 403 },
    );
  }

  const result = await sendManualRecall({ patientId, userId: a.userId, force: parsed.data.force });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message, lastRecallAt: result.lastRecallAt, canForce: a.canForce },
      { status: result.status },
    );
  }
  const [item] = await toLogItems([result.outreach]);
  return NextResponse.json({ outreach: item }, { status: 201 });
}
