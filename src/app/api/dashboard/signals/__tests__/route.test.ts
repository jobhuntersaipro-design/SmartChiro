import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { clinicCalendar } from "@/lib/clinic-time";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));

import { GET } from "../route";

const PREFIX = `test-signals-${Date.now()}`;
const DAY = 86_400_000;

let ownerId: string, doctorId: string, outsiderId: string;
let branchA: string, branchB: string, foreignBranch: string;
let recallPatientId: string;

const get = (branchId?: string) =>
  GET(new NextRequest(`http://x/api/dashboard/signals${branchId ? `?branchId=${branchId}` : ""}`));

async function patient(branchId: string, name: string, status = "active") {
  const p = await prisma.patient.create({
    data: { firstName: name, lastName: PREFIX, branchId, doctorId, status },
  });
  return p.id;
}

describe("GET /api/dashboard/signals", () => {
  beforeAll(async () => {
    const now = new Date();
    const cal = clinicCalendar(now);
    const [owner, doctor, outsider] = await Promise.all(
      ["owner", "doctor", "outsider"].map((n) =>
        prisma.user.create({ data: { email: `${PREFIX}-${n}@t.test`, name: n } })
      )
    );
    ownerId = owner.id;
    doctorId = doctor.id;
    outsiderId = outsider.id;
    const [a, b, f] = await Promise.all(
      ["A", "B", "F"].map((n) => prisma.branch.create({ data: { name: `${PREFIX} ${n}` } }))
    );
    branchA = a.id;
    branchB = b.id;
    foreignBranch = f.id;
    await prisma.branchMember.createMany({
      data: [
        { userId: ownerId, branchId: branchA, role: "OWNER" },
        { userId: ownerId, branchId: branchB, role: "ADMIN" },
        { userId: doctorId, branchId: branchA, role: "DOCTOR" },
        { userId: outsiderId, branchId: foreignBranch, role: "OWNER" },
      ],
    });

    const pA = await patient(branchA, "Paid");
    const pB = await patient(branchB, "Other");
    const pF = await patient(foreignBranch, "Foreign");

    // Revenue = payments received today: a deposit on a still-open invoice
    // counts, a payment yesterday, an unpaid invoice and another org's don't.
    const inv = async (branchId: string, patientId: string, amount: number, paidAt: Date | null) => {
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `${PREFIX}-${Math.random().toString(36).slice(2, 10)}`,
          amount, status: paidAt ? "PAID" : "SENT", paidAt, amountPaid: paidAt ? amount : 0, branchId, patientId, lineItems: [],
        },
      });
      if (paidAt) {
        await prisma.payment.create({
          data: {
            invoiceId: invoice.id, branchId, amount, method: "CASH", receivedAt: paidAt,
            receiptNumber: `${PREFIX}-R-${Math.random().toString(36).slice(2, 10)}`,
          },
        });
      }
      return invoice;
    };
    await Promise.all([
      inv(branchA, pA, 120, new Date(cal.dayStart.getTime() + 60_000)),
      inv(branchB, pB, 80.5, new Date(cal.dayStart.getTime() + 120_000)),
      inv(branchA, pA, 999, new Date(cal.dayStart.getTime() - 60_000)),
      inv(branchA, pA, 50, null),
      inv(foreignBranch, pF, 700, new Date(cal.dayStart.getTime() + 60_000)),
    ]);

    // No-show today, stale (past + SCHEDULED), plus rows that must not count.
    const appt = (branchId: string, patientId: string, dateTime: Date, status: "SCHEDULED" | "NO_SHOW" | "COMPLETED") =>
      prisma.appointment.create({ data: { branchId, patientId, doctorId, dateTime, status } });
    await Promise.all([
      appt(branchA, pA, new Date(cal.dayStart.getTime() + 30 * 60_000), "NO_SHOW"),
      appt(branchA, pA, new Date(cal.dayStart.getTime() - DAY), "NO_SHOW"),
      appt(branchA, pA, new Date(now.getTime() - 3 * DAY), "SCHEDULED"),
      appt(branchB, pB, new Date(now.getTime() - 60_000), "SCHEDULED"),
      appt(branchA, pA, new Date(now.getTime() - 2 * DAY), "COMPLETED"),
      appt(foreignBranch, pF, new Date(now.getTime() - DAY), "SCHEDULED"),
    ]);

    // Recall: lapsed 45 days, nothing booked → due. Lapsed but booked, visited
    // recently, never visited, or inactive → not due.
    recallPatientId = await patient(branchA, "Lapsed");
    const booked = await patient(branchA, "Booked");
    const recent = await patient(branchA, "Recent");
    await patient(branchA, "NeverVisited");
    const inactive = await patient(branchA, "Inactive", "inactive");
    const visit = (patientId: string, daysAgo: number) =>
      prisma.visit.create({ data: { patientId, doctorId, visitDate: new Date(now.getTime() - daysAgo * DAY) } });
    await Promise.all([
      visit(recallPatientId, 45),
      visit(recallPatientId, 90),
      visit(booked, 60),
      visit(recent, 40),
      visit(recent, 5),
      visit(inactive, 60),
    ]);
    await appt(branchA, booked, new Date(now.getTime() + 2 * DAY), "SCHEDULED");
  });

  afterAll(async () => {
    const branches = { in: [branchA, branchB, foreignBranch] };
    await prisma.payment.deleteMany({ where: { branchId: branches } });
    await prisma.invoice.deleteMany({ where: { branchId: branches } });
    await prisma.appointment.deleteMany({ where: { branchId: branches } });
    await prisma.visit.deleteMany({ where: { patient: { branchId: branches } } });
    await prisma.patient.deleteMany({ where: { branchId: branches } });
    await prisma.branchMember.deleteMany({ where: { branchId: branches } });
    await prisma.branch.deleteMany({ where: { id: branches } });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  });

  it("401 without a session", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await get("all")).status).toBe(401);
  });

  it("403 for a user who only has DOCTOR memberships", async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } });
    expect((await get("all")).status).toBe(403);
  });

  it("404 for a branch the caller doesn't manage", async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    expect((await get(foreignBranch)).status).toBe(404);
  });

  it("sums across every managed branch for ?branchId=all", async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const res = await get("all");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revenueToday).toBeCloseTo(200.5);
    expect(body.paymentsToday).toBe(2);
    expect(body.noShowsToday).toBe(1);
    expect(body.staleAppointments).toBe(2);
    expect(body.recallDue).toBe(1);
    expect(body.recallSample).toEqual([
      expect.objectContaining({ id: recallPatientId, name: `Lapsed ${PREFIX}` }),
    ]);
  });

  it("scopes to one branch", async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const body = await (await get(branchB)).json();
    expect(body.revenueToday).toBeCloseTo(80.5);
    expect(body.noShowsToday).toBe(0);
    expect(body.staleAppointments).toBe(1);
    expect(body.recallDue).toBe(0);
    expect(body.recallSample).toEqual([]);
  });
});
