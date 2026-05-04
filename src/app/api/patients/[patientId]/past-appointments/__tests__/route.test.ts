import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET } from "../route";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

const TEST_PREFIX = "test-pastappts-";

type Fixture = {
  ownerId: string;
  doctorId: string;
  outsiderId: string;
  branchId: string;
  branch2Id: string;
  patientId: string;
  patient2Id: string;
  appointmentIds: string[]; // past appointments tied to patientId
};

async function cleanup(prefix: string) {
  await prisma.invoice.deleteMany({
    where: { branch: { name: { startsWith: prefix } } },
  });
  await prisma.appointment.deleteMany({
    where: { branch: { name: { startsWith: prefix } } },
  });
  await prisma.patient.deleteMany({
    where: { branch: { name: { startsWith: prefix } } },
  });
  await prisma.branchMember.deleteMany({
    where: { branch: { name: { startsWith: prefix } } },
  });
  await prisma.branch.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
}

async function buildFixture(): Promise<Fixture> {
  const stamp = Date.now() + Math.floor(Math.random() * 100000);
  const owner = await prisma.user.create({
    data: { email: `${TEST_PREFIX}owner-${stamp}@t.local`, name: "Owner" },
  });
  const doctor = await prisma.user.create({
    data: { email: `${TEST_PREFIX}doc-${stamp}@t.local`, name: "Doc" },
  });
  const outsider = await prisma.user.create({
    data: { email: `${TEST_PREFIX}out-${stamp}@t.local`, name: "Outsider" },
  });

  const branch = await prisma.branch.create({
    data: { name: `${TEST_PREFIX}branch-${stamp}` },
  });
  const branch2 = await prisma.branch.create({
    data: { name: `${TEST_PREFIX}branch2-${stamp}` },
  });

  await prisma.branchMember.create({
    data: { userId: owner.id, branchId: branch.id, role: "OWNER" },
  });
  await prisma.branchMember.create({
    data: { userId: doctor.id, branchId: branch.id, role: "DOCTOR" },
  });
  await prisma.branchMember.create({
    data: { userId: outsider.id, branchId: branch2.id, role: "OWNER" },
  });

  const patient = await prisma.patient.create({
    data: {
      firstName: "P",
      lastName: "Patient",
      branchId: branch.id,
      doctorId: doctor.id,
    },
  });
  const patient2 = await prisma.patient.create({
    data: {
      firstName: "Q",
      lastName: "Other",
      branchId: branch2.id,
      doctorId: outsider.id,
    },
  });

  // Build mixed past appointments
  const now = Date.now();
  const past = (daysAgo: number) => new Date(now - daysAgo * 24 * 3600 * 1000);

  const appointmentSpecs: { dateTime: Date; status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | "IN_PROGRESS" }[] = [
    { dateTime: past(1), status: "COMPLETED" },
    { dateTime: past(2), status: "COMPLETED" },
    { dateTime: past(3), status: "COMPLETED" },
    { dateTime: past(4), status: "CANCELLED" },
    { dateTime: past(5), status: "NO_SHOW" },
    { dateTime: past(6), status: "NO_SHOW" },
    { dateTime: past(7), status: "SCHEDULED" }, // stale
    { dateTime: past(8), status: "IN_PROGRESS" }, // stuck → counted under stale
    { dateTime: past(9), status: "COMPLETED" },
    { dateTime: past(10), status: "COMPLETED" },
    { dateTime: past(11), status: "COMPLETED" },
    { dateTime: past(12), status: "COMPLETED" },
  ];

  const appointmentIds: string[] = [];
  for (const spec of appointmentSpecs) {
    const a = await prisma.appointment.create({
      data: {
        dateTime: spec.dateTime,
        status: spec.status,
        patientId: patient.id,
        branchId: branch.id,
        doctorId: doctor.id,
      },
    });
    appointmentIds.push(a.id);
  }

  // Add a future appointment too — must NOT appear in past list
  await prisma.appointment.create({
    data: {
      dateTime: new Date(now + 24 * 3600 * 1000),
      status: "SCHEDULED",
      patientId: patient.id,
      branchId: branch.id,
      doctorId: doctor.id,
    },
  });

  // Invoices: PAID 200 + 300 (paid total = 500), SENT 100, OVERDUE 50, CANCELLED 999 (excluded)
  await prisma.invoice.create({
    data: {
      invoiceNumber: `${TEST_PREFIX}INV-${stamp}-1`,
      amount: 200,
      status: "PAID",
      lineItems: [{ description: "x", quantity: 1, unitPrice: 200, total: 200 }],
      patientId: patient.id,
      branchId: branch.id,
      appointmentId: appointmentIds[0],
    },
  });
  await prisma.invoice.create({
    data: {
      invoiceNumber: `${TEST_PREFIX}INV-${stamp}-2`,
      amount: 300,
      status: "PAID",
      lineItems: [{ description: "y", quantity: 1, unitPrice: 300, total: 300 }],
      patientId: patient.id,
      branchId: branch.id,
      appointmentId: appointmentIds[1],
    },
  });
  await prisma.invoice.create({
    data: {
      invoiceNumber: `${TEST_PREFIX}INV-${stamp}-3`,
      amount: 100,
      status: "SENT",
      lineItems: [{ description: "z", quantity: 1, unitPrice: 100, total: 100 }],
      patientId: patient.id,
      branchId: branch.id,
      appointmentId: appointmentIds[2],
    },
  });
  await prisma.invoice.create({
    data: {
      invoiceNumber: `${TEST_PREFIX}INV-${stamp}-4`,
      amount: 50,
      status: "OVERDUE",
      lineItems: [{ description: "w", quantity: 1, unitPrice: 50, total: 50 }],
      patientId: patient.id,
      branchId: branch.id,
      appointmentId: appointmentIds[3],
    },
  });
  await prisma.invoice.create({
    data: {
      invoiceNumber: `${TEST_PREFIX}INV-${stamp}-5`,
      amount: 999,
      status: "CANCELLED",
      lineItems: [{ description: "void", quantity: 1, unitPrice: 999, total: 999 }],
      patientId: patient.id,
      branchId: branch.id,
      appointmentId: appointmentIds[4],
    },
  });

  return {
    ownerId: owner.id,
    doctorId: doctor.id,
    outsiderId: outsider.id,
    branchId: branch.id,
    branch2Id: branch2.id,
    patientId: patient.id,
    patient2Id: patient2.id,
    appointmentIds,
  };
}

