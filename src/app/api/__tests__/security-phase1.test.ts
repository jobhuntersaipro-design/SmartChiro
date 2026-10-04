import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { clinicDateKey, clinicInstantFromInputs, clinicCalendar } from "@/lib/clinic-time";

// Bug-fix plan, Phase 1 (security and privacy): one clinic must never read or
// change what a doctor does at another clinic, removed staff lose access, and
// lapsed accounts are read-only.

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

const P = `test-sec1-${Date.now()}`;
const as = (id: string) => mockAuth.mockResolvedValue({ user: { id, email: `${id}@t`, name: id } });
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://x${url}`, { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

let ownerA: string, ownerB: string, doc: string, peer: string, removed: string, lapsed: string, desk: string;
let branchA: string, branchB: string;
let patientA: string, patientB: string, orphan: string;
let apptA: string, apptB: string;
const at = (hm: string) => clinicInstantFromInputs(clinicDateKey(), hm);

beforeAll(async () => {
  const mk = (tag: string, extra: Record<string, unknown> = {}) =>
    prisma.user.create({ data: { email: `${P}-${tag}@t.com`, name: tag, ...extra } }).then((u) => u.id);
  [ownerA, ownerB, doc, peer, removed, desk] = await Promise.all(["ownerA", "ownerB", "doc", "peer", "removed", "desk"].map((t) => mk(t)));
  lapsed = await mk("lapsed", { trialEndsAt: new Date(Date.now() - 86_400_000) });
  branchA = (await prisma.branch.create({ data: { name: `${P} A`, billingUserId: ownerA } })).id;
  branchB = (await prisma.branch.create({ data: { name: `${P} B`, billingUserId: ownerB } })).id;
  const lapsedBranch = (await prisma.branch.create({ data: { name: `${P} L`, billingUserId: lapsed } })).id;
  await prisma.branchMember.createMany({
    data: [
      { userId: ownerA, branchId: branchA, role: "OWNER" },
      { userId: ownerB, branchId: branchB, role: "OWNER" },
      { userId: doc, branchId: branchA, role: "DOCTOR" },
      { userId: doc, branchId: branchB, role: "DOCTOR" },
      { userId: peer, branchId: branchA, role: "DOCTOR" },
      { userId: desk, branchId: branchA, role: "FRONT_DESK" },
      { userId: lapsed, branchId: lapsedBranch, role: "OWNER" },
      // ownerA is also a doctor at clinic B (role is per branch)
      { userId: ownerA, branchId: branchB, role: "DOCTOR" },
    ],
  });
  patientA = (await prisma.patient.create({ data: { firstName: "Alice", lastName: P, branchId: branchA, doctorId: doc } })).id;
  patientB = (await prisma.patient.create({ data: { firstName: "Bob", lastName: P, branchId: branchB, doctorId: doc } })).id;
  // Assigned to a doctor who has since been removed from branch A.
  orphan = (await prisma.patient.create({ data: { firstName: "Orphan", lastName: P, branchId: branchA, doctorId: removed } })).id;
  await prisma.visit.createMany({
    data: [
      { patientId: patientA, doctorId: doc, subjective: "A notes" },
      { patientId: patientB, doctorId: doc, subjective: "B private notes" },
    ],
  });
  apptA = (await prisma.appointment.create({ data: { patientId: patientA, doctorId: doc, branchId: branchA, dateTime: at("10:00") } })).id;
  apptB = (await prisma.appointment.create({ data: { patientId: patientB, doctorId: doc, branchId: branchB, dateTime: at("11:00") } })).id;
  await prisma.appointment.create({ data: { patientId: patientB, doctorId: ownerA, branchId: branchB, dateTime: at("12:00") } });
  await prisma.xray.create({
    data: { patientId: orphan, uploadedById: removed, fileUrl: "https://x/o.jpg", fileName: "o.jpg", fileSize: 1, mimeType: "image/jpeg" },
  });
}, 30_000);

afterAll(async () => {
  const users = { email: { startsWith: P } };
  await prisma.branch.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.user.deleteMany({ where: users });
});

