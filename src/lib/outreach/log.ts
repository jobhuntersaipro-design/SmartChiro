import type { PatientOutreach } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { OutreachLogItem } from "@/types/outreach";

type Row = Pick<
  PatientOutreach,
  "id" | "type" | "channel" | "status" | "scheduledFor" | "sentAt" | "failureReason" | "attemptCount" | "createdAt" | "createdById"
> & { patient?: { id: string; firstName: string; lastName: string } };

/** Maps outreach rows for the API, resolving who sent manual ones (one query). */
export async function toLogItems(rows: Row[]): Promise<OutreachLogItem[]> {
  const userIds = [...new Set(rows.map((r) => r.createdById).filter((id): id is string => Boolean(id)))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    channel: r.channel === "EMAIL" ? "EMAIL" : "WHATSAPP",
    status: r.status,
    scheduledFor: r.scheduledFor.toISOString(),
    sentAt: r.sentAt?.toISOString() ?? null,
    failureReason: r.failureReason,
    attemptCount: r.attemptCount,
    createdAt: r.createdAt.toISOString(),
    createdByName: r.createdById ? (names.get(r.createdById) ?? "Staff") : null,
    ...(r.patient && {
      patient: { id: r.patient.id, name: `${r.patient.firstName} ${r.patient.lastName}`.trim() },
    }),
  }));
}
