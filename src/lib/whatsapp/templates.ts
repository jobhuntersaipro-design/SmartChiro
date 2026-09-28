import { GraphError, graphRequest } from "./graph";
import type { TemplateContext } from "@/types/reminder";
import {
  REMINDER_TEMPLATE_NAME,
  TEMPLATE_LANGS,
  WA_TEMPLATE_LIST,
  langFromMetaCode,
  metaLanguageCode,
  toStoredTemplateStatus,
  type TemplateDefinition,
} from "./template-text";
import type { StoredTemplateStatus, TemplateStatusMap } from "@/types/whatsapp";

export {
  REMINDER_TEMPLATE_NAME,
  RECALL_TEMPLATE_NAME,
  REVIEW_TEMPLATE_NAME,
  SAMPLE_TEMPLATE_PARAMS,
  pickTemplateLanguage,
} from "./template-text";

/** Meta rejects empty params and newlines / tabs / 4+ spaces in params. */
function cleanParam(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim() || "-";
}

/** Body parameters in template order. */
export function reminderTemplateParams(ctx: TemplateContext): string[] {
  return [
    ctx.firstName,
    ctx.branchName,
    `${ctx.dayOfWeek}, ${ctx.date}`,
    ctx.time,
    ctx.doctorName,
  ].map(cleanParam);
}

/** Recall body parameters: first name, branch name, branch phone. */
export function recallTemplateParams(p: {
  firstName: string;
  branchName: string;
  branchPhone: string | null;
}): string[] {
  return [p.firstName, p.branchName, p.branchPhone?.trim() ? p.branchPhone : "the clinic"].map(cleanParam);
}

/** Review body parameters: first name, branch name, review URL. */
export function reviewTemplateParams(p: { firstName: string; branchName: string; reviewUrl: string }): string[] {
  return [p.firstName, p.branchName, p.reviewUrl].map(cleanParam);
}

interface TemplateListResponse {
  data: Array<{ name: string; language: string; status: string }>;
}

export async function fetchTemplateStatus(
  wabaId: string,
  token: string,
  name: string = REMINDER_TEMPLATE_NAME,
): Promise<TemplateStatusMap> {
  const res = await graphRequest<TemplateListResponse>(`${wabaId}/message_templates`, {
    token,
    query: { name, fields: "name,language,status", limit: "50" },
  });
  const out: TemplateStatusMap = {};
  for (const t of res.data ?? []) {
    if (t.name !== name) continue;
    const lang = langFromMetaCode(t.language);
    if (lang) out[lang] = t.status;
  }
  return out;
}

async function ensureTemplate(
  wabaId: string,
  token: string,
  def: TemplateDefinition,
): Promise<{ status: TemplateStatusMap; errors: string[] }> {
  const status = await fetchTemplateStatus(wabaId, token, def.name);
  const errors: string[] = [];
  for (const lang of TEMPLATE_LANGS) {
    if (status[lang] && status[lang] !== "CREATE_FAILED") continue;
    try {
      const created = await graphRequest<{ id: string; status?: string }>(`${wabaId}/message_templates`, {
        method: "POST",
        token,
        body: {
          name: def.name,
          language: metaLanguageCode(lang),
          category: def.category,
          components: [
            {
              type: "BODY",
              text: def.text[lang],
              example: { body_text: [def.sample] },
            },
          ],
        },
      });
      status[lang] = created.status ?? "PENDING";
    } catch (e) {
      status[lang] = "CREATE_FAILED";
      errors.push(`${def.label} ${lang}: ${e instanceof GraphError ? e.userMessage : String(e)}`);
    }
  }
  return { status, errors };
}

/**
 * Creates any missing language of every managed template (reminder, recall,
 * review) on the WABA and returns the stored-status JSON plus per-template
 * create errors. A template that can't be read or created doesn't stop the
 * others.
 */
export async function ensureWhatsAppTemplates(
  wabaId: string,
  token: string,
): Promise<{ status: StoredTemplateStatus; errors: string[] }> {
  const byName: Record<string, TemplateStatusMap> = {};
  const errors: string[] = [];
  for (const def of WA_TEMPLATE_LIST) {
    try {
      const r = await ensureTemplate(wabaId, token, def);
      byName[def.name] = r.status;
      errors.push(...r.errors);
    } catch (e) {
      // Listing failed (e.g. token without template permission) — the
      // reminder must keep failing loudly, the others are best-effort.
      if (def.name === REMINDER_TEMPLATE_NAME) throw e;
      byName[def.name] = {};
      errors.push(`${def.label}: ${e instanceof GraphError ? e.userMessage : String(e)}`);
    }
  }
  return { status: toStoredTemplateStatus(byName), errors };
}

/** @deprecated Use ensureWhatsAppTemplates — kept for existing callers; ensures all templates. */
export const ensureReminderTemplates = ensureWhatsAppTemplates;
