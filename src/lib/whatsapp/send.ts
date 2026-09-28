import { prisma } from "@/lib/prisma";
import { normalizePhoneDigits } from "@/lib/format";
import { decryptSecret } from "./crypto";
import { GraphError, graphRequest, mapGraphError } from "./graph";
import {
  REMINDER_TEMPLATE_NAME,
  metaLanguageCode,
  pickTemplateLanguage,
  statusForTemplate,
  templateByName,
} from "./template-text";
import type { TemplateLang } from "@/types/whatsapp";
import type { WhatsAppErrorCode } from "@/types/reminder";

export type WhatsAppSendResult =
  | { ok: true; msgId: string; lang: TemplateLang }
  | { ok: false; code: WhatsAppErrorCode; message: string };

/** Sends the approved reminder template from the branch's connected number. */
export function sendReminderTemplate(args: {
  branchId: string;
  to: string;
  lang: TemplateLang;
  params: string[] | ((lang: TemplateLang) => string[]);
}): Promise<WhatsAppSendResult> {
  return sendTemplate({ ...args, templateName: REMINDER_TEMPLATE_NAME });
}

/**
 * Sends one of the managed templates (reminder, recall, review) from the
 * branch's connected number, in the patient's language when approved, else
 * another approved language.
 */
export async function sendTemplate(args: {
  branchId: string;
  templateName: string;
  to: string;
  lang: TemplateLang;
  /** Values, or a builder called with the language actually sent (dates follow the template language). */
  params: string[] | ((lang: TemplateLang) => string[]);
}): Promise<WhatsAppSendResult> {
  const account = await prisma.whatsAppAccount.findUnique({ where: { branchId: args.branchId } });
  if (!account || account.status !== "CONNECTED") {
    return { ok: false, code: "session_disconnected", message: "WhatsApp is not connected for this branch" };
  }

  const lang = pickTemplateLanguage(args.lang, statusForTemplate(account.templateStatus, args.templateName));
  if (!lang) {
    const label = templateByName(args.templateName)?.label ?? args.templateName;
    return { ok: false, code: "template_not_approved", message: `${label} template is not approved by Meta yet` };
  }

  const to = normalizePhoneDigits(args.to);
  if (to.length < 8 || to.length > 15) {
    return { ok: false, code: "invalid_e164", message: `Invalid phone number: ${args.to}` };
  }

  const params = typeof args.params === "function" ? args.params(lang) : args.params;

  let token: string;
  try {
    token = decryptSecret(account.accessTokenEnc);
  } catch {
    await markError(account.id, "Stored access token can't be read — reconnect WhatsApp.");
    return { ok: false, code: "session_disconnected", message: "Stored WhatsApp token is unreadable" };
  }

  try {
    const res = await graphRequest<{ messages?: Array<{ id: string }> }>(
      `${account.phoneNumberId}/messages`,
      {
        method: "POST",
        token,
        body: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: args.templateName,
            language: { code: metaLanguageCode(lang) },
            components: [
              { type: "body", parameters: params.map((text) => ({ type: "text", text })) },
            ],
          },
        },
      },
    );
    const msgId = res.messages?.[0]?.id;
    if (!msgId) return { ok: false, code: "unknown", message: "Meta returned no message id" };
    return { ok: true, msgId, lang };
  } catch (e) {
    const code = mapGraphError(e);
    const message = e instanceof GraphError ? e.userMessage : String(e);
    if (code === "session_logged_out") await markError(account.id, message);
    return { ok: false, code, message };
  }
}

async function markError(accountId: string, message: string): Promise<void> {
  await prisma.whatsAppAccount.update({
    where: { id: accountId },
    data: { status: "ERROR", lastError: message },
  });
}
