import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as preview } from "../preview/route";
import { POST as createSeries } from "../route";
import { GET as getSeries } from "../[seriesId]/route";
import { PATCH as patchAppointment } from "@/app/api/appointments/[appointmentId]/route";
import { GET as listCarePlans, POST as createCarePlan } from "@/app/api/patients/[patientId]/care-plans/route";
import { PATCH as patchCarePlan } from "@/app/api/care-plans/[carePlanId]/route";
import { POST as createTemplate } from "@/app/api/branches/[branchId]/packages/route";
import { clinicParts } from "@/lib/clinic-time";
import { at, branchRoleFromDb, buildFixture, cleanupPrefix, futureMonday, jsonRequest, type Fixture } from "./phase3-fixture";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

const PREFIX = "series-api-";
const as = (u: { id: string; email: string; name: string | null }) =>
  vi.mocked(getCurrentUser).mockResolvedValue({ id: u.id, email: u.email, name: u.name } as never);
const apptCtx = (appointmentId: string) => ({ params: Promise.resolve({ appointmentId }) });

interface OccurrenceOut {
  dateTime: string;
  ok: boolean;
  problems: string[];
}

describe("Phase 3 appointment series + care plans API", () => {
  let f: Fixture;
  let monday: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getUserBranchRole).mockImplementation(branchRoleFromDb);
    await cleanupPrefix(PREFIX);
    f = await buildFixture(PREFIX);
    monday = futureMonday();
  });

  afterAll(async () => {
    await cleanupPrefix(PREFIX);
  });

  const base = () => ({
    branchId: f.branch.id,
    doctorId: f.doctor.id,
    patientId: f.patient.id,
    startDate: monday,
    intervalWeeks: 1,
  });

  it("preview flags conflict, break, outside hours and time off per occurrence", async () => {
    // Mon 12:30 taken; Wed 12:00–13:00 lunch; Sat closes 13:00; week-2 Monday on leave.
    await prisma.appointment.create({
      data: { patientId: f.patient.id, branchId: f.branch.id, doctorId: f.doctor.id, dateTime: at(monday, 0, "12:30"), duration: 30 },
    });
    await prisma.doctorBreakTime.create({
      data: { userId: f.doctor.id, branchId: f.branch.id, dayOfWeek: 3, startMinute: 720, endMinute: 780, label: "Lunch" },
    });
    await prisma.doctorTimeOff.create({
      data: { userId: f.doctor.id, branchId: f.branch.id, type: "ANNUAL_LEAVE", startDate: at(monday, 7, "00:00"), endDate: at(monday, 8, "00:00") },
    });

    as(f.owner);
    const res = await preview(
      jsonRequest("http://x", "POST", { ...base(), weekdays: [1, 3, 6], startTime: "12:30", duration: 60, count: 4 }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { occurrences: OccurrenceOut[]; summary: { ok: number; withProblems: number } };
    expect(body.occurrences.map((o) => o.problems)).toEqual([["conflict"], ["break"], ["outside_hours"], ["time_off"]]);
    expect(body.summary).toMatchObject({ ok: 0, withProblems: 4 });
    expect(body.occurrences.map((o) => clinicParts(new Date(o.dateTime)).weekday)).toEqual([1, 3, 6, 1]);

    const clean = await preview(jsonRequest("http://x", "POST", { ...base(), weekdays: [2, 4], startTime: "10:00", count: 4 }));
    expect(((await clean.json()) as { summary: { ok: number } }).summary.ok).toBe(4);
  });

  it("create refuses problem dates unless skipProblemDates, then books the valid ones in order", async () => {
    await prisma.appointment.create({
      data: { patientId: f.patient.id, branchId: f.branch.id, doctorId: f.doctor.id, dateTime: at(monday, 2, "10:00"), duration: 30 },
    });
    const rule = { ...base(), weekdays: [1, 3, 5], startTime: "10:00", count: 6, treatmentType: "ADJUSTMENT", notes: "Plan" };

    as(f.owner);
    const refused = await createSeries(jsonRequest("http://x", "POST", rule));
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toBe("series_problems");
    expect(await prisma.appointmentSeries.count({ where: { patientId: f.patient.id } })).toBe(0);

    const res = await createSeries(jsonRequest("http://x", "POST", { ...rule, skipProblemDates: true }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toHaveLength(5);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0].problems).toEqual(["conflict"]);
    expect(body.created.map((a: { seriesIndex: number }) => a.seriesIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(body.series).toMatchObject({ weekdays: [1, 3, 5], startTime: "10:00", count: 6, startDate: monday });

    const rows = await prisma.appointment.findMany({ where: { seriesId: body.series.id }, orderBy: { seriesIndex: "asc" } });
    expect(rows.every((r) => r.treatmentType === "ADJUSTMENT" && r.notes === "Plan" && r.status === "SCHEDULED")).toBe(true);
    expect(rows.map((r) => r.dateTime.getTime())).toEqual([...rows.map((r) => r.dateTime.getTime())].sort((a, b) => a - b));
    expect(await prisma.appointmentAuditLog.count({ where: { appointmentId: { in: rows.map((r) => r.id) }, action: "CREATE" } })).toBe(5);

    const detail = await getSeries(new Request("http://x"), { params: Promise.resolve({ seriesId: body.series.id }) });
    expect((await detail.json()).series.appointments).toHaveLength(5);
  });

  it("applies booking RBAC: doctors book only themselves, other branches get 404", async () => {
    const rule = { ...base(), weekdays: [2], startTime: "10:00", count: 2 };
    as(f.doctor);
    expect((await createSeries(jsonRequest("http://x", "POST", { ...rule, doctorId: f.doctor2.id }))).status).toBe(403);
    expect((await createSeries(jsonRequest("http://x", "POST", rule))).status).toBe(201);
    as(f.outsider);
    expect((await createSeries(jsonRequest("http://x", "POST", rule))).status).toBe(404);
    expect((await preview(jsonRequest("http://x", "POST", { ...rule, branchId: f.otherBranch.id }))).status).toBe(404);
  });

  it("scope=following shifts this and later occurrences, refuses conflicts unless forced, and cancels", async () => {
    as(f.owner);
    const res = await createSeries(jsonRequest("http://x", "POST", { ...base(), weekdays: [1, 3, 5], startTime: "10:00", count: 6 }));
    const { created } = (await res.json()) as { created: { id: string; dateTime: string }[] };
    const third = created[2];

    const moved = await patchAppointment(
      jsonRequest("http://x?scope=following", "PATCH", { dateTime: new Date(new Date(third.dateTime).getTime() + 3_600_000).toISOString() }),
      apptCtx(third.id),
    );
    expect(moved.status).toBe(200);
    expect((await moved.json()).count).toBe(4);
    const after = await prisma.appointment.findMany({ where: { id: { in: created.map((c) => c.id) } }, orderBy: { seriesIndex: "asc" } });
    expect(after.map((a) => clinicParts(a.dateTime).hour)).toEqual([10, 10, 11, 11, 11, 11]);

    // Someone else takes 12:00 on the 5th occurrence's day → moving +1h again is refused as a whole.
    await prisma.appointment.create({
      data: {
        patientId: f.patient.id,
        branchId: f.branch.id,
        doctorId: f.doctor.id,
        dateTime: new Date(after[4].dateTime.getTime() + 3_600_000),
        duration: 30,
      },
    });
    const shift = { dateTime: new Date(after[2].dateTime.getTime() + 3_600_000).toISOString() };
    const refused = await patchAppointment(jsonRequest("http://x?scope=following", "PATCH", shift), apptCtx(third.id));
    expect(refused.status).toBe(409);
    const refusedBody = await refused.json();
    expect(refusedBody.occurrences).toHaveLength(1);
    expect(refusedBody.occurrences[0]).toMatchObject({ appointmentId: after[4].id, problems: ["conflict"] });
    expect(clinicParts((await prisma.appointment.findUniqueOrThrow({ where: { id: third.id } })).dateTime).hour).toBe(11);

    as(f.doctor);
    expect((await patchAppointment(jsonRequest("http://x?scope=following", "PATCH", { ...shift, force: true }), apptCtx(third.id))).status).toBe(409);
    as(f.owner);
    expect((await patchAppointment(jsonRequest("http://x?scope=following", "PATCH", { ...shift, force: true }), apptCtx(third.id))).status).toBe(200);

    const cancel = await patchAppointment(jsonRequest("http://x?scope=following", "PATCH", { status: "CANCELLED" }), apptCtx(created[4].id));
    expect((await cancel.json()).count).toBe(2);
    const final = await prisma.appointment.findMany({ where: { id: { in: created.map((c) => c.id) } }, orderBy: { seriesIndex: "asc" } });
    expect(final.map((a) => a.status)).toEqual(["SCHEDULED", "SCHEDULED", "SCHEDULED", "SCHEDULED", "CANCELLED", "CANCELLED"]);

    // Notes aren't a series-wide edit.
    expect((await patchAppointment(jsonRequest("http://x?scope=following", "PATCH", { notes: "x" }), apptCtx(third.id))).status).toBe(422);
  });

  it("a care plan sells a package and books the series in one call; completing a visit uses the package", async () => {
    as(f.owner);
    const tRes = await createTemplate(
      jsonRequest("http://x", "POST", { name: "12 Adjustments", sessions: 12, price: 1200, treatmentTypes: ["ADJUSTMENT"] }),
      { params: Promise.resolve({ branchId: f.branch.id }) },
    );
    const template = (await tRes.json()).template;

    as(f.owner);
    const res = await createCarePlan(
      jsonRequest("http://x", "POST", {
        title: "Lower back — 4 weeks",
        visitsPerWeek: 3,
        totalVisits: 12,
        startDate: monday,
        goals: "Pain < 3/10",
        packageTemplateId: template.id,
        series: { weekdays: [1, 3, 5], startTime: "09:30", duration: 30 },
      }),
      { params: Promise.resolve({ patientId: f.patient.id }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.package).toMatchObject({ name: "12 Adjustments", sessionsTotal: 12 });
    expect(body.series.created).toHaveLength(12);
    expect(body.carePlan).toMatchObject({ doctor: { id: f.doctor.id }, progress: { upcoming: 12, completed: 0, planned: 12 } });
    expect(body.carePlan.package.id).toBe(body.package.id);

    const first = await prisma.appointment.findFirstOrThrow({ where: { seriesId: body.series.series.id, seriesIndex: 1 } });
    expect(first.treatmentType).toBe("ADJUSTMENT");
    as(f.doctor);
    const done = await (await patchAppointment(jsonRequest("http://x", "PATCH", { status: "COMPLETED" }), apptCtx(first.id))).json();
    expect(done.redemption).toMatchObject({ patientPackageId: body.package.id, sessionsUsed: 1 });

    const list = await (await listCarePlans(new Request("http://x"), { params: Promise.resolve({ patientId: f.patient.id }) })).json();
    expect(list.carePlans[0].progress).toMatchObject({ completed: 1, upcoming: 11 });
    expect(list.carePlans[0].package.sessionsLeft).toBe(11);

    // Care plans are clinical: another doctor → 403, another branch → 404; doctors can't sell with a plan.
    as(f.doctor2);
    expect((await listCarePlans(new Request("http://x"), { params: Promise.resolve({ patientId: f.patient.id }) })).status).toBe(403);
    as(f.outsider);
    expect((await listCarePlans(new Request("http://x"), { params: Promise.resolve({ patientId: f.patient.id }) })).status).toBe(404);
    as(f.doctor);
    const docSell = await createCarePlan(
      jsonRequest("http://x", "POST", { title: "X", visitsPerWeek: 1, totalVisits: 1, startDate: monday, packageTemplateId: template.id }),
      { params: Promise.resolve({ patientId: f.patient.id }) },
    );
    expect(docSell.status).toBe(403);

    // Cancelling the plan with cancelRemaining cancels the future bookings.
    const cancelled = await patchCarePlan(
      jsonRequest("http://x", "PATCH", { status: "CANCELLED", cancelRemaining: true }),
      { params: Promise.resolve({ carePlanId: body.carePlan.id }) },
    );
    expect(cancelled.status).toBe(200);
    const cBody = await cancelled.json();
    expect(cBody.cancelledAppointments).toBe(11);
    expect(cBody.carePlan).toMatchObject({ status: "CANCELLED", progress: { completed: 1, cancelled: 11, upcoming: 0 } });
  });
});