function makeReq(url: string): Request {
  return new Request(`http://localhost${url}`, { method: "GET" });
}

describe("GET /api/patients/[patientId]/past-appointments", () => {
  let fx: Fixture;

  beforeEach(async () => {
    vi.clearAllMocks();
    fx = await buildFixture();
  });

  afterEach(async () => {
    await cleanup(TEST_PREFIX);
  });

  it("OWNER fetches past appointments sorted by When desc by default", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.ownerId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const res = await GET(makeReq(`/api/patients/${fx.patientId}/past-appointments`), {
      params: Promise.resolve({ patientId: fx.patientId }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.appointments)).toBe(true);
    expect(data.appointments.length).toBeGreaterThan(0);
    // sorted desc by dateTime
    for (let i = 1; i < data.appointments.length; i++) {
      const prev = new Date(data.appointments[i - 1].dateTime).getTime();
      const cur = new Date(data.appointments[i].dateTime).getTime();
      expect(prev).toBeGreaterThanOrEqual(cur);
    }
    // future appointment must NOT appear
    for (const a of data.appointments) {
      expect(new Date(a.dateTime).getTime()).toBeLessThan(Date.now());
    }
  });

  it("DOCTOR gets 200 read-only response", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.doctorId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("DOCTOR");
    const res = await GET(makeReq(`/api/patients/${fx.patientId}/past-appointments`), {
      params: Promise.resolve({ patientId: fx.patientId }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.stats).toBeDefined();
  });

  it("Stats: paid excludes CANCELLED invoices, outstanding includes SENT + OVERDUE only", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.ownerId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const res = await GET(makeReq(`/api/patients/${fx.patientId}/past-appointments`), {
      params: Promise.resolve({ patientId: fx.patientId }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.stats.paid).toBe(500); // 200 + 300
    expect(data.stats.outstanding).toBe(150); // 100 SENT + 50 OVERDUE
    expect(data.stats.currency).toBe("MYR");
  });

  it("Stale: SCHEDULED rows with dateTime<now are flagged isStale and counted under stats.stale (incl IN_PROGRESS)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.ownerId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const res = await GET(makeReq(`/api/patients/${fx.patientId}/past-appointments?pageSize=50`), {
      params: Promise.resolve({ patientId: fx.patientId }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    // 1 SCHEDULED past + 1 IN_PROGRESS past = 2
    expect(data.stats.stale).toBe(2);
    // isStale flag only true for the SCHEDULED one
    const scheduled = data.appointments.find((a: { status: string }) => a.status === "SCHEDULED");
    expect(scheduled).toBeDefined();
    expect(scheduled.isStale).toBe(true);
    const completed = data.appointments.find((a: { status: string }) => a.status === "COMPLETED");
    expect(completed).toBeDefined();
    expect(completed.isStale).toBe(false);
  });

  it("Filter ?status=NO_SHOW returns only NO_SHOW rows", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.ownerId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const res = await GET(
      makeReq(`/api/patients/${fx.patientId}/past-appointments?status=NO_SHOW`),
      { params: Promise.resolve({ patientId: fx.patientId }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.appointments.length).toBe(2);
    for (const a of data.appointments) expect(a.status).toBe("NO_SHOW");
  });

  it("Pagination: ?page=2&pageSize=5 returns rows 6-10 of full set", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.ownerId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const page1 = await GET(
      makeReq(`/api/patients/${fx.patientId}/past-appointments?page=1&pageSize=5`),
      { params: Promise.resolve({ patientId: fx.patientId }) }
    );
    expect(page1.status).toBe(200);
    const d1 = await page1.json();
    expect(d1.appointments).toHaveLength(5);
    expect(d1.page).toBe(1);
    expect(d1.pageSize).toBe(5);

    const page2 = await GET(
      makeReq(`/api/patients/${fx.patientId}/past-appointments?page=2&pageSize=5`),
      { params: Promise.resolve({ patientId: fx.patientId }) }
    );
    expect(page2.status).toBe(200);
    const d2 = await page2.json();
    expect(d2.appointments.length).toBeGreaterThan(0);
    // ensure no overlap
    const idsP1 = new Set(d1.appointments.map((a: { id: string }) => a.id));
    for (const a of d2.appointments) expect(idsP1.has(a.id)).toBe(false);
    // total reflects filtered total (12 past appointments)
    expect(d2.total).toBe(12);
  });

  it("Cross-branch leak: outsider cannot see Patient X at Branch A → 404", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: fx.outsiderId } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue(null);
    const res = await GET(
      makeReq(`/api/patients/${fx.patientId}/past-appointments`),
      { params: Promise.resolve({ patientId: fx.patientId }) }
    );
    expect(res.status).toBe(404);
  });
});
