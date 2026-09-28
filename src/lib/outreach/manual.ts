import type { PatientOutreach } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { processOutreach, recallFactsFor, RECALL_PATIENT_SELECT } from "./dispatcher";
import {
  DEFAULT_OUTREACH_SETTINGS,
  latestDate,
  outreachChannel,
  recallBlocker,
  SKIP_REASON_TEXT,
  type OutreachSettings,
} from "./rules";

const CLAIM_LEASE_MS = 15 * 60 * 1000;

export type ManualRecallResult =
  | { ok: true; outreach: PatientOutreach }
  | { ok: false; status: 404 | 409 | 422; error: string; message: string; lastRecallAt?: string | null };

/**
 * "Send recall" from the dashboard or a patient: queues a RECALL scheduled
 * now and sends it straight away. Consent is always required; a recall
 * inside the cooldown needs `force` (OWNER / ADMIN only — the caller checks).
 * The last-visit interval and upcoming bookings don't apply: staff decide.
 */
export async function sendManualRecall(args: {
  patientId: string;
  userId: string;
  force: boolean;
  now?: Date;
}): Promise<ManualRecallResult> {
  const now = args.now ?? new Date();
  const patient = await prisma.patient.findUnique({
    where: { id: args.patientId },
    select: { ...RECALL_PATIENT_SELECT, branchId: true, branch: { select: { reminderSettings: true } } },
  });
  if (!patient) return { ok: false, status: 404, error: "not_found", message: "Patient not found" };

  const pending = await prisma.patientOutreach.findFirst({
    where: { patientId: patient.id, type: "RECALL", status: "PENDING" },
    select: { id: true },
  });
  if (pending) {
    return { ok: false, status: 409, error: "already_queued", message: "A recall for this patient is already queued" };
  }

  const settings: OutreachSettings = patient.branch.reminderSettings ?? DEFAULT_OUTREACH_SETTINGS;
  const facts = (await recallFactsFor([patient.id], now)).get(patient.id)!;
  const blocker = recallBlocker(
    {
      ...patient,
      lastCompletedAt: latestDate(patient.visits[0]?.visitDate, facts.lastCompletedAppt),
      hasUpcoming: facts.hasUpcoming,
      lastRecallAt: facts.lastRecallAt,
    },
    settings,
    now,
    { ignoreTiming: true, ignoreCooldown: args.force },
  );
  if (blocker === "cooldown") {
    return {
      ok: false,
      status: 409,
      error: "cooldown",
      message: `Recalled within the last ${settings.recallCooldownDays} days`,
      lastRecallAt: facts.lastRecallAt?.toISOString() ?? null,
    };
  }
  const channel = outreachChannel(patient);
  if (blocker || !channel) {
    const code = blocker ?? "no_contact";
    return { ok: false, status: 422, error: code, message: SKIP_REASON_TEXT[code] };
  }

  const row = await prisma.patientOutreach.create({
    data: {
      patientId: patient.id,
      branchId: patient.branchId,
      type: "RECALL",
      channel,
      scheduledFor: now,
      createdById: args.userId,
    },
  });
  await sendOneNow(row.id, now);
  const outreach = await prisma.patientOutreach.findUniqueOrThrow({ where: { id: row.id } });
  return { ok: true, outreach };
}

/** Claims one due row the same way the cron does (so they never both send it), then sends it. */
export async function sendOneNow(id: string, now: Date): Promise<void> {
  const lease = new Date(now.getTime() + CLAIM_LEASE_MS);
  const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "PatientOutreach"
    SET "scheduledFor" = ${lease}
    WHERE id IN (
      SELECT id FROM "PatientOutreach"
      WHERE id = ${id} AND status = 'PENDING' AND "scheduledFor" <= ${now}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  if (!claimed.length) return;
  try {
    await processOutreach(id, now);
  } catch (e) {
    // Leave it PENDING; the cron picks it up after the lease.
    console.error("manual outreach send failed", { outreachId: id, error: e });
  }
}
