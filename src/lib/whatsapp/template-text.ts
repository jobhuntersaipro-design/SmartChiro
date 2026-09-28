import type { StoredTemplateStatus, TemplateLang, TemplateStatusMap } from "@/types/whatsapp";

/**
 * The Meta-approved message templates every branch uses. Business-initiated
 * WhatsApp messages must be approved templates, so the text is fixed; bump
 * the `_vN` suffix to change it (Meta locks approved text).
 * Client-safe: no server imports.
 *
 * Meta rejects a body that starts or ends with a parameter, so every
 * language opens with a greeting before `{{1}}`.
 */
export const REMINDER_TEMPLATE_NAME = "smartchiro_appt_reminder_v1";
export const RECALL_TEMPLATE_NAME = "smartchiro_recall_v1";
export const REVIEW_TEMPLATE_NAME = "smartchiro_review_v1";

export const TEMPLATE_LANGS: TemplateLang[] = ["en", "ms", "zh"];

export const LANG_LABEL: Record<TemplateLang, string> = {
  en: "English",
  ms: "Bahasa Melayu",
  zh: "中文",
};

/** Meta's language code (Simplified Chinese is `zh_CN`). */
export function metaLanguageCode(lang: TemplateLang): string {
  return lang === "zh" ? "zh_CN" : lang;
}

/** Our language for a Meta code (`en_US` → en, `zh_CN` → zh), or null. */
export function langFromMetaCode(code: string | null | undefined): TemplateLang | null {
  const base = code?.split("_")[0];
  return base && (TEMPLATE_LANGS as string[]).includes(base) ? (base as TemplateLang) : null;
}

/** A patient's `preferredLanguage` as a template language (unknown → en). */
export function toTemplateLang(value: string | null | undefined): TemplateLang {
  return value === "ms" || value === "zh" ? value : "en";
}

export const SAMPLE_TEMPLATE_PARAMS = ["Aisyah", "SmartChiro KLCC", "Monday, 6 October 2026", "10:30", "Dr. Tan"];

/** Sample values with the branch's own full name in `{{2}}`, for previews. */
export function sampleTemplateParams(branchName?: string | null): string[] {
  const name = branchName?.trim();
  if (!name) return SAMPLE_TEMPLATE_PARAMS;
  const params = [...SAMPLE_TEMPLATE_PARAMS];
  params[1] = name;
  return params;
}

export const REMINDER_TEMPLATE_TEXT: Record<TemplateLang, string> = {
  en: "Hi {{1}}, this is a reminder of your appointment at {{2}} on {{3}} at {{4}} with {{5}}. If you need to reschedule, please reply to this message or call the clinic.",
  ms: "Hai {{1}}, ini peringatan untuk temujanji anda di {{2}} pada {{3}} jam {{4}} bersama {{5}}. Jika anda perlu menukar temujanji, sila balas mesej ini atau hubungi klinik.",
  zh: "您好 {{1}}，提醒您在 {{3}} {{4}} 于 {{2}} 与 {{5}} 有预约。如需改期，请回复此消息或致电诊所。",
};

/** Recall: {{1}} first name, {{2}} branch name, {{3}} branch phone. */
export const RECALL_TEMPLATE_TEXT: Record<TemplateLang, string> = {
  en: "Hi {{1}}, it has been a while since your last visit to {{2}}. Regular check-ups help keep your spine healthy. Reply to this message or call {{3}} to book your next session. Reply STOP to stop these messages.",
  ms: "Hai {{1}}, sudah agak lama sejak lawatan terakhir anda ke {{2}}. Pemeriksaan berkala membantu menjaga kesihatan tulang belakang anda. Balas mesej ini atau hubungi {{3}} untuk menempah sesi seterusnya. Balas BERHENTI untuk berhenti menerima mesej ini.",
  zh: "您好 {{1}}，距离您上次到 {{2}} 就诊已有一段时间。定期检查有助于保持脊椎健康。请回复此消息或致电 {{3}} 预约下一次疗程。回复“停止”即可不再接收此类消息。",
};

/**
 * Review request: {{1}} first name, {{2}} branch name, {{3}} review URL.
 * The URL is a body parameter: a URL button needs a fixed base URL, but every
 * branch has its own Google review link.
 */
