import { prisma } from '@/lib/prisma'

export type XrayCapability = 'read' | 'manage'

/**
 * Returns the user's capability on this xray, or null if they have no access.
 * Membership in the X-ray's patient's branch with role OWNER/ADMIN/DOCTOR -> "manage".
 * Returning null lets callers respond 404 (no existence leak).
 */
export async function getXrayCapability(
  userId: string,
  xrayId: string,
): Promise<XrayCapability | null> {
  const xray = await prisma.xray.findUnique({
    where: { id: xrayId },
    select: { patient: { select: { branchId: true } } },
  })
  if (!xray) return null

  const member = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId: xray.patient.branchId } },
    select: { role: true },
  })
  if (!member) return null

  // OWNER, ADMIN, DOCTOR -> manage (BranchRole has only these three today)
  return 'manage'
}

export async function canManageXray(userId: string, xrayId: string): Promise<boolean> {
  return (await getXrayCapability(userId, xrayId)) === 'manage'
}

/**
 * Same shape, but for the *upload* path where the xray doesn't exist yet —
 * the caller passes a patientId.
 */
export async function canManagePatientXrays(userId: string, patientId: string): Promise<boolean> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { branchId: true },
  })
  if (!patient) return false

  const member = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId: patient.branchId } },
    select: { role: true },
  })
  return member !== null
}
