import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { clinicInstant } from "@/lib/clinic-time";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

import { GET as revenue } from "../revenue/route";
import { GET as receivables } from "../receivables/route";
import { GET as appointments } from "../appointments/route";
import { GET as utilisation } from "../utilisation/route";
import { GET as packages } from "../packages/route";
import { GET as patients } from "../patients/route";

const PREFIX = `test-reports-${Date.now()}`;
const DAY = 86_400_000;
const AUGUST = "from=2026-08-01&to=2026-08-31";

let ownerId: string, doctorId: string, frontDeskId: string, outsiderId: string;
let branchA: string, branchB: string, foreign: string;
let returningPatientId: string, lapsedPatientId: string;

type Handler = (req: Request) => Promise<Response>;
const call = (handler: Handler, userId: string | null, query: string) => {
  mockAuth.mockResolvedValue(userId ? { user: { id: userId } } : null);
  return handler(new Request(`http://x/api/reports?${query}`));
};
const json = async (handler: Handler, userId: string, query: string) => {
  const res = await call(handler, userId, query);
  expect(res.status).toBe(200);
  return res.json();
};

let seq = 0;
const uid = () => `${PREFIX}-${++seq}`;
const aug = (day: number, hour = 10, minute = 0) => clinicInstant(2026, 8, day, hour, minute);

async function invoice(data: {
  branchId: string;
  patientId: string;
  amount: number;
  status: "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
  issuedAt: Date;
  amountPaid?: number;
  dueDate?: Date;
  appointmentId?: string;
}) {
  return prisma.invoice.create({
    data: { invoiceNumber: uid(), lineItems: [], amountPaid: 0, ...data },
  });
}

const pay = (invoiceId: string, branchId: string, amount: number, receivedAt: Date, refundReason?: string) =>
  prisma.payment.create({
    data: { invoiceId, branchId, amount, receivedAt, method: "CASH", receiptNumber: uid(), refundReason },
  });

