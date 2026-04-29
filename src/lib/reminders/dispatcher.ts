import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/wa/worker-client";
import { sendReminderEmail } from "@/lib/email";
import { plannedReminders, resolveChannels } from "./materialize";
import { renderTemplate } from "./templates";
import { DEFAULT_TEMPLATES } from "./default-templates";
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
    const settings = a.branch.reminderSettings;
    if (!settings) continue;
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
      const r = await prisma.appointmentReminder.upsert({
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
      });
      if (r.createdAt.getTime() === r.updatedAt.getTime()) inserted++;
    }
  }
  return inserted;
}

export async function dispatchDue(now: Date): Promise<{ processed: number }> {
  const due = await prisma.appointmentReminder.findMany({
    where: { status: "PENDING", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: BATCH_SIZE,
    select: { id: true },
  });

  let processed = 0;
  for (const { id } of due) {
    await processOne(id, now);
    processed++;
  }
  return { processed };
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

  if (r.appointment.status !== "SCHEDULED") {
    await prisma.appointmentReminder.update({
      where: { id: r.id },
      data: { status: "SKIPPED", failureReason: `appointment status: ${r.appointment.status}` },
    });
    return;
  }

  const settings = r.appointment.branch.reminderSettings;
  const templates = (settings?.templates ?? {}) as Partial<Templates>;
  const lang = (r.appointment.patient.preferredLanguage === "ms" ? "ms" : "en") as "en" | "ms";

  const ctx = buildContext(r.appointment, lang);
  let body: string;
  let html: string | undefined;
  try {
    if (r.channel === "WHATSAPP") {
      body = renderTemplate(
        templates.whatsapp?.[lang] ?? DEFAULT_TEMPLATES.whatsapp[lang],
        ctx
      );
    } else {
      body = renderTemplate(
        templates.email?.[lang] ?? DEFAULT_TEMPLATES.email[lang],
        ctx
      );
      html = renderTemplate(
        (lang === "ms" ? templates.email?.htmlMs : templates.email?.htmlEn) ??
          (lang === "ms" ? DEFAULT_TEMPLATES.email.htmlMs : DEFAULT_TEMPLATES.email.htmlEn),
        ctx
      );
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
    const wa = await sendMessage({
      branchId: r.appointment.branchId,
      to: r.appointment.patient.phone ?? "",
      body,
    });
    result = wa.ok
      ? { ok: true, externalId: wa.msgId }
      : { ok: false, code: wa.code, message: wa.message };
  } else {
    const subject = subjectFromBody(body);
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

function buildContext(
  appt: AppointmentForContext,
  lang: "en" | "ms"
): TemplateContext {
  const dt = new Date(appt.dateTime);
  const dateLocale = lang === "ms" ? "ms-MY" : "en-MY";
  return {
    patientName: `${appt.patient.firstName} ${appt.patient.lastName}`.trim(),
    firstName: appt.patient.firstName,
    lastName: appt.patient.lastName,
    date: dt.toLocaleDateString(dateLocale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    time: dt.toLocaleTimeString(dateLocale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    dayOfWeek: dt.toLocaleDateString(dateLocale, { weekday: "long" }),
    doctorName: appt.doctor.name ?? "your doctor",
    branchName: appt.branch.name,
    branchAddress: appt.branch.address ?? "",
    branchPhone: appt.branch.phone ?? "",
  };
}

function subjectFromBody(body: string): string {
  return body.split("\n")[0].slice(0, 80) || "Appointment reminder";
}
