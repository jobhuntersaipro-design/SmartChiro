import { prisma } from "@/lib/prisma";
import { clinicCalendar, clinicDateKey, clinicInstantFromInputs, clinicParts } from "@/lib/clinic-time";

/**
 * Shared DB fixture for the Phase 3 (packages / care plans / series) route
 * tests. Tests mock `@/lib/auth-utils`; `branchRoleFromDb` gives the mocked
 * getUserBranchRole the real membership so cross-branch checks are exercised.
 */

export const HOURS_JSON = JSON.stringify({
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "18:00" },
  sat: { open: "09:00", close: "13:00" },
});

export async function branchRoleFromDb(userId: string, branchId: string) {
  const m = await prisma.branchMember.findUnique({ where: { userId_branchId: { userId, branchId } } });
  return m?.role ?? null;
}

export async function cleanupPrefix(prefix: string): Promise<void> {
  // Branch deletion cascades patients, appointments, invoices, packages, plans and series.
  await prisma.branch.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
}

export async function buildFixture(prefix: string) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mk = (tag: string, name: string) => prisma.user.create({ data: { email: `${prefix}${tag}-${stamp}@t`, name } });
  const [owner, admin, doctor, doctor2, outsider] = await Promise.all([
    mk("owner", "Owner"),
    mk("admin", "Admin"),
    mk("doc", "Dr Tan"),
    mk("doc2", "Dr Lim"),
    mk("out", "Outsider"),
  ]);
  const branch = await prisma.branch.create({ data: { name: `${prefix}b-${stamp}`, operatingHours: HOURS_JSON } });
  const otherBranch = await prisma.branch.create({ data: { name: `${prefix}other-${stamp}` } });
  await prisma.branchMember.createMany({
    data: [
      { userId: owner.id, branchId: branch.id, role: "OWNER" },
      { userId: admin.id, branchId: branch.id, role: "ADMIN" },
      { userId: doctor.id, branchId: branch.id, role: "DOCTOR" },
      { userId: doctor2.id, branchId: branch.id, role: "DOCTOR" },
      { userId: outsider.id, branchId: otherBranch.id, role: "OWNER" },
    ],
  });
  const patient = await prisma.patient.create({
    data: { firstName: "Siti", lastName: "Aminah", email: `${prefix}p-${stamp}@t`, branchId: branch.id, doctorId: doctor.id },
  });
  return { owner, admin, doctor, doctor2, outsider, branch, otherBranch, patient };
}

export type Fixture = Awaited<ReturnType<typeof buildFixture>>;

/** "YYYY-MM-DD" of the clinic Monday at least `minDays` days from today. */
export function futureMonday(minDays = 7): string {
  const cal = clinicCalendar();
  for (let n = minDays; n < minDays + 7; n++) {
    const d = cal.addDays(n);
    if (clinicParts(d).weekday === 1) return clinicDateKey(d);
  }
  throw new Error("unreachable");
}

/** Clinic instant `days` after a "YYYY-MM-DD" day at "HH:MM". */
export function at(isoDay: string, days: number, time: string): Date {
  const base = clinicInstantFromInputs(isoDay);
  return clinicInstantFromInputs(clinicDateKey(new Date(base.getTime() + days * 86_400_000 + 12 * 3_600_000)), time);
}

export function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
