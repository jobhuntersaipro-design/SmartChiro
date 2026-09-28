import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clinicCalendar } from "@/lib/clinic-time";
import { sendReminderEmail } from "@/lib/email";
import { sendTemplate } from "@/lib/whatsapp/send";
import { recallTemplateParams, reviewTemplateParams } from "@/lib/whatsapp/templates";
import { RECALL_TEMPLATE_NAME, REVIEW_TEMPLATE_NAME, toTemplateLang } from "@/lib/whatsapp/template-text";
import { backoffMs, MAX_ATTEMPTS } from "@/lib/reminders/backoff";
import { renderOutreachEmail } from "./email-templates";
import {
  REVIEW_MAX_AGE_DAYS,
  latestDate,
  nextSendTime,
  outreachChannel,
  recallBlocker,
  reviewBlocker,
  SKIP_REASON_TEXT,
  type OutreachSettings,
} from "./rules";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const BATCH_SIZE = 100;
const CLAIM_LEASE_MS = 15 * 60 * 1000;
const OPEN_STATUSES = ["SCHEDULED", "CHECKED_IN", "IN_PROGRESS"] as const;

/** Patient facts needed to decide a recall, shared with the manual action. */
export const RECALL_PATIENT_SELECT = {
  id: true,
  marketingConsent: true,
  status: true,
  phone: true,
  email: true,
  reminderChannel: true,
  visits: { orderBy: { visitDate: "desc" }, take: 1, select: { visitDate: true } },
} satisfies Prisma.PatientSelect;

/**
 * Latest completed visit / appointment and whether anything is booked from
 * today on, per patient (two grouped queries instead of one per patient).
 */
export async function recallFactsFor(
  patientIds: string[],
  now: Date,
): Promise<Map<string, { lastCompletedAppt: Date | null; hasUpcoming: boolean; lastRecallAt: Date | null }>> {
  const dayStart = clinicCalendar(now).dayStart;
  const [completed, upcoming, recalls] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["patientId"],
      where: { patientId: { in: patientIds }, status: "COMPLETED" },
      _max: { dateTime: true },
    }),
    prisma.appointment.groupBy({
      by: ["patientId"],
      where: { patientId: { in: patientIds }, status: { in: [...OPEN_STATUSES] }, dateTime: { gte: dayStart } },
      _count: { _all: true },
    }),
    prisma.patientOutreach.groupBy({
      by: ["patientId"],
      where: { patientId: { in: patientIds }, type: "RECALL" },
      _max: { createdAt: true },
    }),
  ]);
  const out = new Map<string, { lastCompletedAppt: Date | null; hasUpcoming: boolean; lastRecallAt: Date | null }>();
  for (const id of patientIds) out.set(id, { lastCompletedAppt: null, hasUpcoming: false, lastRecallAt: null });
  for (const c of completed) out.get(c.patientId)!.lastCompletedAppt = c._max.dateTime;
  for (const u of upcoming) out.get(u.patientId)!.hasUpcoming = true;
  for (const r of recalls) out.get(r.patientId)!.lastRecallAt = r._max.createdAt;
  return out;
}

async function materializeRecalls(branchId: string, s: OutreachSettings, now: Date): Promise<number> {
  const cal = clinicCalendar(now);
  const createdToday = await prisma.patientOutreach.count({
    where: { branchId, type: "RECALL", createdAt: { gte: cal.dayStart } },
  });
  const remaining = s.recallDailyLimit - createdToday;
  if (remaining <= 0) return 0;

  const lapsedBefore = new Date(now.getTime() - s.recallAfterDays * DAY_MS);
  // DB pre-filter; recallBlocker has the final say.
  const patients = await prisma.patient.findMany({
    where: {
      branchId,
      marketingConsent: true,
      status: "active",
      OR: [{ phone: { not: null } }, { email: { not: null } }],
      outreach: { none: { type: "RECALL", createdAt: { gte: new Date(now.getTime() - s.recallCooldownDays * DAY_MS) } } },
      visits: { none: { visitDate: { gt: lapsedBefore } } },
    },
    select: RECALL_PATIENT_SELECT,
  });
  if (!patients.length) return 0;
  const facts = await recallFactsFor(patients.map((p) => p.id), now);

  const due = patients
    .map((p) => {
      const f = facts.get(p.id)!;
      const lastCompletedAt = latestDate(p.visits[0]?.visitDate, f.lastCompletedAppt);
      const blocker = recallBlocker({ ...p, lastCompletedAt, hasUpcoming: f.hasUpcoming, lastRecallAt: f.lastRecallAt }, s, now);
      return { p, lastCompletedAt, blocker };
    })
    .filter((x) => x.blocker === null && x.lastCompletedAt)
    // Most recently lapsed first — the likeliest to come back.
    .sort((a, b) => b.lastCompletedAt!.getTime() - a.lastCompletedAt!.getTime())
    .slice(0, remaining);

  const scheduledFor = nextSendTime(now);
  let created = 0;
  for (const { p } of due) {
    const channel = outreachChannel(p);
    if (!channel) continue;
    await prisma.patientOutreach.create({
      data: { patientId: p.id, branchId, type: "RECALL", channel, scheduledFor },
    });
    created++;
  }
  return created;
}

