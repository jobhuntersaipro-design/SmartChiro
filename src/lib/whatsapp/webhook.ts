import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { TEMPLATE_LANGS } from "./template-text";
import type { TemplateLang, TemplateStatusMap } from "@/types/whatsapp";

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
  | { kind: "account_removed"; wabaId: string; reason: string };

const REMOVAL_EVENTS = new Set([
  "PARTNER_REMOVED",
  "PARTNER_APP_UNINSTALLED",
  "ACCOUNT_DELETED",
  "ACCOUNT_OFFBOARDED",
]);

interface Change {
  field?: string;
  value?: {
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
      } else if (change.field === "message_template_status_update") {
        const lang = v.message_template_language?.split("_")[0] as TemplateLang | undefined;
        if (wabaId && v.event && v.message_template_name && lang && TEMPLATE_LANGS.includes(lang)) {
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

export async function applyWebhookEvent(e: WebhookEvent): Promise<void> {
  switch (e.kind) {
    case "message_failed":
      await prisma.appointmentReminder.updateMany({
        where: { externalId: e.msgId, channel: "WHATSAPP" },
        data: { status: "FAILED", failureReason: e.reason },
      });
      return;
    case "template_status": {
      const accounts = await prisma.whatsAppAccount.findMany({
        where: { wabaId: e.wabaId, templateName: e.name },
        select: { id: true, templateStatus: true },
      });
      for (const a of accounts) {
        const status = { ...(a.templateStatus as TemplateStatusMap), [e.lang]: e.status };
        await prisma.whatsAppAccount.update({
          where: { id: a.id },
          data: { templateStatus: status, templatesCheckedAt: new Date() },
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
  }
}