export const REVIEW_TEMPLATE_TEXT: Record<TemplateLang, string> = {
  en: "Hi {{1}}, thank you for your recent visit to {{2}}. We would love to hear how it went. Could you leave us a quick review? {{3}} Reply STOP to stop these messages.",
  ms: "Hai {{1}}, terima kasih atas lawatan anda baru-baru ini ke {{2}}. Kami ingin mendengar pendapat anda. Sudi tinggalkan ulasan ringkas? {{3}} Balas BERHENTI untuk berhenti menerima mesej ini.",
  zh: "您好 {{1}}，感谢您近期到访 {{2}}。我们很想听听您的体验，能否花一分钟给我们留个评价？{{3}} 回复“停止”即可不再接收此类消息。",
};

export type TemplateKey = "reminder" | "recall" | "review";

export interface TemplateDefinition {
  key: TemplateKey;
  name: string;
  label: string;
  category: "UTILITY" | "MARKETING";
  text: Record<TemplateLang, string>;
  sample: string[];
}

export const WA_TEMPLATES: Record<TemplateKey, TemplateDefinition> = {
  reminder: {
    key: "reminder",
    name: REMINDER_TEMPLATE_NAME,
    label: "Reminder",
    category: "UTILITY",
    text: REMINDER_TEMPLATE_TEXT,
    sample: SAMPLE_TEMPLATE_PARAMS,
  },
  recall: {
    key: "recall",
    name: RECALL_TEMPLATE_NAME,
    label: "Recall",
    category: "MARKETING",
    text: RECALL_TEMPLATE_TEXT,
    sample: ["Aisyah", "SmartChiro KLCC", "03-2181 1234"],
  },
  review: {
    key: "review",
    name: REVIEW_TEMPLATE_NAME,
    label: "Review request",
    category: "MARKETING",
    text: REVIEW_TEMPLATE_TEXT,
    sample: ["Aisyah", "SmartChiro KLCC", "https://g.page/r/smartchiro-klcc/review"],
  },
};

export const WA_TEMPLATE_LIST: TemplateDefinition[] = [WA_TEMPLATES.reminder, WA_TEMPLATES.recall, WA_TEMPLATES.review];

export function templateByName(name: string): TemplateDefinition | null {
  return WA_TEMPLATE_LIST.find((t) => t.name === name) ?? null;
}

function fill(text: string, params: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
}

export function renderTemplatePreview(lang: TemplateLang, params: string[] = SAMPLE_TEMPLATE_PARAMS): string {
  return fill(REMINDER_TEMPLATE_TEXT[lang], params);
}

export function renderTemplateText(key: TemplateKey, lang: TemplateLang, params?: string[]): string {
  const def = WA_TEMPLATES[key];
  return fill(def.text[lang], params ?? def.sample);
}

/** Per-language status of one template from the stored JSON (see StoredTemplateStatus). */
export function statusForTemplate(stored: unknown, name: string): TemplateStatusMap {
  const s = (stored ?? {}) as StoredTemplateStatus;
  if (name === REMINDER_TEMPLATE_NAME) {
    const out: TemplateStatusMap = {};
    for (const l of TEMPLATE_LANGS) if (typeof s[l] === "string") out[l] = s[l];
    return out;
  }
  return { ...(s.templates?.[name] ?? {}) };
}

/** Status of every managed template, keyed by name (missing → `{}`). */
export function allTemplateStatuses(stored: unknown): Record<string, TemplateStatusMap> {
  return Object.fromEntries(WA_TEMPLATE_LIST.map((t) => [t.name, statusForTemplate(stored, t.name)]));
}

/** Returns a copy of the stored JSON with one template language's status set. */
export function withTemplateStatus(
  stored: unknown,
  name: string,
  lang: TemplateLang,
  status: string,
): StoredTemplateStatus {
  const s = { ...((stored ?? {}) as StoredTemplateStatus) };
  if (name === REMINDER_TEMPLATE_NAME) {
    s[lang] = status;
    return s;
  }
  const templates = { ...(s.templates ?? {}) };
  templates[name] = { ...(templates[name] ?? {}), [lang]: status };
  s.templates = templates;
  return s;
}

/** Builds the stored JSON from per-template status maps. */
export function toStoredTemplateStatus(byName: Record<string, TemplateStatusMap>): StoredTemplateStatus {
  const { [REMINDER_TEMPLATE_NAME]: reminder = {}, ...rest } = byName;
  return { ...reminder, templates: rest };
}

/** Patient's language if approved, else the first approved language (en, ms, zh), else null. */
export function pickTemplateLanguage(
  preferred: TemplateLang,
  status: TemplateStatusMap,
): TemplateLang | null {
  if (status[preferred] === "APPROVED") return preferred;
  return TEMPLATE_LANGS.find((l) => status[l] === "APPROVED") ?? null;
}
