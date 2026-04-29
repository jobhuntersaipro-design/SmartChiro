import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { materializePending } from "../dispatcher";

const TEST_PREFIX = "rem-mat-";

async function cleanup() {
  await prisma.appointmentReminder.deleteMany({
    where: { appointment: { patient: { email: { startsWith: TEST_PREFIX } } } },
  });
  await prisma.appointment.deleteMany({
    where: { patient: { email: { startsWith: TEST_PREFIX } } },
  });
  await prisma.patient.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
  await prisma.branchReminderSettings.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.waSession.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branchMember.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function makeFixture(opts: {
  apptInMin: number;
  pref?: "WHATSAPP" | "EMAIL" | "BOTH" | "NONE";
  hasPhone?: boolean;
  hasEmail?: boolean;
  enabled?: boolean;
  offsetsMin?: number[];
}) {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const doctor = await prisma.user.create({
    data: { email: `${TEST_PREFIX}doc-${stamp}@test.local`, name: "Doc" },
  });
  const branch = await prisma.branch.create({
    data: { name: `${TEST_PREFIX}b-${stamp}` },
  });
  await prisma.branchMember.create({
    data: { userId: doctor.id, branchId: branch.id, role: "OWNER" },
  });
  await prisma.branchReminderSettings.create({
    data: {
      branchId: branch.id,
      enabled: opts.enabled ?? true,
      offsetsMin: opts.offsetsMin ?? [1440, 120],
      templates: {},
    },
  });
  const patient = await prisma.patient.create({
    data: {
      firstName: "Test",
      lastName: "Patient",
      email: opts.hasEmail === false ? null : `${TEST_PREFIX}p-${stamp}@test.local`,
      phone: opts.hasPhone === false ? null : "+60123456789",
      branchId: branch.id,
      doctorId: doctor.id,
      reminderChannel: opts.pref ?? "WHATSAPP",
    },
  });
  const appt = await prisma.appointment.create({
    data: {
      dateTime: new Date(Date.now() + opts.apptInMin * 60_000),
      patientId: patient.id,
      branchId: branch.id,
      doctorId: doctor.id,
    },
  });
  return { doctor, branch, patient, appt };
}

describe("materializePending", () => {
  beforeEach(async () => {
    await cleanup();
  });

  it("creates one PENDING WHATSAPP row per offset for a WhatsApp-pref patient", async () => {
    const { appt } = await makeFixture({ apptInMin: 60 * 48, pref: "WHATSAPP" });
    const created = await materializePending(new Date());
    const rows = await prisma.appointmentReminder.findMany({
      where: { appointmentId: appt.id },
    });
    expect(created).toBeGreaterThanOrEqual(2);
    expect(rows.map((r) => r.channel).sort()).toEqual(["WHATSAPP", "WHATSAPP"]);
    expect(rows.every((r) => r.status === "PENDING")).toBe(true);
  });

  it("creates two rows (whatsapp + email) per offset when pref=BOTH", async () => {
    const { appt } = await makeFixture({ apptInMin: 60 * 48, pref: "BOTH" });
    await materializePending(new Date());
    const rows = await prisma.appointmentReminder.findMany({
      where: { appointmentId: appt.id },
    });
    expect(rows.length).toBe(4);
    expect(new Set(rows.map((r) => r.channel))).toEqual(new Set(["WHATSAPP", "EMAIL"]));
  });

  it("creates nothing when pref=NONE", async () => {
    const { appt } = await makeFixture({ apptInMin: 60 * 48, pref: "NONE" });
    await materializePending(new Date());
    const rows = await prisma.appointmentReminder.findMany({
      where: { appointmentId: appt.id },
    });
    expect(rows.length).toBe(0);
  });

  it("is idempotent — running twice doesn't double-insert", async () => {
    const { appt } = await makeFixture({ apptInMin: 60 * 48, pref: "WHATSAPP" });
    await materializePending(new Date());
    await materializePending(new Date());
    const rows = await prisma.appointmentReminder.findMany({
      where: { appointmentId: appt.id },
    });
    expect(rows.length).toBe(2);
  });

  it("skips branches with enabled=false", async () => {
    const { appt } = await makeFixture({
      apptInMin: 60 * 48,
      pref: "WHATSAPP",
      enabled: false,
    });
    await materializePending(new Date());
    const rows = await prisma.appointmentReminder.findMany({
      where: { appointmentId: appt.id },
    });
    expect(rows.length).toBe(0);
  });

  it("downgrades to email when pref=WHATSAPP but no phone", async () => {
    const { appt } = await makeFixture({
      apptInMin: 60 * 48,
      pref: "WHATSAPP",
      hasPhone: false,
    });
    await materializePending(new Date());
    const rows = await prisma.appointmentReminder.findMany({
      where: { appointmentId: appt.id },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.channel === "EMAIL")).toBe(true);
  });
});
