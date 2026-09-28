import type { WhatsAppAccount } from "@prisma/client";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import type { PublicWhatsAppAccount, TemplateStatusMap } from "@/types/whatsapp";

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
    templateStatus: a.templateStatus as TemplateStatusMap,
    templatesCheckedAt: a.templatesCheckedAt?.toISOString() ?? null,
    connectedAt: a.updatedAt.toISOString(),
  };
}

type Access =
  | { ok: true; userId: string; role: "OWNER" | "ADMIN" | "DOCTOR" }
  | { ok: false; status: 401 | 403; error: string };

/** Branch membership check; `manage` requires OWNER or ADMIN. */
export async function branchAccess(branchId: string, manage: boolean): Promise<Access> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, status: 401, error: "unauthorized" };
  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return { ok: false, status: 403, error: "forbidden" };
  if (manage && role !== "OWNER" && role !== "ADMIN") return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, userId: user.id, role };
}