async function materializeReviews(branchId: string, s: OutreachSettings, now: Date): Promise<number> {
  if (!s.googleReviewUrl?.trim()) return 0;
  // Appointments that could have ended inside [now - 3 days, now - delay].
  const appts = await prisma.appointment.findMany({
    where: {
      branchId,
      status: "COMPLETED",
      dateTime: {
        gte: new Date(now.getTime() - REVIEW_MAX_AGE_DAYS * DAY_MS - 12 * HOUR_MS),
        lte: new Date(now.getTime() - s.reviewDelayHours * HOUR_MS),
      },
      outreach: { none: { type: "REVIEW" } },
      patient: { marketingConsent: true },
    },
    orderBy: { dateTime: "desc" },
    select: {
      id: true,
      dateTime: true,
      duration: true,
      patient: { select: { id: true, marketingConsent: true, phone: true, email: true, reminderChannel: true } },
    },
  });
  if (!appts.length) return 0;

  const patientIds = [...new Set(appts.map((a) => a.patient.id))];
  const lastReviews = await prisma.patientOutreach.groupBy({
    by: ["patientId"],
    where: { patientId: { in: patientIds }, type: "REVIEW" },
    _max: { createdAt: true },
  });
  const lastReviewAt = new Map(lastReviews.map((r) => [r.patientId, r._max.createdAt]));

  const scheduledFor = nextSendTime(now);
  const seen = new Set<string>();
  let created = 0;
  for (const a of appts) {
    if (seen.has(a.patient.id)) continue; // one per patient per run (latest visit)
    const completedAt = new Date(a.dateTime.getTime() + a.duration * 60_000);
    const blocker = reviewBlocker(
      {
        ...a.patient,
        completedAt,
        lastReviewAt: lastReviewAt.get(a.patient.id) ?? null,
        alreadyRequestedForAppointment: false,
      },
      s,
      now,
    );
    const channel = outreachChannel(a.patient);
    if (blocker || !channel) continue;
    seen.add(a.patient.id);
    const r = await prisma.patientOutreach.createMany({
      data: [{ patientId: a.patient.id, branchId, type: "REVIEW", channel, scheduledFor, appointmentId: a.id }],
      skipDuplicates: true,
    });
    created += r.count;
  }
  return created;
}

/**
 * Creates PENDING recall / review rows for every branch with outreach
 * switched on. Idempotent within the cooldowns (and one review per
 * appointment by unique key). Returns rows created.
 */
export async function materializeOutreach(now: Date): Promise<{ recalls: number; reviews: number }> {
  const branches = await prisma.branchReminderSettings.findMany({
    where: { OR: [{ recallEnabled: true }, { reviewEnabled: true }] },
  });
  let recalls = 0;
  let reviews = 0;
  for (const s of branches) {
    try {
      if (s.recallEnabled) recalls += await materializeRecalls(s.branchId, s, now);
      if (s.reviewEnabled) reviews += await materializeReviews(s.branchId, s, now);
    } catch (e) {
      console.error("materializeOutreach failed", { branchId: s.branchId, error: e });
    }
  }
  return { recalls, reviews };
}

