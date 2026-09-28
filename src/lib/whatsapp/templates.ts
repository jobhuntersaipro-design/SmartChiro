import { GraphError, graphRequest } from "./graph";
import type { TemplateContext } from "@/types/reminder";
import {
  REMINDER_TEMPLATE_NAME,
  REMINDER_TEMPLATE_TEXT,
  SAMPLE_TEMPLATE_PARAMS,
  TEMPLATE_LANGS,
} from "./template-text";
import type { TemplateLang, TemplateStatusMap } from "@/types/whatsapp";

export {
  REMINDER_TEMPLATE_NAME,
  SAMPLE_TEMPLATE_PARAMS,
  pickTemplateLanguage,
} from "./template-text";

/** Body parameters in template order. Meta rejects empty params and newlines. */
export function reminderTemplateParams(ctx: TemplateContext): string[] {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim() || "-";
  return [
    ctx.firstName,
    ctx.branchName,
    `${ctx.dayOfWeek}, ${ctx.date}`,
    ctx.time,
    ctx.doctorName,
  ].map(clean);
}

interface TemplateListResponse {
  data: Array<{ name: string; language: string; status: string }>;
}

export async function fetchTemplateStatus(wabaId: string, token: string): Promise<TemplateStatusMap> {
  const res = await graphRequest<TemplateListResponse>(`${wabaId}/message_templates`, {
    token,
    query: { name: REMINDER_TEMPLATE_NAME, fields: "name,language,status", limit: "50" },
  });
  const out: TemplateStatusMap = {};
  for (const t of res.data ?? []) {
    if (t.name !== REMINDER_TEMPLATE_NAME) continue;
    const lang = t.language.split("_")[0] as TemplateLang;
    if (TEMPLATE_LANGS.includes(lang)) out[lang] = t.status;
  }
  return out;
}

/**
 * Creates any missing language of the reminder template on the WABA and
 * returns the current status per language plus per-language create errors.
 */
export async function ensureReminderTemplates(
  wabaId: string,
  token: string,
): Promise<{ status: TemplateStatusMap; errors: string[] }> {
  const status = await fetchTemplateStatus(wabaId, token);
  const errors: string[] = [];
  for (const lang of TEMPLATE_LANGS) {
    if (status[lang] && status[lang] !== "CREATE_FAILED") continue;
    try {
      const created = await graphRequest<{ id: string; status?: string }>(
        `${wabaId}/message_templates`,
        {
          method: "POST",
          token,
          body: {
            name: REMINDER_TEMPLATE_NAME,
            language: lang,
            category: "UTILITY",
            components: [
              {
                type: "BODY",
                text: REMINDER_TEMPLATE_TEXT[lang],
                example: { body_text: [SAMPLE_TEMPLATE_PARAMS] },
              },
            ],
          },
        },
      );
      status[lang] = created.status ?? "PENDING";
    } catch (e) {
      status[lang] = "CREATE_FAILED";
      errors.push(`${lang}: ${e instanceof GraphError ? e.userMessage : String(e)}`);
    }
  }
  return { status, errors };
}
