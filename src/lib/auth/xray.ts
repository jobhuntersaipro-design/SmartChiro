import { prisma } from '@/lib/prisma'
import { can } from '@/lib/permissions'

export type XrayCapability = 'read' | 'manage'

interface PatientScope {
  branchId: string
  doctorId: string | null
}

/**
 * Mirrors the patient routes' access rule: the patient's assigned doctor, or an
 * OWNER/ADMIN of the patient's branch. Other doctors in the branch, front desk
 * (X-rays are clinical) and anyone outside the branch get nothing.
 */
async function canAccessPatientScope(userId: string, patient: PatientScope): Promise<boolean> {
  const member = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId: patient.branchId } },
    select: { role: true },
  })
  // Only current members of the patient's branch: a removed doctor loses
  // access to the patients they were assigned.
  if (!member || !can(member.role, 'xray.read')) return false
  if (patient.doctorId === userId) return true
  return can(member.role, 'patient.readAll')
}

/**
 * Returns the user's capability on this xray, or null if they have no access.
 * Returning null lets callers respond 404 (no existence leak).
 */
export async function getXrayCapability(
  userId: string,
  xrayId: string,
): Promise<XrayCapability | null> {
  const xray = await prisma.xray.findUnique({
    where: { id: xrayId },
    select: { patient: { select: { branchId: true, doctorId: true } } },
  })
  if (!xray) return null
  return (await canAccessPatientScope(userId, xray.patient)) ? 'manage' : null
}

export async function canManageXray(userId: string, xrayId: string): Promise<boolean> {
  return (await getXrayCapability(userId, xrayId)) === 'manage'
}

/**
 * Same rule, but for the *upload* and listing paths where the caller passes a
 * patientId.
 */
export async function canManagePatientXrays(userId: string, patientId: string): Promise<boolean> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { branchId: true, doctorId: true },
  })
  if (!patient) return false
  return canAccessPatientScope(userId, patient)
}
