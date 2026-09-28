import type { WhatsAppAccountStatus, WhatsAppConnectionType } from "@prisma/client";

export type TemplateLang = "en" | "ms";

/** Meta's status per language (APPROVED, PENDING, REJECTED, PAUSED…) or CREATE_FAILED. */
export type TemplateStatusMap = Partial<Record<TemplateLang, string>>;

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
  templateStatus: TemplateStatusMap;
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
