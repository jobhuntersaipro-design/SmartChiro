import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET as listTemplates, POST as createTemplate } from "@/app/api/branches/[branchId]/packages/route";
import { PATCH as patchTemplate, DELETE as deleteTemplate } from "@/app/api/branches/[branchId]/packages/[templateId]/route";
import { GET as listPackages, POST as sellPackage } from "../route";
import { PATCH as patchPackage } from "@/app/api/patient-packages/[packageId]/route";
import { PATCH as patchAppointment, GET as getAppointment } from "@/app/api/appointments/[appointmentId]/route";
import { POST as redeem } from "@/app/api/appointments/[appointmentId]/redeem/route";
import { POST as reverse } from "@/app/api/appointments/[appointmentId]/redeem/reverse/route";
import { expireOverduePackages } from "@/lib/package-service";
import {
  at,
  branchRoleFromDb,
  buildFixture,
  cleanupPrefix,
  futureMonday,
  jsonRequest,
  type Fixture,
} from "@/app/api/appointment-series/__tests__/phase3-fixture";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

const PREFIX = "pkg-api-";
const as = (u: { id: string; email: string; name: string | null }) =>
  vi.mocked(getCurrentUser).mockResolvedValue({ id: u.id, email: u.email, name: u.name } as never);

const branchCtx = (branchId: string) => ({ params: Promise.resolve({ branchId }) });
const templateCtx = (branchId: string, templateId: string) => ({ params: Promise.resolve({ branchId, templateId }) });
const patientCtx = (patientId: string) => ({ params: Promise.resolve({ patientId }) });
const apptCtx = (appointmentId: string) => ({ params: Promise.resolve({ appointmentId }) });

async function makeTemplate(f: Fixture, body: Record<string, unknown> = {}) {
  as(f.owner);
  const res = await createTemplate(
    jsonRequest("http://x", "POST", { name: "12 Adjustments", sessions: 12, price: 1200, validityDays: 90, ...body }),
    branchCtx(f.branch.id),
  );
  expect(res.status).toBe(201);
  return (await res.json()).template as { id: string };
}

async function sell(f: Fixture, templateId: string) {
  as(f.owner);
  const res = await sellPackage(jsonRequest("http://x", "POST", { templateId }), patientCtx(f.patient.id));
  expect(res.status).toBe(201);
  return (await res.json()).package as { id: string; invoice: { id: string } };
}

async function makeAppointment(f: Fixture, treatmentType: "ADJUSTMENT" | "SOFT_TISSUE" = "ADJUSTMENT") {
  return prisma.appointment.create({
    data: {
      patientId: f.patient.id,
      branchId: f.branch.id,
      doctorId: f.doctor.id,
      dateTime: at(futureMonday(), 0, "10:00"),
      duration: 30,
      status: "IN_PROGRESS",
      treatmentType,
    },
  });
}

