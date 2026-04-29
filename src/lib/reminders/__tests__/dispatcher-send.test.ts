import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { dispatchDue } from "../dispatcher";

const TEST_PREFIX = "rem-disp-";
const sendMock = vi.fn();
const sendEmailMock = vi.fn();

vi.mock("@/lib/wa/worker-client", () => ({
  sendMessage: (args: unknown) => sendMock(args),
}));

vi.mock("@/lib/email", () => ({
  sendReminderEmail: (args: unknown) => sendEmailMock(args),
}));

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
  await prisma.branchMember.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function makeFixture(
  channel: "WHATSAPP" | "EMAIL",
  opts: { pref?: "WHATSAPP" | "EMAIL" | "BOTH" | "NONE" } = {}
) {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const doctor = await prisma.user.create({
    data: { email: `${TEST_PREFIX}d-${stamp}@test.local`, name: "Doc" },
  });
  const branch = await prisma.branch.create({
    data: { name: `${TEST_PREFIX}b-${stamp}`, phone: "+60312345678" },
  });
  await prisma.branchMember.create({
    data: { userId: doctor.id, branchId: branch.id, role: "OWNER" },
  });
  await prisma.branchReminderSettings.create({
    data: { branchId: branch.id, enabled: true, offsetsMin: [120], templates: {} },
  });
  const patient = await prisma.patient.create({
    data: {
      firstName: "Test",
      lastName: "P",
      email: `${TEST_PREFIX}p-${stamp}@test.local`,
      phone: "+60123456789",
      branchId: branch.id,
      doctorId: doctor.id,
      reminderChannel: opts.pref ?? "BOTH",
    },
  });
  const appt = await prisma.appointment.create({
    data: {
      dateTime: new Date(Date.now() + 60 * 60_000),
      patientId: patient.id,
      branchId: branch.id,
      doctorId: doctor.id,
    },
  });
  const reminder = await prisma.appointmentReminder.create({
    data: {
      appointmentId: appt.id,
      channel,
      offsetMin: 120,
      scheduledFor: new Date(Date.now() - 60_000),
    },
  });
  return { branch, patient, appt, reminder };
}

describe("dispatchDue", () => {
  beforeEach(async () => {
    sendMock.mockReset();
    sendEmailMock.mockReset();
    await cleanup();
  });

  it("marks WHATSAPP row SENT on success", async () => {
    const { reminder } = await makeFixture("WHATSAPP");
    sendMock.mockResolvedValueOnce({ ok: true, msgId: "wamid.42" });
    await dispatchDue(new Date());
    const row = await prisma.appointmentReminder.findUniqueOrThrow({
      where: { id: reminder.id },
    });
    expect(row.status).toBe("SENT");
    expect(row.externalId).toBe("wamid.42");
  });

  it("marks EMAIL row SENT on success", async () => {
    const { reminder } = await makeFixture("EMAIL");
    sendEmailMock.mockResolvedValueOnce({ ok: true, id: "re_123" });
    await dispatchDue(new Date());
    const row = await prisma.appointmentReminder.findUniqueOrThrow({
      where: { id: reminder.id },
    });
    expect(row.status).toBe("SENT");
    expect(row.externalId).toBe("re_123");
  });

  it("on terminal WhatsApp failure with email available, marks original FAILED and inserts a fallback EMAIL row", async () => {
    const { reminder, appt } = await makeFixture("WHATSAPP", { pref: "BOTH" });
    sendMock.mockResolvedValueOnce({
      ok: false,
      code: "not_on_whatsapp",
      message: "no WA",
    });
    await dispatchDue(new Date());
    const orig = await prisma.appointmentReminder.findUniqueOrThrow({
      where: { id: reminder.id },
    });
    expect(orig.status).toBe("FAILED");
    const all = await prisma.appointmentReminder.findMany({
      where: { appointmentId: appt.id },
    });
    const fallback = all.find((r) => r.isFallback);
    expect(fallback).toBeDefined();
    expect(fallback?.channel).toBe("EMAIL");
    expect(fallback?.status).toBe("PENDING");
  });

  it("on non-terminal failure (rate_limited), schedules retry and bumps attemptCount", async () => {
    const { reminder } = await makeFixture("WHATSAPP");
    sendMock.mockResolvedValueOnce({
      ok: false,
      code: "rate_limited",
      message: "slow down",
    });
    const before = new Date();
    await dispatchDue(before);
    const row = await prisma.appointmentReminder.findUniqueOrThrow({
      where: { id: reminder.id },
    });
    expect(row.status).toBe("PENDING");
    expect(row.attemptCount).toBe(1);
    expect(row.scheduledFor.getTime()).toBeGreaterThan(before.getTime());
  });

  it("after MAX_ATTEMPTS, marks FAILED and does not insert another fallback (already a fallback)", async () => {
    const { reminder } = await makeFixture("WHATSAPP");
    await prisma.appointmentReminder.update({
      where: { id: reminder.id },
      data: { attemptCount: 3, isFallback: true },
    });
    sendMock.mockResolvedValueOnce({
      ok: false,
      code: "not_on_whatsapp",
      message: "no WA",
    });
    await dispatchDue(new Date());
    const all = await prisma.appointmentReminder.findMany({
      where: { appointmentId: reminder.appointmentId },
    });
    expect(all.filter((r) => r.isFallback).length).toBe(1);
    const row = all.find((r) => r.id === reminder.id);
    expect(row?.status).toBe("FAILED");
  });

  it("skips when appointment is no longer SCHEDULED", async () => {
    const { reminder, appt } = await makeFixture("WHATSAPP");
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { status: "CANCELLED" },
    });
    await dispatchDue(new Date());
    const row = await prisma.appointmentReminder.findUniqueOrThrow({
      where: { id: reminder.id },
    });
    expect(row.status).toBe("SKIPPED");
    expect(sendMock).not.toHaveBeenCalled();
  });
});
