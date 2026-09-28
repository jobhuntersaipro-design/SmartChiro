import type { TemplateLang, TemplateStatusMap } from "@/types/whatsapp";

/**
 * The one approved message template every branch uses for reminders.
 * Business-initiated WhatsApp messages must be Meta-approved templates, so the
 * text is fixed; bump the `_vN` suffix to change it (Meta locks approved text).
 * Client-safe: no server imports.
 */
export const REMINDER_TEMPLATE_NAME = "smartchiro_appt_reminder_v1";

export const TEMPLATE_LANGS: TemplateLang[] = ["en", "ms"];

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
};

export function renderTemplatePreview(lang: TemplateLang, params: string[] = SAMPLE_TEMPLATE_PARAMS): string {
  return REMINDER_TEMPLATE_TEXT[lang].replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
}

/** Patient's language if approved, else the other approved language, else null. */
export function pickTemplateLanguage(
  preferred: TemplateLang,
  status: TemplateStatusMap,
): TemplateLang | null {
  if (status[preferred] === "APPROVED") return preferred;
  return TEMPLATE_LANGS.find((l) => status[l] === "APPROVED") ?? null;
}
