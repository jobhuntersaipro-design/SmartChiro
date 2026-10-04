import { prisma } from "@/lib/prisma";
import { sendReminderTemplate } from "@/lib/whatsapp/send";
import { reminderTemplateParams } from "@/lib/whatsapp/templates";
import { CLINIC_TIME_ZONE } from "@/lib/clinic-time";
import { sendReminderEmail } from "@/lib/email";
import { plannedReminders, resolveChannels } from "./materialize";
import { renderTemplate } from "./templates";
import { reminderEmailHtml, reminderEmailText } from "./default-templates";
import { toTemplateLang } from "@/lib/whatsapp/template-text";
import type { TemplateLang } from "@/types/whatsapp";
import { backoffMs, MAX_ATTEMPTS } from "./backoff";
import { shouldFallback, oppositeChannel } from "./fallback";
import type { TemplateContext, Templates } from "@/types/reminder";

const HORIZON_DAYS = 8;
const BATCH_SIZE = 200;

/**
 * Insert AppointmentReminder rows for SCHEDULED appointments within the
 * next HORIZON_DAYS, idempotently. Returns the number of rows inserted.
 */
export async function materializePending(now: Date): Promise<number> {
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);

  const appts = await prisma.appointment.findMany({
    where: {
      status: "SCHEDULED",
      dateTime: { gt: now, lte: horizon },
      branch: { reminderSettings: { is: { enabled: true } } },
    },
    include: {
      patient: { select: { phone: true, email: true, reminderChannel: true } },
      branch: { select: { reminderSettings: true } },
    },
  });

  let inserted = 0;
  for (const a of appts) {
    // A row removed while we work (deleted branch/appointment) is skipped,
    // never allowed to stop the batch for every other clinic.
    const settings = a.branch?.reminderSettings;
    if (!settings || !a.patient) continue;
    const channels = resolveChannels({
      pref: a.patient.reminderChannel,
      hasPhone: Boolean(a.patient.phone),
      hasEmail: Boolean(a.patient.email),
    });
    const planned = plannedReminders({
      appointmentDateTime: a.dateTime,
      now,
      offsetsMin: settings.offsetsMin,
      channels,
    });

    for (const p of planned) {
      const r = await prisma.appointmentReminder
        .upsert({
        where: {
          appointmentId_channel_offsetMin_isFallback: {
            appointmentId: a.id,
            channel: p.channel,
            offsetMin: p.offsetMin,
            isFallback: false,
          },
        },
        create: {
          appointmentId: a.id,
          channel: p.channel,
          offsetMin: p.offsetMin,
          scheduledFor: p.scheduledFor,
          isFallback: false,
        },
        update: {},
        select: { createdAt: true, updatedAt: true },
      })
        .catch((e: unknown) => {
          console.error("reminder materialize failed", { appointmentId: a.id, error: e });
          return null;
        });
      if (r && r.createdAt.getTime() === r.updatedAt.getTime()) inserted++;
    }
  }
  return inserted;
}

/**
 * Rows are queued up to 8 days ahead, so re-check at send time: the visit
 * must still be booked and in the future, the branch must still send this
 * reminder, and the patient must still want it on this channel.
 */
export function reasonToSkip(
  r: {
    channel: string;
    offsetMin: number;
    isFallback: boolean;
    appointment: {
      status: string;
      dateTime: Date;
      patient: { reminderChannel: Parameters<typeof resolveChannels>[0]["pref"]; phone: string | null; email: string | null };
    };
  },
  settings: { enabled: boolean; offsetsMin: number[] } | null,
  now: Date,
): string | null {
  const { appointment: a } = r;
  if (a.status !== "SCHEDULED") return `appointment status: ${a.status}`;
  if (a.dateTime.getTime() <= now.getTime()) return "appointment already started";
  if (!settings?.enabled) return "reminders turned off for the branch";
  if (!settings.offsetsMin.includes(r.offsetMin)) return "reminder time no longer used by the branch";
  if (a.patient.reminderChannel === "NONE") return "patient opted out of reminders";
  // A fallback row exists because the preferred channel failed; it only needs a contact.
  const channels = resolveChannels({ pref: a.patient.reminderChannel, hasPhone: Boolean(a.patient.phone), hasEmail: Boolean(a.patient.email) });
  if (!r.isFallback && !channels.includes(r.channel as (typeof channels)[number])) return "patient no longer wants this channel";
  return null;
}

