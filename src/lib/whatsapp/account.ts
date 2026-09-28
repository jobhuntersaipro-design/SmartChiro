import type { BranchRole, WhatsAppAccount } from "@prisma/client";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { can } from "@/lib/permissions";
import type { PublicWhatsAppAccount } from "@/types/whatsapp";
import { REMINDER_TEMPLATE_NAME, allTemplateStatuses, statusForTemplate } from "./template-text";

export type { PublicWhatsAppAccount };

export function toPublicAccount(a: WhatsAppAccount): PublicWhatsAppAccount {
  return {
    wabaId: a.wabaId,
    phoneNumberId: a.phoneNumberId,
    displayPhoneNumber: a.displayPhoneNumber,
    verifiedName: a.verifiedName,
    connectionType: a.connectionType,
    status: a.status,
    lastError: a.lastError,
    templateName: a.templateName,
    templateStatus: statusForTemplate(a.templateStatus, REMINDER_TEMPLATE_NAME),
    templateStatuses: allTemplateStatuses(a.templateStatus),
    templatesCheckedAt: a.templatesCheckedAt?.toISOString() ?? null,
    connectedAt: a.updatedAt.toISOString(),
  };
}

type Access =
  | { ok: true; userId: string; role: BranchRole }
  | { ok: false; status: 401 | 403; error: string };

/** Branch settings access: OWNER or ADMIN of the branch. */
export async function branchAccess(branchId: string): Promise<Access> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, status: 401, error: "unauthorized" };
  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return { ok: false, status: 403, error: "forbidden" };
  // WhatsApp settings are branch settings: OWNER/ADMIN only (doctors and front
  // desk neither read nor change them).
  if (!can(role, "reminders.manage")) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, userId: user.id, role };
}
