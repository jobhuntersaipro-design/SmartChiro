/**
 * Marketing consent (PDPA + Meta marketing rules) and patient languages.
 * Client-safe: no server imports.
 */

/** Languages a patient can receive messages in (WhatsApp templates + emails). */
export const PATIENT_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ms", label: "Bahasa Melayu" },
  { value: "zh", label: "中文" },
] as const;

export type PatientLanguage = (typeof PATIENT_LANGUAGES)[number]["value"];

export const PATIENT_LANGUAGE_VALUES: readonly string[] = PATIENT_LANGUAGES.map((l) => l.value);

export function isPatientLanguage(v: unknown): v is PatientLanguage {
  return typeof v === "string" && PATIENT_LANGUAGE_VALUES.includes(v);
}

export function languageLabel(v: string | null | undefined): string {
  return PATIENT_LANGUAGES.find((l) => l.value === v)?.label ?? "English";
}

/**
 * The fields to write when consent is set. Giving consent stamps the time
 * (kept when it was already given); withdrawing clears it.
 */
export function consentFields(
  next: boolean,
  current: { marketingConsent: boolean; marketingConsentAt: Date | null } | null,
  now: Date = new Date(),
): { marketingConsent: boolean; marketingConsentAt: Date | null } {
  if (!next) return { marketingConsent: false, marketingConsentAt: null };
  if (current?.marketingConsent) return { marketingConsent: true, marketingConsentAt: current.marketingConsentAt ?? now };
  return { marketingConsent: true, marketingConsentAt: now };
}

export const CONSENT_LABEL = "Agrees to recall reminders and review requests (WhatsApp or email)";
export const CONSENT_HINT = "Needed for marketing messages under PDPA. Appointment reminders don't need it. Patients can reply STOP any time.";