// How long a claimed row is invisible to other dispatchers. processOne should
// always finish well under this window; if the runner crashes, the row
// becomes visible again on the next cron tick after this many minutes.
const CLAIM_LEASE_MS = 15 * 60 * 1000;

export async function dispatchDue(now: Date): Promise<{ processed: number }> {
  // Atomically claim a batch using Postgres `FOR UPDATE SKIP LOCKED` so two
  // concurrent cron invocations can't double-dispatch the same reminder.
  // The claim is implemented by bumping `scheduledFor` past `now`, so the
  // standard `status: PENDING AND scheduledFor <= now` filter won't see it
  // again until the lease expires (or processOne updates the row to its
  // terminal state).
  const lease = new Date(now.getTime() + CLAIM_LEASE_MS);
  const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "AppointmentReminder"
    SET "scheduledFor" = ${lease}
    WHERE id IN (
      SELECT id FROM "AppointmentReminder"
      WHERE status = 'PENDING' AND "scheduledFor" <= ${now}
      ORDER BY "scheduledFor" ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;

  // Process concurrently — processOne has its own try/catch at the channel
  // boundary, so a single failure doesn't break the batch.
  await Promise.all(
    claimed.map(({ id }) =>
      processOne(id, now).catch((e) =>
        console.error("processOne failed", { reminderId: id, error: e })
      )
    )
  );

  return { processed: claimed.length };
}

async function processOne(reminderId: string, now: Date): Promise<void> {
  const r = await prisma.appointmentReminder.findUnique({
    where: { id: reminderId },
    include: {
      appointment: {
        include: {
          patient: true,
          branch: { include: { reminderSettings: true } },
          doctor: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!r) return;

  const settings = r.appointment.branch.reminderSettings;
  const skipReason = reasonToSkip(r, settings, now);
  if (skipReason) {
    await prisma.appointmentReminder.update({
      where: { id: r.id },
      data: { status: "SKIPPED", failureReason: skipReason },
    });
    return;
  }

  const templates = (settings?.templates ?? {}) as Partial<Templates>;
  const lang = toTemplateLang(r.appointment.patient.preferredLanguage);

  const ctx = buildContext(r.appointment, lang);
  // WhatsApp sends the Meta-approved template with `ctx` as parameters; only
  // email renders the branch's editable text.
  let body = "";
  let html: string | undefined;
  try {
    if (r.channel === "EMAIL") {
      body = renderTemplate(reminderEmailText(templates, lang), ctx);
      html = renderTemplate(reminderEmailHtml(templates, lang), ctx, { html: true });
    }
  } catch (e) {
    await prisma.appointmentReminder.update({
      where: { id: r.id },
      data: {
        status: "FAILED",
        failureReason: `template_render_error: ${(e as Error).message}`,
      },
    });
    return;
  }

  let result:
    | { ok: true; externalId: string }
    | { ok: false; code: string; message: string };

  if (r.channel === "WHATSAPP") {
    const wa = await sendReminderTemplate({
      branchId: r.appointment.branchId,
      to: r.appointment.patient.phone ?? "",
      lang,
      // Dates follow the language Meta actually sends (fallback when the
      // patient's language isn't approved yet).
      params: (sentLang) => reminderTemplateParams(sentLang === lang ? ctx : buildContext(r.appointment, sentLang)),
    });
    result = wa.ok
      ? { ok: true, externalId: wa.msgId }
      : { ok: false, code: wa.code, message: wa.message };
  } else {
    const subject = reminderSubject(lang, ctx);
    const em = await sendReminderEmail({
      to: r.appointment.patient.email ?? "",
      from: process.env.RESEND_REMINDERS_FROM ?? "reminders@smartchiro.org",
      subject,
      text: body,
      html: html ?? body,
    });
    result = em.ok
      ? { ok: true, externalId: em.id }
      : { ok: false, code: em.reason, message: em.message };
  }

  if (result.ok) {
    await prisma.appointmentReminder.update({
      where: { id: r.id },
      data: { status: "SENT", sentAt: new Date(), externalId: result.externalId },
    });
    return;
  }

  const newAttempt = r.attemptCount + 1;
  const maybeFallback = shouldFallback({
    channel: r.channel as "WHATSAPP" | "EMAIL",
    reason: result.code,
    attemptCount: newAttempt,
    isFallback: r.isFallback,
    hasOtherChannelContact:
      r.channel === "WHATSAPP"
        ? Boolean(r.appointment.patient.email)
        : Boolean(r.appointment.patient.phone),
    pref: r.appointment.patient.reminderChannel,
  });

  if (maybeFallback) {
    await prisma.$transaction([
      prisma.appointmentReminder.update({
        where: { id: r.id },
        data: {
          status: "FAILED",
          attemptCount: newAttempt,
          failureReason: result.message,
        },
      }),
      prisma.appointmentReminder.upsert({
        where: {
          appointmentId_channel_offsetMin_isFallback: {
            appointmentId: r.appointmentId,
            channel: oppositeChannel(r.channel as "WHATSAPP" | "EMAIL"),
            offsetMin: r.offsetMin,
            isFallback: true,
          },
        },
        create: {
          appointmentId: r.appointmentId,
          channel: oppositeChannel(r.channel as "WHATSAPP" | "EMAIL"),
          offsetMin: r.offsetMin,
          scheduledFor: now,
          isFallback: true,
        },
        update: { status: "PENDING", scheduledFor: now },
      }),
    ]);
    return;
  }

  if (newAttempt >= MAX_ATTEMPTS) {
    await prisma.appointmentReminder.update({
      where: { id: r.id },
      data: {
        status: "FAILED",
        attemptCount: newAttempt,
        failureReason: result.message,
      },
    });
    return;
  }

  await prisma.appointmentReminder.update({
    where: { id: r.id },
    data: {
      status: "PENDING",
      attemptCount: newAttempt,
      scheduledFor: new Date(now.getTime() + backoffMs(newAttempt)),
      failureReason: result.message,
    },
  });
}

type AppointmentForContext = {
  dateTime: Date;
  patient: { firstName: string; lastName: string };
  branch: { name: string; address: string | null; phone: string | null };
  doctor: { name: string | null };
};

const DATE_LOCALE: Record<TemplateLang, string> = { en: "en-MY", ms: "ms-MY", zh: "zh-CN" };

function buildContext(
  appt: AppointmentForContext,
  lang: TemplateLang
): TemplateContext {
  const dt = new Date(appt.dateTime);
  const dateLocale = DATE_LOCALE[lang];
  // The server runs in UTC; reminders must show the clinic's wall-clock time.
  const timeZone = CLINIC_TIME_ZONE;
  return {
    patientName: `${appt.patient.firstName} ${appt.patient.lastName}`.trim(),
    firstName: appt.patient.firstName,
    lastName: appt.patient.lastName,
    date: dt.toLocaleDateString(dateLocale, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    }),
    time: dt.toLocaleTimeString(dateLocale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }),
    dayOfWeek: dt.toLocaleDateString(dateLocale, { weekday: "long", timeZone }),
    doctorName: appt.doctor.name ?? (lang === "zh" ? "医生" : "your doctor"),
    branchName: appt.branch.name,
    branchAddress: appt.branch.address ?? "",
    branchPhone: appt.branch.phone ?? "",
  };
}

const REMINDER_SUBJECT: Record<TemplateLang, (c: TemplateContext) => string> = {
  en: (c) => `Appointment reminder: ${c.branchName}, ${c.date} at ${c.time}`,
  ms: (c) => `Peringatan temu janji: ${c.branchName}, ${c.date} pada ${c.time}`,
  zh: (c) => `预约提醒：${c.branchName}，${c.date} ${c.time}`,
};

/** The email subject says what it is, where and when (not the "Hi Siti," greeting). */
export function reminderSubject(lang: TemplateLang, ctx: TemplateContext): string {
  return REMINDER_SUBJECT[lang](ctx).slice(0, 120);
}