describe("GET /api/reports/*", () => {
  beforeAll(async () => {
    const now = Date.now();
    const [owner, doctor, frontDesk, outsider] = await Promise.all(
      ["owner", "doctor", "desk", "outsider"].map((n) =>
        prisma.user.create({ data: { email: `${PREFIX}-${n}@t.test`, name: n === "doctor" ? "Aisha Rahman" : n } }),
      ),
    );
    [ownerId, doctorId, frontDeskId, outsiderId] = [owner.id, doctor.id, frontDesk.id, outsider.id];
    const [a, b, f] = await Promise.all(
      ["A", "B", "F"].map((n) => prisma.branch.create({ data: { name: `${PREFIX} ${n}` } })),
    );
    [branchA, branchB, foreign] = [a.id, b.id, f.id];
    await prisma.branchMember.createMany({
      data: [
        { userId: ownerId, branchId: branchA, role: "OWNER" },
        { userId: ownerId, branchId: branchB, role: "ADMIN" },
        { userId: doctorId, branchId: branchA, role: "DOCTOR" },
        { userId: frontDeskId, branchId: branchA, role: "FRONT_DESK" },
        { userId: outsiderId, branchId: foreign, role: "OWNER" },
      ],
    });
    // Mondays 09:00–17:00 (five Mondays in August 2026) minus a Monday 12–1 break.
    await prisma.doctorProfile.create({
      data: { userId: doctorId, workingSchedule: { monday: { start: "09:00", end: "17:00" } } },
    });
    await prisma.doctorBreakTime.create({
      data: { userId: doctorId, branchId: branchA, dayOfWeek: 1, startMinute: 720, endMinute: 780, label: "Lunch" },
    });

    const patient = (branchId: string, name: string, createdAt?: Date) =>
      prisma.patient.create({ data: { firstName: name, lastName: PREFIX, branchId, doctorId, ...(createdAt ? { createdAt } : {}) } });
    const [pA, pB, pF, pLapsed] = await Promise.all([
      patient(branchA, "Returning", aug(2)),
      patient(branchB, "Package"),
      patient(foreign, "Foreign"),
      patient(branchA, "Lapsed"),
    ]);
    returningPatientId = pA.id;
    lapsedPatientId = pLapsed.id;

    // Appointments in August at branch A: 6 completed, 2 no-show, 2 cancelled, 1 scheduled (30 min each).
    const appt = (status: "COMPLETED" | "NO_SHOW" | "CANCELLED" | "SCHEDULED", day: number, extra = {}) =>
      prisma.appointment.create({
        data: { branchId: branchA, patientId: pA.id, doctorId, dateTime: aug(day), status, duration: 30, ...extra },
      });
    const invoiced = await appt("COMPLETED", 3, { treatmentType: "ADJUSTMENT" });
    await Promise.all([
      ...[4, 5, 6, 7, 10].map((d) => appt("COMPLETED", d)),
      appt("NO_SHOW", 11),
      appt("NO_SHOW", 12),
      appt("CANCELLED", 13),
      appt("CANCELLED", 14),
      appt("SCHEDULED", 17),
      // Outside the range / other org: never counted.
      appt("COMPLETED", 31, { dateTime: clinicInstant(2026, 9, 1, 0, 30) }),
      prisma.appointment.create({
        data: { branchId: foreign, patientId: pF.id, doctorId: outsiderId, dateTime: aug(5), status: "NO_SHOW" },
      }),
      // Keeps the returning patient from counting as lapsed, whenever the test runs.
      prisma.appointment.create({
        data: { branchId: branchA, patientId: pA.id, doctorId, dateTime: new Date(now + 5 * DAY), status: "SCHEDULED" },
      }),
    ]);

    // Revenue.
    const appointmentInvoice = await invoice({
      branchId: branchA, patientId: pA.id, amount: 150, status: "PARTIALLY_PAID", amountPaid: 130,
      issuedAt: aug(3), dueDate: aug(10), appointmentId: invoiced.id,
    });
    await pay(appointmentInvoice.id, branchA, 150, aug(3));
    await pay(appointmentInvoice.id, branchA, -20, aug(5), "Overcharged");

    const packageInvoice = await invoice({ branchId: branchB, patientId: pB.id, amount: 600, status: "PAID", amountPaid: 600, issuedAt: aug(10) });
    await pay(packageInvoice.id, branchB, 600, aug(10));

    const manual = await invoice({ branchId: branchA, patientId: pA.id, amount: 80, status: "PAID", amountPaid: 80, issuedAt: aug(12) });
    await pay(manual.id, branchA, 50, aug(12));
    await pay(manual.id, branchA, 10, aug(31, 23, 30)); // last minute of the clinic month: counts
    await pay(manual.id, branchA, 20, clinicInstant(2026, 9, 1, 0, 30)); // September: doesn't

    await invoice({ branchId: branchA, patientId: pA.id, amount: 999, status: "CANCELLED", issuedAt: aug(12) });
    await invoice({ branchId: branchA, patientId: pA.id, amount: 77, status: "DRAFT", issuedAt: aug(12) });
    await invoice({ branchId: branchA, patientId: pA.id, amount: 100, status: "SENT", issuedAt: new Date(now), dueDate: new Date(now + 10 * DAY) });
    const foreignInvoice = await invoice({ branchId: foreign, patientId: pF.id, amount: 700, status: "PAID", amountPaid: 700, issuedAt: aug(5) });
    await pay(foreignInvoice.id, foreign, 700, aug(5));

    // Packages: 8 × 100 left, a sale expiring soon (10 × 60), an expired one and a cancelled one.
    const pkg = (data: Record<string, unknown>) =>
      prisma.patientPackage.create({
        data: { patientId: pA.id, branchId: branchA, name: "12 adjustments", sessionsTotal: 12, price: 1200, purchasedAt: clinicInstant(2026, 7, 1), ...data },
      });
    await Promise.all([
      pkg({ sessionsUsed: 4 }),
      pkg({
        patientId: pB.id, branchId: branchB, name: "10 sessions", sessionsTotal: 10, price: 600,
        purchasedAt: aug(10), expiresAt: new Date(now + 20 * DAY), invoiceId: packageInvoice.id,
      }),
      pkg({ expiresAt: new Date(now - DAY) }),
      pkg({ status: "CANCELLED", purchasedAt: aug(15) }),
    ]);

    // Retention: the returning patient was seen in August and in July; the lapsed one 90 days ago.
    await prisma.visit.createMany({
      data: [
        { patientId: pA.id, doctorId, visitDate: aug(5) },
        { patientId: pA.id, doctorId, visitDate: clinicInstant(2026, 7, 1, 10) },
        { patientId: pLapsed.id, doctorId, visitDate: new Date(now - 90 * DAY) },
      ],
    });
  });

  afterAll(async () => {
    const branches = { in: [branchA, branchB, foreign] };
    await prisma.patientPackage.deleteMany({ where: { branchId: branches } });
    await prisma.payment.deleteMany({ where: { branchId: branches } });
    await prisma.invoice.deleteMany({ where: { branchId: branches } });
    await prisma.appointment.deleteMany({ where: { branchId: branches } });
    await prisma.visit.deleteMany({ where: { patient: { branchId: branches } } });
    await prisma.patient.deleteMany({ where: { branchId: branches } });
    await prisma.doctorBreakTime.deleteMany({ where: { branchId: branches } });
    await prisma.branchMember.deleteMany({ where: { branchId: branches } });
    await prisma.branch.deleteMany({ where: { id: branches } });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  });

  describe("access", () => {
    const handlers: [string, Handler][] = [
      ["revenue", revenue], ["receivables", receivables], ["appointments", appointments],
      ["utilisation", utilisation], ["packages", packages], ["patients", patients],
    ];

    it.each(handlers)("%s: 401 signed out, 403 doctor / front desk, 404 other clinic", async (_name, handler) => {
      expect((await call(handler, null, `branchId=${branchA}`)).status).toBe(401);
      expect((await call(handler, doctorId, `branchId=${branchA}`)).status).toBe(403);
      expect((await call(handler, doctorId, "branchId=all")).status).toBe(403);
      expect((await call(handler, frontDeskId, `branchId=${branchA}`)).status).toBe(403);
      expect((await call(handler, ownerId, `branchId=${foreign}`)).status).toBe(404);
      expect((await call(handler, outsiderId, `branchId=${branchA}`)).status).toBe(404);
    });

    it("rejects a bad range", async () => {
      const res = await call(revenue, ownerId, "branchId=all&from=2026-09-30&to=2026-09-01");
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_range");
    });
  });

  describe("revenue", () => {
    it("collected is net of refunds, invoiced skips drafts and cancelled, clinic-day edges hold", async () => {
      const body = await json(revenue, ownerId, `branchId=all&${AUGUST}`);
      expect(body.scope).toEqual({ branchIds: expect.arrayContaining([branchA, branchB]), label: "All branches" });
      expect(body.totals).toEqual({ collected: 790, refunds: 20, payments: 4, invoiced: 830, invoices: 3 });
      expect(body.granularity).toBe("day");
      expect(body.trend).toHaveLength(31);
      const day = (key: string) => body.trend.find((t: { key: string }) => t.key === key);
      expect(day("2026-08-03")).toMatchObject({ collected: 150, invoiced: 150 });
      expect(day("2026-08-05")).toMatchObject({ collected: -20 });
      expect(day("2026-08-31")).toMatchObject({ collected: 10 });
    });

    it("attributes to the appointment's doctor, package sales and no appointment", async () => {
      const body = await json(revenue, ownerId, `branchId=all&${AUGUST}`);
      const rows = Object.fromEntries(
        body.byDoctor.map((r: { name: string; kind: string; collected: number; invoiced: number }) => [r.name, [r.kind, r.collected, r.invoiced]]),
      );
      expect(rows).toEqual({
        "Package sales": ["package_sales", 600, 600],
        "Dr. Aisha Rahman": ["doctor", 130, 150],
        "No appointment": ["no_appointment", 60, 80],
      });
      const treatments = Object.fromEntries(body.byTreatment.map((r: { name: string; collected: number }) => [r.name, r.collected]));
      expect(treatments).toEqual({ "Package sales": 600, Adjustment: 130, "No appointment": 60 });
      const branches = Object.fromEntries(body.byBranch.map((r: { key: string; collected: number; invoiced: number }) => [r.key, [r.collected, r.invoiced]]));
      expect(branches).toEqual({ [branchA]: [190, 230], [branchB]: [600, 600] });
    });

    it("scopes to one branch", async () => {
      const body = await json(revenue, ownerId, `branchId=${branchB}&${AUGUST}`);
      expect(body.scope.label).toBe(`${PREFIX} B`);
      expect(body.totals).toMatchObject({ collected: 600, invoiced: 600 });
    });
  });

  it("receivables: open and overdue balances, oldest overdue first", async () => {
    const body = await json(receivables, ownerId, "branchId=all");
    expect(body.open).toEqual({ balance: 120, count: 2 });
    expect(body.overdue).toEqual({ balance: 20, count: 1 });
    expect(body.oldestOverdue).toHaveLength(1);
    expect(body.oldestOverdue[0]).toMatchObject({ balance: 20, total: 150, patientName: `Returning ${PREFIX}` });
    expect(body.oldestOverdue[0].daysOverdue).toBeGreaterThan(40);
  });

  it("appointments: counts and rates per doctor", async () => {
    const body = await json(appointments, ownerId, `branchId=${branchA}&${AUGUST}`);
    expect(body.totals).toMatchObject({ booked: 11, completed: 6, noShow: 2, cancelled: 2, open: 1 });
    expect(body.totals.noShowRate).toBe(0.25);
    expect(body.totals.cancellationRate).toBeCloseTo(2 / 11);
    expect(body.byDoctor).toEqual([expect.objectContaining({ doctorId, name: "Dr. Aisha Rahman", booked: 11, noShowRate: 0.25 })]);
  });

  it("utilisation: booked (not cancelled) ÷ schedule minus breaks", async () => {
    const body = await json(utilisation, ownerId, `branchId=${branchA}&${AUGUST}`);
    const row = body.byDoctor.find((r: { doctorId: string }) => r.doctorId === doctorId);
    // 5 Mondays × (8h − 1h break) = 2100 min; 9 non-cancelled × 30 min booked.
    expect(row).toMatchObject({ bookedMinutes: 270, availableMinutes: 2100, hoursSource: "schedule" });
    expect(row.rate).toBeCloseTo(270 / 2100);
  });

  it("packages: liability of usable packages and sales in range", async () => {
    const body = await json(packages, ownerId, `branchId=all&${AUGUST}`);
    expect(body).toMatchObject({ active: 2, sessionsOutstanding: 18, liability: 1400, sold: { count: 1, value: 600 } });
    expect(body.expiringSoon).toEqual({ count: 1, sessions: 10, liability: 600 });
    expect(body.byPackage.map((p: { name: string; liability: number }) => [p.name, p.liability])).toEqual([
      ["12 adjustments", 800],
      ["10 sessions", 600],
    ]);
    const single = await json(packages, ownerId, `branchId=${branchA}&${AUGUST}`);
    expect(single).toMatchObject({ active: 1, liability: 800, sold: { count: 0, value: 0 } });
  });

  it("patients: new, returning and lapsed", async () => {
    const body = await json(patients, ownerId, `branchId=all&${AUGUST}`);
    expect(body).toMatchObject({ newPatients: 1, seen: 1, returning: 1, lapsed: 1, lapsedAfterDays: 60 });
    expect(body.lapsedList).toEqual([expect.objectContaining({ id: lapsedPatientId, branchName: `${PREFIX} A` })]);
    expect(body.lapsedList.some((p: { id: string }) => p.id === returningPatientId)).toBe(false);
  });
});
