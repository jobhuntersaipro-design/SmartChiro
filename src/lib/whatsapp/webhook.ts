import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizePhoneDigits } from "@/lib/format";
import { langFromMetaCode, templateByName, withTemplateStatus } from "./template-text";
import type { TemplateLang } from "@/types/whatsapp";

/** Verifies Meta's `X-Hub-Signature-256: sha256=<hex>` over the raw body. */
export function verifyMetaSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type WebhookEvent =
  | { kind: "message_failed"; msgId: string; reason: string }
  | { kind: "template_status"; wabaId: string; name: string; lang: TemplateLang; status: string }
  | { kind: "account_removed"; wabaId: string; reason: string }
  | { kind: "opt_out"; phoneNumberId: string; from: string };

const REMOVAL_EVENTS = new Set([
  "PARTNER_REMOVED",
  "PARTNER_APP_UNINSTALLED",
  "ACCOUNT_DELETED",
  "ACCOUNT_OFFBOARDED",
]);

/** Opt-out keywords the outreach templates tell patients to reply with. */
const STOP_WORDS = new Set(["stop", "berhenti", "停止", "unsubscribe"]);

/** True when an inbound message is an opt-out ("STOP", "Berhenti", "停止"), ignoring case and punctuation. */
export function isOptOutText(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text
    .trim()
    .toLowerCase()
    .replace(/^[\s"'“”「」.!。！]+|[\s"'“”「」.!。！]+$/g, "");
  return STOP_WORDS.has(t);
}

interface InboundMessage {
  from?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
}

interface Change {
  field?: string;
  value?: {
    metadata?: { phone_number_id?: string };
    messages?: InboundMessage[];
    statuses?: Array<{
      id?: string;
      status?: string;
      errors?: Array<{ code?: number; title?: string; message?: string }>;
    }>;
    event?: string;
    message_template_name?: string;
    message_template_language?: string;
    reason?: string | null;
  };
}

interface Payload {
  object?: string;
  entry?: Array<{ id?: string; changes?: Change[] }>;
}

function messageEvents(v: NonNullable<Change["value"]>): WebhookEvent[] {
  const out: WebhookEvent[] = [];
  for (const s of v.statuses ?? []) {
    if (s.status !== "failed" || !s.id) continue;
    const err = s.errors?.[0];
    const detail = err?.title ?? err?.message ?? "failed";
    out.push({
      kind: "message_failed",
      msgId: s.id,
      reason: `wa_failed: ${detail}${err?.code ? ` (${err.code})` : ""}`,
    });
  }
  const phoneNumberId = v.metadata?.phone_number_id;
  for (const m of v.messages ?? []) {
    const text = m.type === "button" ? (m.button?.text ?? m.button?.payload) : m.text?.body;
    if (phoneNumberId && m.from && isOptOutText(text)) {
      out.push({ kind: "opt_out", phoneNumberId, from: m.from });
    }
  }
  return out;
}

/** Pulls the events we act on out of a Meta webhook payload; ignores the rest. */
export function extractWebhookEvents(payload: unknown): WebhookEvent[] {
  const p = payload as Payload;
  if (p?.object !== "whatsapp_business_account") return [];
  const out: WebhookEvent[] = [];
  for (const entry of p.entry ?? []) {
    const wabaId = entry.id ?? "";
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      if (change.field === "messages") {
        out.push(...messageEvents(v));
      } else if (change.field === "message_template_status_update") {
        const lang = langFromMetaCode(v.message_template_language);
        if (wabaId && v.event && v.message_template_name && lang) {
          out.push({ kind: "template_status", wabaId, name: v.message_template_name, lang, status: v.event });
        }
      } else if (change.field === "account_update") {
        if (wabaId && v.event && REMOVAL_EVENTS.has(v.event)) {
          out.push({ kind: "account_removed", wabaId, reason: v.event });
        }
      }
    }
  }
  return out;
}

/**
 * Clears marketing consent for every consenting patient whose phone matches
 * `from` (Meta's wa_id, digits with country code) in the branches connected
 * to that phone number. Returns the number of patients opted out.
 */
export async function applyOptOut(phoneNumberId: string, from: string): Promise<number> {
  const accounts = await prisma.whatsAppAccount.findMany({
    where: { phoneNumberId },
    select: { branchId: true },
  });
  if (!accounts.length) return 0;
  const target = normalizePhoneDigits(from);
  const candidates = await prisma.patient.findMany({
    where: {
      branchId: { in: accounts.map((a) => a.branchId) },
      marketingConsent: true,
      phone: { not: null },
    },
    select: { id: true, phone: true },
  });
  const ids = candidates.filter((p) => p.phone && normalizePhoneDigits(p.phone) === target).map((p) => p.id);
  if (!ids.length) return 0;
  await prisma.$transaction([
    prisma.patient.updateMany({
      where: { id: { in: ids } },
      data: { marketingConsent: false, marketingConsentAt: null },
    }),
    // Anything still queued for them must not go out.
    prisma.patientOutreach.updateMany({
      where: { patientId: { in: ids }, status: "PENDING" },
      data: { status: "SKIPPED", failureReason: "opted_out" },
    }),
  ]);
  return ids.length;
}

/**
 * Meta accepted a message, then reported it failed (e.g. the number isn't on
 * WhatsApp). Like a failure at send time, it falls back to email: a reminder
 * gets its email fallback row (patients who chose WhatsApp only — "Both"
 * already had an email), a recall/review goes out by email instead.
 */
async function failWhatsAppMessage(msgId: string, reason: string): Promise<void> {
  const now = new Date();
  const reminders = await prisma.appointmentReminder.findMany({
    where: { externalId: msgId, channel: "WHATSAPP" },
    select: {
      id: true,
      appointmentId: true,
      offsetMin: true,
      isFallback: true,
      appointment: { select: { status: true, dateTime: true, patient: { select: { email: true, reminderChannel: true } } } },
    },
  });
  for (const r of reminders) {
    await prisma.appointmentReminder.update({ where: { id: r.id }, data: { status: "FAILED", failureReason: reason } });
    const { appointment: appt } = r;
    const fallback =
      !r.isFallback &&
      appt.status === "SCHEDULED" &&
      appt.dateTime > now &&
      appt.patient.reminderChannel === "WHATSAPP" &&
      Boolean(appt.patient.email?.trim());
    if (!fallback) continue;
    await prisma.appointmentReminder.upsert({
      where: {
        appointmentId_channel_offsetMin_isFallback: { appointmentId: r.appointmentId, channel: "EMAIL", offsetMin: r.offsetMin, isFallback: true },
      },
      create: { appointmentId: r.appointmentId, channel: "EMAIL", offsetMin: r.offsetMin, scheduledFor: now, isFallback: true },
      update: {},
    });
  }

  const outreach = await prisma.patientOutreach.findMany({
    where: { externalId: msgId, channel: "WHATSAPP" },
    select: { id: true, patient: { select: { email: true } } },
  });
  for (const o of outreach) {
    await prisma.patientOutreach.update({
      where: { id: o.id },
      data: o.patient.email?.trim()
        ? { status: "PENDING", channel: "EMAIL", scheduledFor: now, externalId: null, failureReason: `WhatsApp: ${reason}` }
        : { status: "FAILED", failureReason: reason },
    });
  }
}

export async function applyWebhookEvent(e: WebhookEvent): Promise<void> {
  switch (e.kind) {
    case "message_failed":
      await failWhatsAppMessage(e.msgId, e.reason);
      return;
    case "template_status": {
      if (!templateByName(e.name)) return;
      const accounts = await prisma.whatsAppAccount.findMany({
        where: { wabaId: e.wabaId },
        select: { id: true, templateStatus: true },
      });
      for (const a of accounts) {
        await prisma.whatsAppAccount.update({
          where: { id: a.id },
          data: {
            templateStatus: withTemplateStatus(a.templateStatus, e.name, e.lang, e.status),
            templatesCheckedAt: new Date(),
          },
        });
      }
      return;
    }
    case "account_removed":
      await prisma.whatsAppAccount.updateMany({
        where: { wabaId: e.wabaId },
        data: {
          status: "ERROR",
          lastError: `Disconnected in Meta (${e.reason}). Reconnect WhatsApp to resume reminders.`,
        },
      });
      return;
    case "opt_out":
      await applyOptOut(e.phoneNumberId, e.from);
      return;
  }
}