describe("Phase 3 packages API", () => {
  let f: Fixture;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getUserBranchRole).mockImplementation(branchRoleFromDb);
    await cleanupPrefix(PREFIX);
    f = await buildFixture(PREFIX);
  });

  afterAll(async () => {
    await cleanupPrefix(PREFIX);
  });

  it("template CRUD: owners manage, doctors read active only, other branches get 404", async () => {
    const t = await makeTemplate(f, { treatmentTypes: ["ADJUSTMENT", "ADJUSTMENT"] });

    as(f.doctor);
    const denied = await createTemplate(jsonRequest("http://x", "POST", { name: "X", sessions: 1, price: 1 }), branchCtx(f.branch.id));
    expect(denied.status).toBe(403);

    as(f.admin);
    const patched = await patchTemplate(jsonRequest("http://x", "PATCH", { price: 1100.5 }), templateCtx(f.branch.id, t.id));
    expect(patched.status).toBe(200);
    expect((await patched.json()).template).toMatchObject({ price: 1100.5, treatmentTypes: ["ADJUSTMENT"], unitValue: 91.71 });

    as(f.doctor);
    expect((await patchTemplate(jsonRequest("http://x", "PATCH", { price: 1 }), templateCtx(f.branch.id, t.id))).status).toBe(403);

    as(f.outsider);
    expect((await listTemplates(new Request("http://x"), branchCtx(f.branch.id))).status).toBe(404);
    expect((await patchTemplate(jsonRequest("http://x", "PATCH", { price: 1 }), templateCtx(f.otherBranch.id, t.id))).status).toBe(404);

    as(f.owner);
    const del = await deleteTemplate(new Request("http://x", { method: "DELETE" }), templateCtx(f.branch.id, t.id));
    expect((await del.json()).template.isActive).toBe(false);

    as(f.doctor);
    expect((await (await listTemplates(new Request("http://x"), branchCtx(f.branch.id))).json()).templates).toHaveLength(0);
    as(f.owner);
    const all = await listTemplates(new Request("http://x?includeInactive=true"), branchCtx(f.branch.id));
    expect((await all.json()).templates).toHaveLength(1);
  });

  it("selling a package snapshots the template and creates a SENT sale invoice", async () => {
    const t = await makeTemplate(f);
    const pkg = await sell(f, t.id);

    const row = await prisma.patientPackage.findUniqueOrThrow({ where: { id: pkg.id }, include: { invoice: true } });
    expect(row).toMatchObject({ name: "12 Adjustments", sessionsTotal: 12, sessionsUsed: 0, status: "ACTIVE", soldById: f.owner.id });
    expect(row.expiresAt).not.toBeNull();
    expect(row.invoice).toMatchObject({ status: "SENT", patientId: f.patient.id, branchId: f.branch.id, appointmentId: null });
    expect(Number(row.invoice!.amount)).toBe(1200);
    expect(row.invoice!.lineItems).toEqual([
      { description: "Package: 12 Adjustments (12 sessions)", quantity: 1, unitPrice: 1200, total: 1200 },
    ]);

    // Custom package
    const custom = await sellPackage(
      jsonRequest("http://x", "POST", { name: "Wellness 5", sessions: 5, price: 400 }),
      patientCtx(f.patient.id),
    );
    expect(custom.status).toBe(201);

    // Doctors can't sell; the assigned doctor can view.
    as(f.doctor);
    expect((await sellPackage(jsonRequest("http://x", "POST", { templateId: t.id }), patientCtx(f.patient.id))).status).toBe(403);
    const list = await listPackages(new Request("http://x"), patientCtx(f.patient.id));
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.packages).toHaveLength(2);
    expect(body.summary).toEqual({ activeCount: 2, sessionsLeft: 17 });

    // Another doctor of the branch (not assigned) can't view; another branch gets 404.
    as(f.doctor2);
    expect((await listPackages(new Request("http://x"), patientCtx(f.patient.id))).status).toBe(403);
    as(f.outsider);
    expect((await listPackages(new Request("http://x"), patientCtx(f.patient.id))).status).toBe(404);
  });

  it("completing an appointment auto-redeems; reverse restores the session; it can be redeemed again", async () => {
    const t = await makeTemplate(f, { treatmentTypes: ["ADJUSTMENT"] });
    const pkg = await sell(f, t.id);
    const appt = await makeAppointment(f);

    as(f.doctor);
    const done = await patchAppointment(jsonRequest("http://x", "PATCH", { status: "COMPLETED" }), apptCtx(appt.id));
    expect(done.status).toBe(200);
    const doneBody = await done.json();
    expect(doneBody.redemption).toMatchObject({ patientPackageId: pkg.id, sessionsUsed: 1, sessionsTotal: 12, sessionsLeft: 11 });
    expect((await prisma.patientPackage.findUniqueOrThrow({ where: { id: pkg.id } })).sessionsUsed).toBe(1);

    const detail = await (await getAppointment(new Request("http://x"), apptCtx(appt.id))).json();
    expect(detail.appointment.redemption).toMatchObject({ packageName: "12 Adjustments", sessionsUsed: 1 });

    expect((await redeem(jsonRequest("http://x", "POST", {}), apptCtx(appt.id))).status).toBe(409);

    const undo = await reverse(new Request("http://x", { method: "POST" }), apptCtx(appt.id));
    expect(undo.status).toBe(200);
    expect((await undo.json()).reversed).toMatchObject({ sessionsUsed: 0, sessionsLeft: 12 });
    expect((await prisma.patientPackage.findUniqueOrThrow({ where: { id: pkg.id } })).sessionsUsed).toBe(0);
    expect((await reverse(new Request("http://x", { method: "POST" }), apptCtx(appt.id))).status).toBe(404);

    const again = await redeem(jsonRequest("http://x", "POST", { patientPackageId: pkg.id }), apptCtx(appt.id));
    expect(again.status).toBe(201);
    const rows = await prisma.packageRedemption.findMany({ where: { appointmentId: appt.id }, orderBy: { redeemedAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0].reversedAt).not.toBeNull();
    expect(rows[1].reversedAt).toBeNull();

    // History shows both rows.
    as(f.owner);
    const hist = await (await listPackages(new Request("http://x"), patientCtx(f.patient.id))).json();
    expect(hist.packages[0].redemptions).toHaveLength(2);
    expect(hist.packages[0].sessionsUsed).toBe(1);
  });

  it("does not redeem when nothing matches or the visit is invoiced; last session completes the package", async () => {
    const t = await makeTemplate(f, { sessions: 1, price: 100, treatmentTypes: ["ADJUSTMENT"] });
    const pkg = await sell(f, t.id);

    const soft = await makeAppointment(f, "SOFT_TISSUE");
    as(f.owner);
    const noMatch = await redeem(jsonRequest("http://x", "POST", {}), apptCtx(soft.id));
    expect(noMatch.status).toBe(409);
    expect((await noMatch.json()).error).toBe("no_package");
    const completedSoft = await (await patchAppointment(jsonRequest("http://x", "PATCH", { status: "COMPLETED" }), apptCtx(soft.id))).json();
    expect(completedSoft.redemption).toBeNull();

    const invoiced = await makeAppointment(f);
    await prisma.invoice.create({
      data: { invoiceNumber: `${PREFIX}${invoiced.id}`, amount: 80, status: "DRAFT", lineItems: [], patientId: f.patient.id, branchId: f.branch.id, appointmentId: invoiced.id },
    });
    const completedInvoiced = await (await patchAppointment(jsonRequest("http://x", "PATCH", { status: "COMPLETED" }), apptCtx(invoiced.id))).json();
    expect(completedInvoiced.redemption).toBeNull();

    const adj = await makeAppointment(f);
    const done = await (await patchAppointment(jsonRequest("http://x", "PATCH", { status: "COMPLETED" }), apptCtx(adj.id))).json();
    expect(done.redemption.sessionsLeft).toBe(0);
    expect((await prisma.patientPackage.findUniqueOrThrow({ where: { id: pkg.id } })).status).toBe("COMPLETED");

    // Cancelling the visit gives the session back and re-opens the package.
    await patchAppointment(jsonRequest("http://x", "PATCH", { status: "CANCELLED" }), apptCtx(adj.id));
    expect(await prisma.patientPackage.findUniqueOrThrow({ where: { id: pkg.id } })).toMatchObject({ status: "ACTIVE", sessionsUsed: 0 });
  });

  it("cancel requires OWNER/ADMIN and a reason; the expiry sweep marks overdue packages", async () => {
    const t = await makeTemplate(f);
    const pkg = await sell(f, t.id);

    as(f.doctor);
    expect((await patchPackage(jsonRequest("http://x", "PATCH", { status: "CANCELLED", reason: "x" }), { params: Promise.resolve({ packageId: pkg.id }) })).status).toBe(403);
    as(f.owner);
    expect((await patchPackage(jsonRequest("http://x", "PATCH", { status: "CANCELLED" }), { params: Promise.resolve({ packageId: pkg.id }) })).status).toBe(422);
    const ok = await patchPackage(
      jsonRequest("http://x", "PATCH", { status: "CANCELLED", reason: "Moved away", cancelInvoice: true }),
      { params: Promise.resolve({ packageId: pkg.id }) },
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).package).toMatchObject({ status: "CANCELLED", effectiveStatus: "CANCELLED", cancelReason: "Moved away" });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: pkg.invoice.id } })).status).toBe("CANCELLED");

    const old = await sell(f, t.id);
    await prisma.patientPackage.update({ where: { id: old.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await expireOverduePackages()).toBeGreaterThanOrEqual(1);
    expect((await prisma.patientPackage.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("EXPIRED");
  });
});
