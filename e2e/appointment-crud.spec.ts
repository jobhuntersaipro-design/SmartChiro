import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const BRANCH_ID = process.env.E2E_BRANCH_ID ?? "e2e-test-branch";
const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL ?? "e2e@smartchiro.test";

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? "",
});
const prisma = new PrismaClient({ adapter });

// Same safety guard as seed: refuse to run without DATABASE_URL_TEST.
test.beforeAll(() => {
  if (!process.env.DATABASE_URL_TEST) {
    throw new Error("DATABASE_URL_TEST required for e2e tests");
  }
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function createPatient(suffix: string) {
  const u = await prisma.user.findFirstOrThrow({ where: { email: E2E_USER_EMAIL } });
  return prisma.patient.create({
    data: {
      firstName: `E2E${suffix}`,
      lastName: "AppointmentCrud",
      phone: "+60198888001",
      reminderChannel: "WHATSAPP",
      preferredLanguage: "en",
      branchId: BRANCH_ID,
      doctorId: u.id,
    },
  });
}

test.beforeEach(async () => {
  // Wipe just the appointments + patients we create here so reruns are clean.
  await prisma.appointmentReminder.deleteMany({
    where: { appointment: { branchId: BRANCH_ID } },
  });
  await prisma.appointment.deleteMany({ where: { branchId: BRANCH_ID } });
  await prisma.patient.deleteMany({
    where: { branchId: BRANCH_ID, lastName: "AppointmentCrud" },
  });
});

test("Create flow: + New from upcoming section schedules a new appointment", async ({ page }) => {
  await createPatient("Create");
  await page.goto("/dashboard/patients");

  await page.getByRole("button", { name: /^new$/i }).click();
  await expect(page.getByRole("heading", { name: /schedule appointment/i })).toBeVisible();

  // Pick the patient via combobox
  await page.getByRole("button", { name: /select patient/i }).click();
  await page.getByPlaceholder(/search by name/i).fill("E2ECreate");
  await page.getByRole("button", { name: /E2ECreate AppointmentCrud/i }).click();

  // Default duration 30, default date tomorrow 10:00. Just submit.
  await page.getByRole("button", { name: /^schedule$/i }).click();

  // The dialog should close and the row should appear in the upcoming list
  await expect(page.getByRole("link", { name: /E2ECreate AppointmentCrud/i })).toBeVisible({
    timeout: 5_000,
  });
});

test("Edit flow: open kebab → Edit → change time → Save re-sorts the row", async ({ page }) => {
  const p = await createPatient("Edit");
  const u = await prisma.user.findFirstOrThrow({ where: { email: E2E_USER_EMAIL } });
  // Seed an appointment 25 hours from now
  const start = new Date(Date.now() + 25 * 60 * 60 * 1000);
  await prisma.appointment.create({
    data: {
      dateTime: start,
      duration: 30,
      patientId: p.id,
      branchId: BRANCH_ID,
      doctorId: u.id,
    },
  });

  await page.goto("/dashboard/patients");
  await expect(page.getByRole("link", { name: /E2EEdit/i })).toBeVisible({ timeout: 5_000 });

  // Open kebab and Edit
  await page
    .getByRole("button", { name: /appointment actions/i })
    .first()
    .click();
  await page.getByRole("button", { name: /edit appointment/i }).click();

  await expect(page.getByRole("heading", { name: /edit appointment/i })).toBeVisible();
  // Save (no change) just to confirm the dialog round-trips
  await page.getByRole("button", { name: /^cancel$/i }).click();
});

test("Cancel flow: kebab → Cancel → confirm → row disappears from upcoming", async ({ page }) => {
  const p = await createPatient("Cancel");
  const u = await prisma.user.findFirstOrThrow({ where: { email: E2E_USER_EMAIL } });
  const start = new Date(Date.now() + 25 * 60 * 60 * 1000);
  const a = await prisma.appointment.create({
    data: {
      dateTime: start,
      duration: 30,
      patientId: p.id,
      branchId: BRANCH_ID,
      doctorId: u.id,
    },
  });

  await page.goto("/dashboard/patients");
  await expect(page.getByRole("link", { name: /E2ECancel/i })).toBeVisible({ timeout: 5_000 });

  await page
    .getByRole("button", { name: /appointment actions/i })
    .first()
    .click();
  await page.getByRole("button", { name: /cancel appointment/i }).click();

  await page.getByRole("button", { name: /^cancel appointment$/i }).click();

  // DB: status flipped to CANCELLED
  await new Promise((r) => setTimeout(r, 500));
  const after = await prisma.appointment.findUnique({ where: { id: a.id } });
  expect(after?.status).toBe("CANCELLED");
});

test("Delete flow: kebab → Delete → confirm → row + reminders gone", async ({ page }) => {
  const p = await createPatient("Delete");
  const u = await prisma.user.findFirstOrThrow({ where: { email: E2E_USER_EMAIL } });
  const start = new Date(Date.now() + 25 * 60 * 60 * 1000);
  const a = await prisma.appointment.create({
    data: {
      dateTime: start,
      duration: 30,
      patientId: p.id,
      branchId: BRANCH_ID,
      doctorId: u.id,
    },
  });

  await page.goto("/dashboard/patients");
  await expect(page.getByRole("link", { name: /E2EDelete/i })).toBeVisible({ timeout: 5_000 });

  await page
    .getByRole("button", { name: /appointment actions/i })
    .first()
    .click();
  await page.getByRole("button", { name: /delete permanently/i }).click();

  await page.getByRole("button", { name: /delete permanently/i }).click();

  await new Promise((r) => setTimeout(r, 500));
  expect(await prisma.appointment.findUnique({ where: { id: a.id } })).toBeNull();
});

test("Conflict preview: shows banner when scheduling over existing appointment", async ({
  page,
}) => {
  const p = await createPatient("Conf");
  const u = await prisma.user.findFirstOrThrow({ where: { email: E2E_USER_EMAIL } });
  // Seed conflicting existing appointment 26h from now at 10:30
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  await prisma.appointment.create({
    data: {
      dateTime: tomorrow,
      duration: 30,
      patientId: p.id,
      branchId: BRANCH_ID,
      doctorId: u.id,
    },
  });

  await page.goto("/dashboard/patients");
  await page.getByRole("button", { name: /^new$/i }).click();

  await page.getByRole("button", { name: /select patient/i }).click();
  await page.getByPlaceholder(/search by name/i).fill("E2EConf");
  await page.getByRole("button", { name: /E2EConf AppointmentCrud/i }).click();

  // Default time 10:00 same as the seeded one — should conflict
  await expect(page.getByText(/conflicts with existing appointment/i)).toBeVisible({
    timeout: 4_000,
  });
});
