/**
 * Which reminder channel a patient can use given their contact details.
 * Shared by the patient dialogs and POST/PATCH /api/patients. Client-safe.
 */

export type ReminderChannelValue = "WHATSAPP" | "EMAIL" | "BOTH" | "NONE";

export const REMINDER_CHANNELS: readonly ReminderChannelValue[] = ["WHATSAPP", "EMAIL", "BOTH", "NONE"];

export interface PatientContact {
  phone?: string | null;
  email?: string | null;
}

const has = (v: string | null | undefined) => typeof v === "string" && v.trim().length > 0;

/**
 * The channel a new patient gets from what was entered. With both a phone and
 * an email it is WHATSAPP — the reminder dispatcher already falls back to email
 * when WhatsApp fails (`resolveChannels`), matching the schema default.
 */
export function defaultReminderChannel(contact: PatientContact): ReminderChannelValue {
  if (has(contact.phone)) return "WHATSAPP";
  if (has(contact.email)) return "EMAIL";
  return "NONE";
}

/** Error message when the channel needs a contact the patient doesn't have, else null. */
export function reminderChannelError(channel: string | null | undefined, contact: PatientContact): string | null {
  const needsPhone = channel === "WHATSAPP" || channel === "BOTH";
  const needsEmail = channel === "EMAIL" || channel === "BOTH";
  const missingPhone = needsPhone && !has(contact.phone);
  const missingEmail = needsEmail && !has(contact.email);
  if (missingPhone && missingEmail) return "Reminders by WhatsApp and email need a phone number and an email address.";
  if (missingPhone) return "WhatsApp reminders need a phone number.";
  if (missingEmail) return "Email reminders need an email address.";
  return null;
}
