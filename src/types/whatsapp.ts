import type { WhatsAppAccountStatus, WhatsAppConnectionType } from "@prisma/client";

export type TemplateLang = "en" | "ms" | "zh";

/** Meta's status per language (APPROVED, PENDING, REJECTED, PAUSED…) or CREATE_FAILED. */
export type TemplateStatusMap = Partial<Record<TemplateLang, string>>;

/**
 * `WhatsAppAccount.templateStatus` JSON. The top-level language keys are the
 * reminder template's status (the original shape — rows saved before the
 * outreach templates existed still read correctly); every other template's
 * status lives under `templates[name]`.
 */
export type StoredTemplateStatus = TemplateStatusMap & {
  templates?: Record<string, TemplateStatusMap>;
};

/** What the browser may see of a WhatsApp connection — never the token or PIN. */
export interface PublicWhatsAppAccount {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  connectionType: WhatsAppConnectionType;
  status: WhatsAppAccountStatus;
  lastError: string | null;
  templateName: string;
  /** Reminder template status per language. */
  templateStatus: TemplateStatusMap;
  /** Status per language for every managed template, keyed by template name. */
  templateStatuses: Record<string, TemplateStatusMap>;
  templatesCheckedAt: string | null;
  connectedAt: string;
}

/** Embedded Signup settings the browser needs (null when not configured). */
export interface SignupConfig {
  appId: string;
  configId: string;
  graphVersion: string;
}

export interface WhatsAppConnectionState {
  account: PublicWhatsAppAccount | null;
  signup: SignupConfig | null;
  canManage: boolean;
}