describe("S2 — doctor records are scoped to the caller's branches", () => {
  it("an owner sees the doctor's patients, visits and appointments at their clinic only", async () => {
    const { GET: patients } = await import("../doctors/[userId]/patients/route");
    const { GET: visits } = await import("../doctors/[userId]/visits/route");
    const { GET: appts } = await import("../doctors/[userId]/appointments/route");
    as(ownerA);
    const p = await (await patients(req(`/api/doctors/${doc}/patients`), params({ userId: doc }))).json();
    expect(p.patients.map((r: { id: string }) => r.id)).toEqual([patientA]);
    const v = await (await visits(req(`/api/doctors/${doc}/visits`), params({ userId: doc }))).json();
    expect(v.visits.map((r: { subjective: string }) => r.subjective)).toEqual(["A notes"]);
    const a = await (await appts(req(`/api/doctors/${doc}/appointments`), params({ userId: doc }))).json();
    expect(a.appointments.map((r: { id: string }) => r.id)).toEqual([apptA]);
  });

  it("the doctor sees all of their own; a peer doctor and front desk see no visits", async () => {
    const { GET: patients } = await import("../doctors/[userId]/patients/route");
    const { GET: visits } = await import("../doctors/[userId]/visits/route");
    as(doc);
    const p = await (await patients(req(`/api/doctors/${doc}/patients`), params({ userId: doc }))).json();
    expect(p.patients.map((r: { id: string }) => r.id).sort()).toEqual([patientA, patientB].sort());
    as(peer);
    expect((await patients(req(`/api/doctors/${doc}/patients`), params({ userId: doc }))).status).toBe(403);
    as(desk);
    expect((await visits(req(`/api/doctors/${doc}/visits`), params({ userId: doc }))).status).toBe(403);
  });
});

describe("S3 — one clinic can't change a doctor's schedule or profile at another", () => {
  it("break times: only for a branch the caller manages", async () => {
    const { PUT } = await import("../doctors/[userId]/break-times/route");
    const slot = (branchId: string) => ({ branchId, slots: [{ branchId, dayOfWeek: 1, startMinute: 720, endMinute: 780 }] });
    as(ownerA);
    expect((await PUT(req("/x", "PUT", slot(branchB)), params({ userId: doc }))).status).toBe(403);
    expect((await PUT(req("/x", "PUT", slot(branchA)), params({ userId: doc }))).status).toBe(200);
    as(doc);
    expect((await PUT(req("/x", "PUT", slot(branchB)), params({ userId: doc }))).status).toBe(200);
  });

  it("leave: one branch for its manager; every-branch leave and other clinics' leave are off limits", async () => {
    const { GET, POST } = await import("../doctors/[userId]/time-off/route");
    const { DELETE } = await import("../doctors/[userId]/time-off/[timeOffId]/route");
    const body = (branchId: string | null) => ({
      type: "ANNUAL_LEAVE",
      startDate: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      endDate: new Date(Date.now() + 6 * 86_400_000).toISOString(),
      branchId,
    });
    as(ownerA);
    expect((await POST(req("/x", "POST", body(null)), params({ userId: doc }))).status).toBe(403);
    expect((await POST(req("/x", "POST", body(branchB)), params({ userId: doc }))).status).toBe(403);
    expect((await POST(req("/x", "POST", body(branchA)), params({ userId: doc }))).status).toBe(201);
    as(ownerB);
    const bLeave = await (await POST(req("/x", "POST", body(branchB)), params({ userId: doc }))).json();
    as(ownerA);
    const seen = await (await GET(req("/x"), params({ userId: doc }))).json();
    expect(seen.timeOff.map((t: { branch: { id: string } | null }) => t.branch?.id)).toEqual([branchA]);
    expect((await DELETE(req("/x", "DELETE"), params({ userId: doc, timeOffId: bLeave.timeOffId }))).status).toBe(404);
  });

  it("profile and photo: the doctor, or someone who manages every branch they work in", async () => {
    const { PUT } = await import("../doctors/[userId]/route");
    as(ownerA);
    expect((await PUT(req("/x", "PUT", { name: "Hijacked" }), params({ userId: doc }))).status).toBe(403);
    expect((await PUT(req("/x", "PUT", { name: "Peer Renamed" }), params({ userId: peer }))).status).toBe(200);
    as(doc);
    expect((await PUT(req("/x", "PUT", { name: "Doc" }), params({ userId: doc }))).status).toBe(200);
  });
});

describe("S4 — removed doctors lose access to the patients they were assigned", () => {
  it("patient and X-ray access need a current membership in the patient's branch", async () => {
    const { getPatientAccess } = await import("@/lib/auth/patient-access");
    const { canManagePatientXrays } = await import("@/lib/auth/xray");
    expect((await getPatientAccess(removed, orphan)).allowed).toBe(false);
    expect(await canManagePatientXrays(removed, orphan)).toBe(false);
    expect((await getPatientAccess(doc, patientA)).clinical).toBe(true);
  });
});

