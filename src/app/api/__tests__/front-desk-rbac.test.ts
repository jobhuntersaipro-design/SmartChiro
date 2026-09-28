import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Front desk (BranchRole.FRONT_DESK) can book, check in and take payment, and
// every clinical API returns 403/404 for it. Hits the real database with a
// mocked session.
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));
vi.mock("@/lib/email", () => ({
  sendDoctorBookingNotification: vi.fn(async () => undefined),
}));

const TEST_PREFIX = `test-front-desk-${Date.now()}`;

let ownerId: string, doctorId: string, frontDeskId: string;
let branchId: string, patientId: string, xrayId: string, visitId: string;

function as(userId: string) {
  mockAuth.mockResolvedValue({ user: { id: userId, email: `${userId}@t`, name: "Tester" } });
}

function req(method: string, url: string, body?: Record<string, unknown>) {
  const init: ConstructorParameters<typeof NextRequest>[1] = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(`http://localhost:3000${url}`, init);
}

const patientParams = () => ({ params: Promise.resolve({ patientId }) });

describe("FRONT_DESK role", () => {
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `${TEST_PREFIX}-o@t.com`, name: "Owner" } });
    const d = await prisma.user.create({ data: { email: `${TEST_PREFIX}-d@t.com`, name: "Doc" } });
    const b = await prisma.branch.create({ data: { name: `${TEST_PREFIX} B` } });
    const f = await prisma.user.create({
      data: { email: `${TEST_PREFIX}-f@t.com`, name: "Siti", activeBranchId: b.id },
    });
    ownerId = o.id;
    doctorId = d.id;
    frontDeskId = f.id;
    branchId = b.id;

    await prisma.branchMember.createMany({
      data: [
        { userId: ownerId, branchId, role: "OWNER" },
        { userId: doctorId, branchId, role: "DOCTOR" },
        { userId: frontDeskId, branchId, role: "FRONT_DESK" },
      ],
    });

    const patient = await prisma.patient.create({
      data: {
        firstName: "Pat",
        lastName: TEST_PREFIX,
        phone: "0123456789",
        medicalHistory: "L4-L5 disc herniation",
        notes: "Private clinical note",
        branchId,
        doctorId,
      },
    });
    patientId = patient.id;

    const visit = await prisma.visit.create({
      data: { patientId, doctorId, subjective: "Lower back pain" },
    });
    visitId = visit.id;

    const xray = await prisma.xray.create({
      data: {
        patientId,
        uploadedById: doctorId,
        fileName: "x.jpg",
        fileSize: 1,
        mimeType: "image/jpeg",
        status: "READY",
        fileUrl: "http://x",
      },
    });
    xrayId = xray.id;
  });

  afterAll(async () => {
    const users = [ownerId, doctorId, frontDeskId];
    await prisma.invoice.deleteMany({ where: { branchId } });
    await prisma.appointmentAuditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.appointment.deleteMany({ where: { branchId } });
    await prisma.xray.deleteMany({ where: { patientId } });
    await prisma.visit.deleteMany({ where: { patientId } });
    await prisma.patient.deleteMany({ where: { branchId } });
    await prisma.doctorProfile.deleteMany({ where: { user: { email: { startsWith: TEST_PREFIX } } } });
    await prisma.branchMember.deleteMany({ where: { branchId } });
    await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
    mockAuth.mockReset();
  });

  beforeEach(() => {
    mockAuth.mockReset();
  });

  // ─── Appointments: book, check in, cancel — no hard delete ───

  describe("appointments", () => {
    let appointmentId: string;

    it("can book for a doctor", async () => {
      as(frontDeskId);
      const { POST } = await import("../appointments/route");
      const res = await POST(
        req("POST", "/api/appointments", {
          patientId,
          doctorId,
          dateTime: new Date(Date.now() + 3 * 86_400_000).toISOString(),
          duration: 30,
        })
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      appointmentId = body.appointment?.id ?? body.id;
      expect(appointmentId).toBeTruthy();
    });

    it("cannot book the front desk itself as the doctor", async () => {
      as(frontDeskId);
      const { POST } = await import("../appointments/route");
      const res = await POST(
        req("POST", "/api/appointments", {
          patientId,
          doctorId: frontDeskId,
          dateTime: new Date(Date.now() + 4 * 86_400_000).toISOString(),
        })
      );
      expect(res.status).toBe(422);
    });

    it("can check a patient in", async () => {
      as(frontDeskId);
      const { PATCH } = await import("../appointments/[appointmentId]/route");
      const res = await PATCH(req("PATCH", "/", { status: "CHECKED_IN" }), {
        params: Promise.resolve({ appointmentId }),
      });
      expect(res.status).toBe(200);
      const row = await prisma.appointment.findUnique({ where: { id: appointmentId } });
      expect(row?.status).toBe("CHECKED_IN");
    });

    it("cannot hard-delete an appointment", async () => {
      as(frontDeskId);
      const { DELETE } = await import("../appointments/[appointmentId]/route");
      const res = await DELETE(req("DELETE", "/"), { params: Promise.resolve({ appointmentId }) });
      expect(res.status).toBe(403);
      expect(await prisma.appointment.count({ where: { id: appointmentId } })).toBe(1);
    });
  });

  // ─── Invoices: mark paid ───

  it("can mark an invoice paid", async () => {
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `${TEST_PREFIX}-INV-1`,
        amount: 120,
        status: "SENT",
        lineItems: [{ description: "Adjustment", quantity: 1, unitPrice: 120, total: 120 }],
        patientId,
        branchId,
      },
    });
    as(frontDeskId);
    const { PATCH } = await import("../invoices/[invoiceId]/route");
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ status: "PAID" }) }), {
      params: Promise.resolve({ invoiceId: invoice.id }),
    });
    expect(res.status).toBe(200);
    const row = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(row?.status).toBe("PAID");
    expect(row?.paidAt).not.toBeNull();
  });

  // ─── Patients: demographics yes, clinical no, delete no ───

  describe("patients", () => {
    it("GET omits medicalHistory, notes, visits and X-rays", async () => {
      as(frontDeskId);
      const { GET } = await import("../patients/[patientId]/route");
      const res = await GET(req("GET", `/api/patients/${patientId}?include=detail`), patientParams());
      expect(res.status).toBe(200);
      const { patient } = await res.json();
      expect(patient.firstName).toBe("Pat");
      expect(patient.phone).toBe("0123456789");
      expect(patient).not.toHaveProperty("medicalHistory");
      expect(patient).not.toHaveProperty("notes");
      expect(patient).not.toHaveProperty("recoveryTrend");
      expect(patient.recentVisits).toEqual([]);
      expect(patient.xrays).toEqual([]);
    });

    it("owner still gets the clinical fields", async () => {
      as(ownerId);
      const { GET } = await import("../patients/[patientId]/route");
      const res = await GET(req("GET", `/api/patients/${patientId}`), patientParams());
      const { patient } = await res.json();
      expect(patient.medicalHistory).toBe("L4-L5 disc herniation");
      expect(patient.recentVisits).toHaveLength(1);
      expect(patient.xrays).toHaveLength(1);
    });

    it("list shows every branch patient without clinical fields", async () => {
      as(frontDeskId);
      const { GET } = await import("../patients/route");
      const res = await GET(req("GET", `/api/patients?branchId=${branchId}`));
      expect(res.status).toBe(200);
      const rows = await res.json();
      const row = rows.find((p: { id: string }) => p.id === patientId);
      expect(row).toBeDefined();
      expect(row).not.toHaveProperty("medicalHistory");
      expect(row).not.toHaveProperty("notes");
    });

    it("PATCH edits demographics and ignores clinical fields", async () => {
      as(frontDeskId);
      const { PATCH } = await import("../patients/[patientId]/route");
      const res = await PATCH(
        req("PATCH", `/api/patients/${patientId}`, {
          phone: "0199999999",
          medicalHistory: "",
          notes: "overwritten",
        }),
        patientParams()
      );
      expect(res.status).toBe(200);
      const row = await prisma.patient.findUnique({ where: { id: patientId } });
      expect(row?.phone).toBe("0199999999");
      expect(row?.medicalHistory).toBe("L4-L5 disc herniation");
      expect(row?.notes).toBe("Private clinical note");
    });

    it("POST requires a doctor and ignores clinical fields", async () => {
      as(frontDeskId);
      const { POST } = await import("../patients/route");
      const missing = await POST(req("POST", "/api/patients", { firstName: "New", lastName: TEST_PREFIX }));
      expect(missing.status).toBe(400);

      const res = await POST(
        req("POST", "/api/patients", {
          firstName: "New",
          lastName: TEST_PREFIX,
          doctorId,
          medicalHistory: "should be ignored",
        })
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.doctorId).toBe(doctorId);
      expect(body).not.toHaveProperty("medicalHistory");
      const row = await prisma.patient.findUnique({ where: { id: body.id } });
      expect(row?.medicalHistory).toBeNull();
    });

    it("cannot assign a patient to the front desk", async () => {
      as(ownerId);
      const { PATCH } = await import("../patients/[patientId]/route");
      const res = await PATCH(req("PATCH", `/api/patients/${patientId}`, { doctorId: frontDeskId }), patientParams());
      expect(res.status).toBe(400);
    });

    it("DELETE is forbidden", async () => {
      as(frontDeskId);
      const { DELETE } = await import("../patients/[patientId]/route");
      const res = await DELETE(req("DELETE", `/api/patients/${patientId}`), patientParams());
      expect(res.status).toBe(403);
      expect(await prisma.patient.count({ where: { id: patientId } })).toBe(1);
    });
  });

  // ─── Clinical APIs ───

  describe("clinical APIs are closed", () => {
    it("visits list → 403", async () => {
      as(frontDeskId);
      const { GET } = await import("../patients/[patientId]/visits/route");
      const res = await GET(req("GET", `/api/patients/${patientId}/visits`), patientParams());
      expect(res.status).toBe(403);
    });

    it("visit create → 403", async () => {
      as(frontDeskId);
      const { POST } = await import("../patients/[patientId]/visits/route");
      const res = await POST(req("POST", `/api/patients/${patientId}/visits`, { subjective: "x" }), patientParams());
      expect(res.status).toBe(403);
    });

    it("visit update → 403", async () => {
      as(frontDeskId);
      const { PUT } = await import("../patients/[patientId]/visits/[visitId]/route");
      const res = await PUT(req("PUT", "/", { subjective: "x" }), {
        params: Promise.resolve({ patientId, visitId }),
      });
      expect(res.status).toBe(403);
    });

    it("X-ray GET → 404", async () => {
      as(frontDeskId);
      const { GET } = await import("../xrays/[xrayId]/route");
      const res = await GET(req("GET", `/api/xrays/${xrayId}`), { params: Promise.resolve({ xrayId }) });
      expect(res.status).toBe(404);
    });

    it("patient X-ray list → 404", async () => {
      as(frontDeskId);
      const { GET } = await import("../xrays/route");
      const res = await GET(req("GET", `/api/xrays?patientId=${patientId}`));
      expect(res.status).toBe(404);
    });

    it("doctor's visit notes → 403", async () => {
      as(frontDeskId);
      const { GET } = await import("../doctors/[userId]/visits/route");
      const res = await GET(req("GET", `/api/doctors/${doctorId}/visits`), {
        params: Promise.resolve({ userId: doctorId }),
      });
      expect(res.status).toBe(403);
    });
  });

  // ─── Branch settings, staff, audit ───

  describe("branch administration is closed", () => {
    it("branch audit log → 403", async () => {
      as(frontDeskId);
      const { GET } = await import("../branches/[branchId]/audit-log/route");
      const res = await GET(req("GET", `/api/branches/${branchId}/audit-log`), {
        params: Promise.resolve({ branchId }),
      });
      expect(res.status).toBe(403);
    });

    it("reminder settings → 403", async () => {
      as(frontDeskId);
      const { GET } = await import("../branches/[branchId]/reminder-settings/route");
      const res = await GET(new Request("http://x"), { params: Promise.resolve({ branchId }) });
      expect(res.status).toBe(403);
    });

    it("cannot add staff", async () => {
      as(frontDeskId);
      const { POST } = await import("../branches/[branchId]/members/route");
      const res = await POST(req("POST", "/", { email: `${TEST_PREFIX}-o@t.com`, role: "DOCTOR" }), {
        params: Promise.resolve({ branchId }),
      });
      expect(res.status).toBe(403);
    });

    it("owner can create a front desk account without a doctor profile", async () => {
      as(ownerId);
      const { POST } = await import("../doctors/route");
      const res = await POST(
        req("POST", "/api/doctors", {
          name: "Aina Reception",
          email: `${TEST_PREFIX}-fd2@t.com`,
          password: "password123",
          branchId,
          role: "FRONT_DESK",
          licenseNumber: "IGNORED",
        })
      );
      expect(res.status).toBe(201);
      const user = await prisma.user.findUnique({
        where: { email: `${TEST_PREFIX}-fd2@t.com` },
        include: { doctorProfile: true, branchMemberships: true },
      });
      expect(user?.doctorProfile).toBeNull();
      expect(user?.branchMemberships[0]?.role).toBe("FRONT_DESK");
    });

    it("front desk cannot create staff", async () => {
      as(frontDeskId);
      const { POST } = await import("../doctors/route");
      const res = await POST(
        req("POST", "/api/doctors", {
          name: "Nope",
          email: `${TEST_PREFIX}-nope@t.com`,
          password: "password123",
          branchId,
          role: "DOCTOR",
        })
      );
      expect(res.status).toBe(403);
    });
  });
});
