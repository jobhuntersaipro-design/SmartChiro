import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

// Bug-fix plan 2, Phase 9 (clinical records and screens), the API side.

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth-utils", () => ({ getCurrentUser: vi.fn(), getUserBranchRole: vi.fn() }));
import { auth } from "@/lib/auth";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

const P = `test-clin9-${Date.now()}`;
let owner: string, doc: string, doc2: string, office: string, desk: string, branchId: string, patientId: string;

const as = (id: string) => {
  vi.mocked(auth).mockResolvedValue({ user: { id, email: `${id}@t` } } as never);
  vi.mocked(getCurrentUser).mockResolvedValue({ id, email: `${id}@t`, name: id } as never);
  vi.mocked(getUserBranchRole).mockImplementation(async (userId: string, b: string) =>
    (await prisma.branchMember.findUnique({ where: { userId_branchId: { userId, branchId: b } } }))?.role ?? null,
  );
};
const json = (method: string, body?: unknown) =>
  new Request("http://x", { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

beforeAll(async () => {
  const mk = (n: string) => prisma.user.create({ data: { email: `${P}-${n}@t.com`, name: n } }).then((u) => u.id);
  [owner, doc, doc2, office, desk] = await Promise.all([mk("owner"), mk("doc"), mk("doc2"), mk("office"), mk("desk")]);
  branchId = (await prisma.branch.create({ data: { name: `${P} Branch`, billingUserId: owner } })).id;
  await prisma.branchMember.createMany({
    data: [
      { userId: owner, branchId, role: "OWNER" },
      { userId: doc, branchId, role: "DOCTOR" },
      { userId: doc2, branchId, role: "DOCTOR" },
      { userId: office, branchId, role: "ADMIN" },
      { userId: desk, branchId, role: "FRONT_DESK" },
    ],
  });
  patientId = (await prisma.patient.create({ data: { firstName: "Siti", lastName: P, branchId, doctorId: doc, phone: "0123" } })).id;
}, 30_000);

afterAll(async () => {
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
});

describe("U1 — the assigned doctor edits their patient", () => {
  it("saves when the form sends the unchanged doctor; reassigning is still refused", async () => {
    const { PATCH } = await import("../patients/[patientId]/route");
    as(doc);
    const ok = await PATCH(json("PATCH", { phone: "0199999", doctorId: doc }) as never, params({ patientId }));
    expect(ok.status).toBe(200);
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: patientId } })).phone).toBe("0199999");
    expect((await PATCH(json("PATCH", { doctorId: doc2 }) as never, params({ patientId }))).status).toBe(403);
  });
});

describe("U4 — editing a visit can clear things", () => {
  it("null clears vitals and next visit; questionnaire null removes it", async () => {
    const visit = await prisma.visit.create({
      data: {
        patientId, doctorId: doc, heartRate: 80, nextVisitDays: 7,
        questionnaire: { create: { painLevel: 5, mobilityScore: 5, sleepQuality: 5, dailyFunction: 5, overallImprovement: 5 } },
      },
    });
    const { PUT } = await import("../patients/[patientId]/visits/[visitId]/route");
    as(doc);
    const res = await PUT(json("PUT", { heartRate: null, nextVisitDays: null, questionnaire: null }) as never, params({ patientId, visitId: visit.id }));
    expect(res.status).toBe(200);
    const after = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id }, include: { questionnaire: true } });
    expect(after).toMatchObject({ heartRate: null, nextVisitDays: null, questionnaire: null });
  });
});

describe("U12 — who a visit is credited to", () => {
  it("office staff record it for the patient's doctor; a front-desk 'doctor' is refused", async () => {
    const { POST } = await import("../patients/[patientId]/visits/route");
    as(office); // ADMIN with no doctor profile
    const res = await POST(json("POST", { subjective: "Back pain" }) as never, params({ patientId }));
    expect(res.status).toBe(201);
    const { visit } = await res.json();
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).doctorId).toBe(doc);
    expect((await POST(json("POST", { subjective: "x", doctorId: desk }) as never, params({ patientId }))).status).toBe(400);
  });
});

describe("U11 — care-plan edits follow the appointment rules", () => {
  it("can't go to front desk; a doctor cancelling the rest only cancels their own bookings", async () => {
    const plan = await prisma.carePlan.create({
      data: { patientId, branchId, doctorId: doc, title: "Rehab", visitsPerWeek: 2, totalVisits: 8, startDate: new Date() },
    });
    const series = await prisma.appointmentSeries.create({
      data: { patientId, branchId, doctorId: doc, duration: 30, weekdays: [1], startTime: "10:00", startDate: new Date(), carePlanId: plan.id },
    });
    const later = (days: number) => new Date(Date.now() + days * 86_400_000);
    const mine = await prisma.appointment.create({ data: { patientId, branchId, doctorId: doc, dateTime: later(3), seriesId: series.id } });
    const theirs = await prisma.appointment.create({ data: { patientId, branchId, doctorId: doc2, dateTime: later(4), seriesId: series.id } });

    const { PATCH } = await import("../care-plans/[carePlanId]/route");
    as(owner);
    const bad = await PATCH(json("PATCH", { doctorId: desk }), params({ carePlanId: plan.id }));
    expect(bad.status).toBe(422);

    as(doc);
    const res = await PATCH(json("PATCH", { status: "CANCELLED", cancelRemaining: true }), params({ carePlanId: plan.id }));
    expect(res.status).toBe(200);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("CANCELLED");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe("SCHEDULED");
  });
});

describe("U14 — an appointment knows its visit", () => {
  it("GET returns the linked visit to clinicians, not to front desk", async () => {
    const appt = await prisma.appointment.create({
      data: { patientId, branchId, doctorId: doc, dateTime: new Date(Date.now() - 86_400_000), status: "COMPLETED" },
    });
    const visit = await prisma.visit.create({ data: { patientId, doctorId: doc, appointmentId: appt.id } });
    const { GET } = await import("../appointments/[appointmentId]/route");
    as(owner);
    expect((await (await GET(json("GET"), params({ appointmentId: appt.id }))).json()).appointment.visit.id).toBe(visit.id);
    as(desk);
    expect((await (await GET(json("GET"), params({ appointmentId: appt.id }))).json()).appointment.visit).toBeNull();
  });
});