describe("S5 — a stale active branch never decides where a patient is created", () => {
  it("creates in a branch the user still belongs to; removing a member forgets their active branch", async () => {
    await prisma.user.update({ where: { id: peer }, data: { activeBranchId: branchB } }); // not a member of B
    const { POST } = await import("../patients/route");
    as(peer);
    const res = await POST(req("/api/patients", "POST", { firstName: "Stale", lastName: P, gender: "Female" }));
    expect(res.status).toBe(201);
    const created = await prisma.patient.findFirstOrThrow({ where: { firstName: "Stale", lastName: P } });
    expect(created.branchId).toBe(branchA);

    const { clearActiveBranch } = await import("@/lib/branch-context");
    await prisma.user.update({ where: { id: peer }, data: { activeBranchId: branchA } });
    await clearActiveBranch([branchA], [peer]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: peer } })).activeBranchId).toBeNull();
  });
});

describe("S6 — dashboard widgets use the role in each branch", () => {
  it("an owner of A who is a doctor at B sees all of A but only their own appointments at B", async () => {
    const { GET } = await import("../dashboard/schedule/route");
    as(ownerA);
    const { appointments } = await (await GET(req("/api/dashboard/schedule?branchId=all"))).json();
    const ids = appointments.map((a: { id: string }) => a.id);
    expect(ids).toContain(apptA);
    expect(ids).not.toContain(apptB); // doc's appointment at B
    expect(appointments.filter((a: { branch: { id: string } }) => a.branch.id === branchB)).toHaveLength(1);
  });
});

describe("S7 — past appointments and appointment history", () => {
  it("a peer doctor can't read another doctor's appointment history; the removed doctor can't read past appointments", async () => {
    const { GET: audit } = await import("../appointments/[appointmentId]/audit-log/route");
    const { GET: past } = await import("../patients/[patientId]/past-appointments/route");
    as(peer);
    expect((await audit(req("/x"), params({ appointmentId: apptA }))).status).toBe(404);
    as(doc);
    expect((await audit(req("/x"), params({ appointmentId: apptA }))).status).toBe(200);
    as(desk);
    expect((await audit(req("/x"), params({ appointmentId: apptA }))).status).toBe(200);
    as(removed);
    expect((await past(req("/x"), params({ patientId: orphan }))).status).toBe(404);
    as(peer);
    expect((await past(req("/x"), params({ patientId: patientA }))).status).toBe(404);
  });
});

describe("S8 — 'this and following' follows the single-edit rules", () => {
  it("a doctor can't reassign, and only changes their own occurrences", async () => {
    const { editFollowing } = await import("@/lib/series-following");
    const start = clinicCalendar(new Date()).dayStart.getTime() + 7 * 86_400_000;
    const series = await prisma.appointmentSeries.create({
      data: { patientId: patientA, branchId: branchA, doctorId: doc, duration: 30, weekdays: [1], startTime: "10:00", startDate: new Date(start) },
    });
    const occ = await Promise.all(
      [doc, peer].map((d, i) =>
        prisma.appointment.create({
          data: { patientId: patientA, branchId: branchA, doctorId: d, seriesId: series.id, seriesIndex: i + 1, dateTime: new Date(start + (i * 7 + 0.4) * 86_400_000) },
        }),
      ),
    );
    const actor = { id: doc, email: "d@t", name: "doc" };
    const reassign = await editFollowing({ appointmentId: occ[0].id, input: { doctorId: peer }, actor, role: "DOCTOR" });
    expect(reassign.status).toBe(403);
    const cancel = await editFollowing({ appointmentId: occ[0].id, input: { status: "CANCELLED" }, actor, role: "DOCTOR" });
    expect(cancel.status).toBe(200);
    const after = await prisma.appointment.findMany({ where: { seriesId: series.id }, orderBy: { seriesIndex: "asc" } });
    expect(after.map((a) => a.status)).toEqual(["CANCELLED", "SCHEDULED"]);
    // Front desk may reassign, but only to a clinician
    const desked = await editFollowing({ appointmentId: occ[1].id, input: { doctorId: desk }, actor: { ...actor, id: desk }, role: "FRONT_DESK" });
    expect(desked.status).toBe(422);
  });
});

describe("S9 — lapsed accounts are read-only", () => {
  it("writes answer 402; reads keep working", async () => {
    const { GET, POST } = await import("../patients/route");
    as(lapsed);
    const res = await POST(req("/api/patients", "POST", { firstName: "Blocked", lastName: P }));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("subscription_required");
    expect((await GET(req("/api/patients"))).status).toBe(200);
    // Staff covered by an active clinic plan still write
    as(desk);
    const ok = await POST(req("/api/patients", "POST", { firstName: "Desk", lastName: P, doctorId: doc }));
    expect(ok.status).toBe(201);
  });
});
