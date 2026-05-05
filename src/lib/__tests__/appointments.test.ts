import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { findConflictingAppointments } from "@/lib/appointments";

const TEST_PREFIX = "appt-helper-";

async function cleanup() {
  await prisma.appointmentReminder.deleteMany({
    where: { appointment: { branch: { name: { startsWith: TEST_PREFIX } } } },
  });
  await prisma.appointment.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.patient.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branchMember.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function buildFixture() {
  const stamp = Date.now() + Math.floor(Math.random() * 100000);
  const drA = await prisma.user.create({
    data: { email: `${TEST_PREFIX}drA-${stamp}@t`, name: "Dr A" },
  });
  const drB = await prisma.user.create({
    data: { email: `${TEST_PREFIX}drB-${stamp}@t`, name: "Dr B" },
  });
  const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${stamp}` } });
  await prisma.branchMember.create({ data: { userId: drA.id, branchId: branch.id, role: "DOCTOR" } });
  await prisma.branchMember.create({ data: { userId: drB.id, branchId: branch.id, role: "DOCTOR" } });
  const patient = await prisma.patient.create({
    data: {
      firstName: "P",
      lastName: "X",
      email: `${TEST_PREFIX}p-${stamp}@t`,
      branchId: branch.id,
      doctorId: drA.id,
      reminderChannel: "WHATSAPP",
    },
  });
  return { drA, drB, branch, patient };
}

function appt(overrides: {
  doctorId: string;
  patientId: string;
  branchId: string;
  start: Date;
  duration?: number;
  status?: "SCHEDULED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
}) {
  return prisma.appointment.create({
    data: {
      dateTime: overrides.start,
      duration: overrides.duration ?? 30,
      status: overrides.status ?? "SCHEDULED",
      patientId: overrides.patientId,
      branchId: overrides.branchId,
      doctorId: overrides.doctorId,
    },
  });
}

describe("findConflictingAppointments", () => {
  beforeEach(async () => {
    await cleanup();
  });

  it("returns empty array when no appointments exist", async () => {
    const { drA } = await buildFixture();
    const start = new Date("2030-01-15T10:00:00Z");
    const end = new Date("2030-01-15T10:30:00Z");
    const conflicts = await findConflictingAppointments({
      doctorId: drA.id,
      start,
      end,
    });
    expect(conflicts).toEqual([]);
  });

  it("returns same-doctor overlap", async () => {
    const { drA, branch, patient } = await buildFixture();
    const existing = await appt({
      doctorId: drA.id,
      patientId: patient.id,
      branchId: branch.id,
      start: new Date("2030-01-15T10:00:00Z"),
      duration: 30,
    });
    const conflicts = await findConflictingAppointments({
      doctorId: drA.id,
      start: new Date("2030-01-15T10:15:00Z"),
      end: new Date("2030-01-15T10:45:00Z"),
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].id).toBe(existing.id);
  });

  it("does NOT return different-doctor overlap", async () => {
    const { drA, drB, branch, patient } = await buildFixture();
    await appt({
      doctorId: drB.id,
      patientId: patient.id,
      branchId: branch.id,
      start: new Date("2030-01-15T10:00:00Z"),
      duration: 30,
    });
    const conflicts = await findConflictingAppointments({
      doctorId: drA.id,
      start: new Date("2030-01-15T10:00:00Z"),
      end: new Date("2030-01-15T10:30:00Z"),
    });
    expect(conflicts).toEqual([]);
  });

  it("excludes the appointment matching excludeId", async () => {
    const { drA, branch, patient } = await buildFixture();
    const a = await appt({
      doctorId: drA.id,
      patientId: patient.id,
      branchId: branch.id,
      start: new Date("2030-01-15T10:00:00Z"),
      duration: 30,
    });
    const conflicts = await findConflictingAppointments({
      doctorId: drA.id,
      start: new Date("2030-01-15T10:00:00Z"),
      end: new Date("2030-01-15T10:30:00Z"),
      excludeId: a.id,
    });
    expect(conflicts).toEqual([]);
  });

  it("does NOT return CANCELLED appointments as conflicts", async () => {
    const { drA, branch, patient } = await buildFixture();
    await appt({
      doctorId: drA.id,
      patientId: patient.id,
      branchId: branch.id,
      start: new Date("2030-01-15T10:00:00Z"),
      duration: 30,
      status: "CANCELLED",
    });
    const conflicts = await findConflictingAppointments({
      doctorId: drA.id,
      start: new Date("2030-01-15T10:00:00Z"),
      end: new Date("2030-01-15T10:30:00Z"),
    });
    expect(conflicts).toEqual([]);
  });

  it("does NOT count adjacent (touching but not overlapping) as conflict", async () => {
    const { drA, branch, patient } = await buildFixture();
    await appt({
      doctorId: drA.id,
      patientId: patient.id,
      branchId: branch.id,
      start: new Date("2030-01-15T10:00:00Z"),
      duration: 30, // 10:00 - 10:30
    });
    // New: 10:30 - 11:00. Touching, not overlapping.
    const conflicts = await findConflictingAppointments({
      doctorId: drA.id,
      start: new Date("2030-01-15T10:30:00Z"),
      end: new Date("2030-01-15T11:00:00Z"),
    });
    expect(conflicts).toEqual([]);
  });

  it("returns conflict payload with patient info for client display", async () => {
    const { drA, branch, patient } = await buildFixture();
    await appt({
      doctorId: drA.id,
      patientId: patient.id,
      branchId: branch.id,
      start: new Date("2030-01-15T10:00:00Z"),
      duration: 30,
    });
    const conflicts = await findConflictingAppointments({
      doctorId: drA.id,
      start: new Date("2030-01-15T10:15:00Z"),
      end: new Date("2030-01-15T10:45:00Z"),
    });
    expect(conflicts[0]).toMatchObject({
      dateTime: expect.any(Date),
      duration: 30,
      patient: { firstName: "P", lastName: "X" },
    });
  });
});
