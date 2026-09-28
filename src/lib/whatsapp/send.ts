import { prisma } from "@/lib/prisma";
import { normalizePhoneDigits } from "@/lib/format";
import { decryptSecret } from "./crypto";
import { GraphError, graphRequest, mapGraphError } from "./graph";
import { pickTemplateLanguage } from "./template-text";
import type { TemplateLang, TemplateStatusMap } from "@/types/whatsapp";
import type { WhatsAppErrorCode } from "@/types/reminder";

export type WhatsAppSendResult =
  | { ok: true; msgId: string; lang: TemplateLang }
  | { ok: false; code: WhatsAppErrorCode; message: string };

/** Sends the approved reminder template from the branch's connected number. */
export async function sendReminderTemplate(args: {
  branchId: string;
  to: string;
  lang: TemplateLang;
  params: string[];
}): Promise<WhatsAppSendResult> {
  const account = await prisma.whatsAppAccount.findUnique({ where: { branchId: args.branchId } });
  if (!account || account.status !== "CONNECTED") {
    return { ok: false, code: "session_disconnected", message: "WhatsApp is not connected for this branch" };
  }

  const lang = pickTemplateLanguage(args.lang, account.templateStatus as TemplateStatusMap);
  if (!lang) {
    return { ok: false, code: "template_not_approved", message: "Reminder template is not approved by Meta yet" };
  }

  const to = normalizePhoneDigits(args.to);
  if (to.length < 8 || to.length > 15) {
    return { ok: false, code: "invalid_e164", message: `Invalid phone number: ${args.to}` };
  }

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
            name: account.templateName,
            language: { code: lang },
            components: [
              { type: "body", parameters: args.params.map((text) => ({ type: "text", text })) },
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
