import { prisma } from "@/lib/prisma";
import type { BranchRole } from "@prisma/client";

export async function getBranchRole(userId: string, branchId: string): Promise<BranchRole | null> {
  const m = await prisma.branchMember.findUnique({
    where: { userId_branchId: { userId, branchId } },
    select: { role: true },
  });
  return m?.role ?? null;
}

export function canManagePackages(role: BranchRole | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canUpdatePayment(role: BranchRole | null): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "DOCTOR";
}

export async function checkPatientAccess(userId: string, patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, branchId: true, doctorId: true },
  });
  if (!patient) return { patient: null, role: null as BranchRole | null, allowed: false };

  const role = await getBranchRole(userId, patient.branchId);

  // Same logic used elsewhere: assigned doctor, OR OWNER/ADMIN
  if (patient.doctorId === userId) return { patient, role, allowed: true };
  if (role === "OWNER" || role === "ADMIN") {
    return { patient, role, allowed: true };
  }
  return { patient, role, allowed: false };
}
