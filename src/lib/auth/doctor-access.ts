import { prisma } from "@/lib/prisma";
import { can, type Capability } from "@/lib/permissions";

/**
 * Branches whose records of `doctorId` the caller may see: their own current
 * branches for the doctor themself; otherwise only branches both belong to
 * where the caller's role has every capability in `caps`. Records from the
 * doctor's other clinics never show. `null` when the doctor doesn't exist.
 */
export async function doctorRecordBranches(
  callerId: string,
  doctorId: string,
  caps: Capability[],
): Promise<string[] | null> {
  const memberships = await prisma.branchMember.findMany({
    where: { userId: { in: [callerId, doctorId] } },
    select: { userId: true, branchId: true, role: true },
  });
  const target = memberships.filter((m) => m.userId === doctorId);
  if (target.length === 0 && !(await prisma.user.findUnique({ where: { id: doctorId }, select: { id: true } }))) {
    return null;
  }
  if (callerId === doctorId) return target.map((m) => m.branchId);
  const targetBranches = new Set(target.map((m) => m.branchId));
  return memberships
    .filter((m) => m.userId === callerId && targetBranches.has(m.branchId) && caps.every((c) => can(m.role, c)))
    .map((m) => m.branchId);
}

/**
 * Branches where the caller manages `doctorId`'s schedule and profile:
 * OWNER/ADMIN in a branch the doctor belongs to.
 */
export async function managedDoctorBranches(callerId: string, doctorId: string): Promise<{ doctor: string[]; managed: string[] }> {
  const memberships = await prisma.branchMember.findMany({
    where: { userId: { in: [callerId, doctorId] } },
    select: { userId: true, branchId: true, role: true },
  });
  const doctor = memberships.filter((m) => m.userId === doctorId).map((m) => m.branchId);
  const managed = memberships
    .filter((m) => m.userId === callerId && doctor.includes(m.branchId) && can(m.role, "schedule.manageAll"))
    .map((m) => m.branchId);
  return { doctor, managed };
}

/**
 * Edits that aren't tied to one branch (name, photo, profile, account status,
 * leave for every branch): the doctor themself, or someone who manages every
 * branch the doctor works in — so one clinic can't change a doctor's details
 * at another.
 */
export async function canManageDoctorEverywhere(callerId: string, doctorId: string): Promise<boolean> {
  if (callerId === doctorId) return true;
  const { doctor, managed } = await managedDoctorBranches(callerId, doctorId);
  return doctor.length > 0 && managed.length === doctor.length;
}

/**
 * Who may add or remove a doctor's leave: for one branch, the doctor (if they
 * work there) or a manager of that branch; for every branch (`branchId`
 * null), the doctor or someone who manages all of their branches.
 */
export async function canEditDoctorLeave(callerId: string, doctorId: string, branchId: string | null): Promise<boolean> {
  const { doctor, managed } = await managedDoctorBranches(callerId, doctorId);
  if (branchId === null) {
    return callerId === doctorId || (doctor.length > 0 && managed.length === doctor.length);
  }
  return callerId === doctorId ? doctor.includes(branchId) : managed.includes(branchId);
}