/** Claims due PENDING rows (FOR UPDATE SKIP LOCKED, like reminders) and sends them. */
export async function dispatchOutreach(now: Date): Promise<{ processed: number }> {
  const lease = new Date(now.getTime() + CLAIM_LEASE_MS);
  const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "PatientOutreach"
    SET "scheduledFor" = ${lease}
    WHERE id IN (
      SELECT id FROM "PatientOutreach"
      WHERE status = 'PENDING' AND "scheduledFor" <= ${now}
      ORDER BY "scheduledFor" ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  for (const { id } of claimed) {
    await processOutreach(id, now).catch((e) => console.error("processOutreach failed", { outreachId: id, error: e }));
  }
  return { processed: claimed.length };
}

type SendResult = { ok: true; externalId: string } | { ok: false; code: string; message: string };

// WhatsApp can't send and retrying won't help → use email instead.
const WA_TERMINAL = new Set([
  "session_disconnected",
  "session_logged_out",
  "template_not_approved",
  "not_on_whatsapp",
  "recipient_not_allowed",
  "invalid_e164",
]);
// Nothing was attempted because the clinic isn't set up — SKIPPED, not FAILED.
const NOT_READY = new Set(["session_disconnected", "session_logged_out", "template_not_approved", "email_not_configured"]);
const EMAIL_TERMINAL = new Set(["invalid_email", "bounce_hard", "email_not_configured"]);

async function loadRow(id: string) {
  return prisma.patientOutreach.findUnique({
    where: { id },
    include: {
      patient: {
        select: {
          firstName: true,
          phone: true,
          email: true,
          marketingConsent: true,
          preferredLanguage: true,
        },
      },
      branch: { select: { name: true, phone: true, reminderSettings: { select: { googleReviewUrl: true } } } },
    },
  });
}
type OutreachRow = NonNullable<Awaited<ReturnType<typeof loadRow>>>;

async function sendWhatsApp(row: OutreachRow, reviewUrl: string): Promise<SendResult> {
  const p = row.patient;
  const wa = await sendTemplate({
    branchId: row.branchId,
    templateName: row.type === "RECALL" ? RECALL_TEMPLATE_NAME : REVIEW_TEMPLATE_NAME,
    to: p.phone ?? "",
    lang: toTemplateLang(p.preferredLanguage),
    params:
      row.type === "RECALL"
        ? recallTemplateParams({ firstName: p.firstName, branchName: row.branch.name, branchPhone: row.branch.phone })
        : reviewTemplateParams({ firstName: p.firstName, branchName: row.branch.name, reviewUrl }),
  });
  return wa.ok ? { ok: true, externalId: wa.msgId } : { ok: false, code: wa.code, message: wa.message };
}

async function sendEmail(row: OutreachRow, reviewUrl: string): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, code: "email_not_configured", message: "Email is not configured (RESEND_API_KEY)" };
  }
  const p = row.patient;
  const msg = renderOutreachEmail(row.type, toTemplateLang(p.preferredLanguage), {
    firstName: p.firstName,
    branchName: row.branch.name,
    branchPhone: row.branch.phone ?? "the clinic",
    reviewUrl,
  });
  const em = await sendReminderEmail({
    to: p.email ?? "",
    from: process.env.RESEND_REMINDERS_FROM ?? "reminders@smartchiro.org",
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
  return em.ok ? { ok: true, externalId: em.id } : { ok: false, code: em.reason, message: em.message };
}

async function finish(id: string, data: Prisma.PatientOutreachUpdateInput): Promise<void> {
  await prisma.patientOutreach.update({ where: { id }, data });
}

export async function processOutreach(id: string, now: Date): Promise<void> {
  const row = await loadRow(id);
  if (!row || row.status !== "PENDING") return;
  const p = row.patient;
  const reviewUrl = row.branch.reminderSettings?.googleReviewUrl?.trim() ?? "";

  // Consent can be withdrawn between queueing and sending.
  if (!p.marketingConsent) return finish(id, { status: "SKIPPED", failureReason: SKIP_REASON_TEXT.no_consent });
  if (row.type === "REVIEW" && !reviewUrl) {
    return finish(id, { status: "SKIPPED", failureReason: SKIP_REASON_TEXT.no_review_url });
  }

  let channel = row.channel === "EMAIL" ? "EMAIL" : "WHATSAPP";
  let result: SendResult;
  let waNote: string | null = null;
  if (channel === "WHATSAPP" && p.phone?.trim()) {
    result = await sendWhatsApp(row, reviewUrl);
    if (!result.ok && WA_TERMINAL.has(result.code) && p.email?.trim()) {
      waNote = `WhatsApp: ${result.message}`;
      channel = "EMAIL";
      result = await sendEmail(row, reviewUrl);
    }
  } else if (p.email?.trim()) {
    channel = "EMAIL";
    result = await sendEmail(row, reviewUrl);
  } else {
    return finish(id, { status: "SKIPPED", failureReason: SKIP_REASON_TEXT.no_contact });
  }

  const channelData = { channel: channel as "WHATSAPP" | "EMAIL" };
  if (result.ok) {
    return finish(id, {
      ...channelData,
      status: "SENT",
      sentAt: now,
      externalId: result.externalId,
      failureReason: waNote,
    });
  }

  const reason = waNote ? `${waNote}; email: ${result.message}` : result.message;
  const attempts = row.attemptCount + 1;
  const terminal = channel === "EMAIL" ? EMAIL_TERMINAL.has(result.code) : WA_TERMINAL.has(result.code);
  if (terminal || attempts >= MAX_ATTEMPTS) {
    const skipped = NOT_READY.has(result.code);
    return finish(id, {
      ...channelData,
      status: skipped ? "SKIPPED" : "FAILED",
      attemptCount: attempts,
      failureReason: reason,
    });
  }
  return finish(id, {
    ...channelData,
    status: "PENDING",
    attemptCount: attempts,
    scheduledFor: new Date(now.getTime() + backoffMs(attempts)),
    failureReason: reason,
  });
}

/** Rows shown in histories and logs. */
export const OUTREACH_LOG_SELECT = {
  id: true,
  type: true,
  channel: true,
  status: true,
  scheduledFor: true,
  sentAt: true,
  failureReason: true,
  attemptCount: true,
  appointmentId: true,
  createdById: true,
  createdAt: true,
} satisfies Prisma.PatientOutreachSelect;

