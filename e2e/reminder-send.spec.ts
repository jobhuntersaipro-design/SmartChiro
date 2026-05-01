import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const BRANCH_ID = process.env.E2E_BRANCH_ID ?? "e2e-test-branch";
const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL ?? "e2e@smartchiro.test";
const MOCK_URL = `http://127.0.0.1:${process.env.MOCK_WORKER_PORT ?? 8788}`;
const CRON_SECRET = process.env.CRON_SECRET ?? "test-cron";

// Safety guard: same shape as e2e/fixtures/seed.ts. The seed and this spec
// both run deleteMany() — refuse if DATABASE_URL_TEST is missing rather than
// silently falling back to DATABASE_URL (prod). Substring matching against
// Neon's random endpoint hashes would be useless theatre, so the real safety
// is the operator manually setting DATABASE_URL_TEST.
const connectionString = process.env.DATABASE_URL_TEST;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL_TEST is required for reminder-send.spec. " +
      "Set it in .env.test to a non-prod Neon branch — see e2e/README.md.",
  );
}

const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

async function emit(event: object) {
  await fetch(`${MOCK_URL}/__test/emit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
}

async function getDoctorId(): Promise<string> {
  const user = await prisma.user.findFirstOrThrow({
    where: { email: E2E_USER_EMAIL },
  });
  return user.id;
}

test.beforeEach(async () => {
  await fetch(`${MOCK_URL}/__test/reset`, { method: "POST" });
  await prisma.appointmentReminder.deleteMany({});
  await prisma.appointment.deleteMany({ where: { branchId: BRANCH_ID } });
  await prisma.patient.deleteMany({ where: { branchId: BRANCH_ID } });

  // Mark branch CONNECTED so dispatcher will use WHATSAPP channel
  await emit({ type: "connected", branchId: BRANCH_ID, phoneNumber: "+60123456789" });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("dispatch materializes + sends a WhatsApp reminder; ack(delivered) leaves row SENT", async ({
  request,
}) => {
  const doctorId = await getDoctorId();

  const patient = await prisma.patient.create({
    data: {
      firstName: "Reminder",
      lastName: "Test",
      phone: "+60198888888",
      reminderChannel: "WHATSAPP",
      preferredLanguage: "en",
      branchId: BRANCH_ID,
      doctorId,
    },
  });

  const appt = await prisma.appointment.create({
    data: {
      dateTime: new Date(Date.now() + 110 * 60 * 1000), // 110 min from now (within 120-min offset)
      duration: 30,
      status: "SCHEDULED",
      patientId: patient.id,
      branchId: BRANCH_ID,
      doctorId,
    },
  });

  // Trigger cron
  const res = await request.get("/api/reminders/dispatch", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);

  // Allow ~500ms for mock /send to be recorded
  await new Promise((r) => setTimeout(r, 500));

  // Mock saw a send for this patient's number
  const sendsRes = await fetch(`${MOCK_URL}/__test/sends`);
  const { sends } = (await sendsRes.json()) as {
    sends: Array<{ branchId: string; to: string; body: string }>;
  };
  const mine = sends.find((s) => s.branchId === BRANCH_ID && s.to === patient.phone);
  expect(mine, "expected a send to the patient's WhatsApp number").toBeDefined();
  expect(mine!.body.length).toBeGreaterThan(0);

  // Reminder row should be SENT now
  const sentRow = await prisma.appointmentReminder.findFirstOrThrow({
    where: { appointmentId: appt.id, channel: "WHATSAPP" },
  });
  expect(sentRow.status).toBe("SENT");
  expect(sentRow.externalId).toMatch(/^mock-/);

  // Push ack(delivered) — current /api/wa/webhook only persists FAILED, so SENT stays
  await emit({
    type: "ack",
    branchId: BRANCH_ID,
    msgId: sentRow.externalId,
    ack: "delivered",
  });

  await new Promise((r) => setTimeout(r, 300));
  const after = await prisma.appointmentReminder.findFirstOrThrow({
    where: { id: sentRow.id },
  });
  expect(after.status).toBe("SENT");
});

test("ack(failed) flips reminder row to FAILED", async ({ request }) => {
  const doctorId = await getDoctorId();

  const patient = await prisma.patient.create({
    data: {
      firstName: "Failed",
      lastName: "Ack",
      phone: "+60197777777",
      reminderChannel: "WHATSAPP",
      preferredLanguage: "en",
      branchId: BRANCH_ID,
      doctorId,
    },
  });

  const appt = await prisma.appointment.create({
    data: {
      dateTime: new Date(Date.now() + 110 * 60 * 1000),
      duration: 30,
      status: "SCHEDULED",
      patientId: patient.id,
      branchId: BRANCH_ID,
      doctorId,
    },
  });

  const dispatch = await request.get("/api/reminders/dispatch", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(dispatch.status()).toBe(200);
  await new Promise((r) => setTimeout(r, 500));

  const reminder = await prisma.appointmentReminder.findFirstOrThrow({
    where: { appointmentId: appt.id, channel: "WHATSAPP" },
  });

  await emit({
    type: "ack",
    branchId: BRANCH_ID,
    msgId: reminder.externalId,
    ack: "failed",
  });

  await new Promise((r) => setTimeout(r, 300));
  const after = await prisma.appointmentReminder.findFirstOrThrow({
    where: { id: reminder.id },
  });
  expect(after.status).toBe("FAILED");
  expect(after.failureReason).toBe("wa_ack_failed");
});

test("dispatch is unauthorized without CRON_SECRET", async ({ request }) => {
  const res = await request.get("/api/reminders/dispatch");
  expect(res.status()).toBe(401);
});
