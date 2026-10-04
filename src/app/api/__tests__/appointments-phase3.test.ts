import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { clinicDateKey, clinicInstantFromInputs, clinicCalendar } from "@/lib/clinic-time";

// Bug-fix plan, Phase 3 (appointments, calendar and reminders).

vi.mock("@/lib/auth-utils", () => ({ getCurrentUser: vi.fn(), getUserBranchRole: vi.fn() }));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

const P = `test-appt3-${Date.now()}`;
let owner: string, doc: string, branchId: string, patientId: string;

/** Signed in as `id`; their role is read from the database like the real helper. */
const as = (id: string) => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id, email: `${id}@t`, name: id } as never);
  vi.mocked(getUserBranchRole).mockImplementation(async (userId: string, b: string) =>
    (await prisma.branchMember.findUnique({ where: { userId_branchId: { userId, branchId: b } } }))?.role ?? null,
  );
};
const json = (method: string, body: unknown) => new Request("http://x", { method, body: JSON.stringify(body) });
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
/** A clinic time `days` from today. */
const at = (days: number, hm: string) => clinicInstantFromInputs(clinicDateKey(clinicCalendar().addDays(days)), hm);

async function appt(data: { dateTime: Date; status?: "SCHEDULED" | "CANCELLED" | "IN_PROGRESS"; duration?: number; doctorId?: string }) {
  return prisma.appointment.create({
    data: { patientId, branchId, doctorId: data.doctorId ?? doc, dateTime: data.dateTime, duration: data.duration ?? 30, status: data.status ?? "SCHEDULED" },
  });
}

beforeAll(async () => {
  owner = (await prisma.user.create({ data: { email: `${P}-o@t.com`, name: "Owner" } })).id;
  doc = (await prisma.user.create({ data: { email: `${P}-d@t.com`, name: "Doc" } })).id;
  branchId = (await prisma.branch.create({ data: { name: `${P} Branch`, billingUserId: owner } })).id;
  await prisma.branchMember.createMany({
    data: [
      { userId: owner, branchId, role: "OWNER" },
      { userId: doc, branchId, role: "DOCTOR" },
    ],
  });
  patientId = (await prisma.patient.create({ data: { firstName: "Ali", lastName: P, branchId, doctorId: doc } })).id;
}, 30_000);

afterAll(async () => {
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
});

describe("A1 — rescheduling resets reminders that already went out", () => {
  it("drops sent rows on a date change so the new time gets its own reminders", async () => {
    as(owner);
    const a = await appt({ dateTime: at(2, "10:00") });
    await prisma.appointmentReminder.create({
      data: { appointmentId: a.id, channel: "EMAIL", offsetMin: 1440, scheduledFor: at(1, "10:00"), status: "SENT", sentAt: new Date() },
    });
    const { PATCH } = await import("../appointments/[appointmentId]/route");
    expect((await PATCH(json("PATCH", { dateTime: at(5, "10:00").toISOString(), forceOutsideHours: true }), params({ appointmentId: a.id }))).status).toBe(200);
    expect(await prisma.appointmentReminder.count({ where: { appointmentId: a.id } })).toBe(0);
  });
});

describe("A2 / A3 — queued reminders are re-checked when they're due", () => {
  it("skips started visits, switched-off branches, dropped offsets and opted-out patients", async () => {
    const { reasonToSkip } = await import("@/lib/reminders/dispatcher");
    const now = new Date("2026-10-10T02:00:00Z");
    const base = {
      channel: "WHATSAPP",
      offsetMin: 1440,
      isFallback: false,
      appointment: {
        status: "SCHEDULED",
        dateTime: new Date("2026-10-11T02:00:00Z"),
        patient: { reminderChannel: "WHATSAPP" as const, phone: "0123", email: null },
      },
    };
    const settings = { enabled: true, offsetsMin: [1440, 120] };
    expect(reasonToSkip(base, settings, now)).toBeNull();
    expect(reasonToSkip({ ...base, appointment: { ...base.appointment, dateTime: new Date("2026-10-10T01:00:00Z") } }, settings, now)).toMatch(/started/);
    expect(reasonToSkip(base, { ...settings, enabled: false }, now)).toMatch(/turned off/);
    expect(reasonToSkip(base, { ...settings, offsetsMin: [120] }, now)).toMatch(/no longer used/);
    expect(reasonToSkip({ ...base, appointment: { ...base.appointment, patient: { ...base.appointment.patient, reminderChannel: "NONE" } } }, settings, now)).toMatch(/opted out/);
    expect(reasonToSkip({ ...base, appointment: { ...base.appointment, patient: { reminderChannel: "EMAIL", phone: "0123", email: "a@b.c" } } }, settings, now)).toMatch(/channel/);
    // A fallback row only needs the patient to still want reminders.
    expect(reasonToSkip({ ...base, isFallback: true, channel: "EMAIL" }, settings, now)).toBeNull();
  });
});

describe("A4 — double-booking", () => {
  it("a started visit blocks the slot; an over-long visit is refused; reactivating needs a free slot", async () => {
    as(owner);
    const { findConflictingAppointments } = await import("@/lib/appointments");
    const started = await appt({ dateTime: at(3, "09:00"), status: "IN_PROGRESS" });
    const clash = await findConflictingAppointments({ doctorId: doc, start: at(3, "09:15"), end: at(3, "09:45") });
    expect(clash.map((c) => c.id)).toContain(started.id);

    const { PATCH } = await import("../appointments/[appointmentId]/route");
    const a = await appt({ dateTime: at(3, "14:00") });
    expect((await PATCH(json("PATCH", { duration: 600 }), params({ appointmentId: a.id }))).status).toBe(422);

    const cancelled = await appt({ dateTime: at(3, "16:00"), status: "CANCELLED" });
    await appt({ dateTime: at(3, "16:00") });
    const res = await PATCH(json("PATCH", { status: "SCHEDULED" }), params({ appointmentId: cancelled.id }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("conflict");
  });
});

describe("A5 / A10 — leave and breaks", () => {
  it("booking over leave needs confirming; a doctor may book over their own break", async () => {
    await prisma.doctorTimeOff.create({
      data: { userId: doc, branchId: null, type: "ANNUAL_LEAVE", startDate: at(10, "00:00"), endDate: at(12, "00:00") },
    });
    const { POST } = await import("../appointments/route");
    as(owner);
    const body = { patientId, doctorId: doc, dateTime: at(11, "10:00").toISOString(), forceOutsideHours: true };
    const res = await POST(json("POST", body));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "time_off_confirm_required", leave: "annual leave" });
    expect((await POST(json("POST", { ...body, forceOnLeave: true }))).status).toBe(201);

    // Reschedule into leave is gated too
    const { PATCH } = await import("../appointments/[appointmentId]/route");
    const a = await appt({ dateTime: at(4, "11:00") });
    const moved = await PATCH(json("PATCH", { dateTime: at(11, "15:00").toISOString(), forceOutsideHours: true }), params({ appointmentId: a.id }));
    expect(moved.status).toBe(409);
    expect((await moved.json()).error).toBe("time_off_confirm_required");

    // A10: the doctor's own break
    const day = at(6, "13:00");
    const weekday = new Date(day.getTime() + 8 * 3600_000).getUTCDay();
    await prisma.doctorBreakTime.create({ data: { userId: doc, branchId, dayOfWeek: weekday, startMinute: 780, endMinute: 840, label: "Lunch" } });
    as(doc);
    const own = { patientId, doctorId: doc, dateTime: day.toISOString(), forceOutsideHours: true };
    expect((await POST(json("POST", own))).status).toBe(409);
    expect((await POST(json("POST", { ...own, forceBookOnBreak: true }))).status).toBe(201);
  });
});

describe("A7 — override and double-book", () => {
  it("managers can force a conflicting move; doctors can't", async () => {
    const { PATCH } = await import("../appointments/[appointmentId]/route");
    await appt({ dateTime: at(7, "10:00") });
    const mover = await appt({ dateTime: at(7, "11:00") });
    const body = { dateTime: at(7, "10:00").toISOString(), forceOutsideHours: true, forceConflict: true };
    as(doc);
    expect((await PATCH(json("PATCH", body), params({ appointmentId: mover.id }))).status).toBe(409);
    as(owner);
    expect((await PATCH(json("PATCH", body), params({ appointmentId: mover.id }))).status).toBe(200);
  });
});

describe("A8 — one definition of the day's appointments", () => {
  it("Today tab, its badge and stat cards leave out cancelled and no-show; completion ignores future bookings", async () => {
    const { appointmentMatchesTab, deriveStats } = await import("@/lib/appointment-tabs");
    const now = new Date("2026-10-10T04:00:00Z"); // 12:00 MYT
    const day = new Date("2026-10-10T02:00:00Z");
    const mk = (status: string, iso: string) => ({ status, dateTime: iso, duration: 30 }) as never;
    const rows = [
      mk("COMPLETED", "2026-10-10T01:00:00Z"),
      mk("SCHEDULED", "2026-10-10T06:00:00Z"),
      mk("CANCELLED", "2026-10-10T07:00:00Z"),
      mk("NO_SHOW", "2026-10-10T00:30:00Z"),
      mk("SCHEDULED", "2026-11-20T02:00:00Z"),
    ];
    expect(rows.filter((r) => appointmentMatchesTab(r, "today", now, day)).length).toBe(2);
    const stats = deriveStats(rows, [], now, day);
    expect(stats.todayCount).toBe(2);
    expect(stats.completionCount).toBe(1);
    expect(stats.totalForCompletionRate).toBe(2); // completed + no-show; not next month's booking

    // The counts API uses the same rule, on the day picked in the list
    as(owner);
    const key = clinicDateKey(clinicCalendar().addDays(20));
    await appt({ dateTime: clinicInstantFromInputs(key, "09:00") });
    await appt({ dateTime: clinicInstantFromInputs(key, "10:00"), status: "CANCELLED" });
    const { GET } = await import("../appointments/counts/route");
    const { counts } = await (await GET(new Request(`http://x/api/appointments/counts?branchId=${branchId}&day=${key}`))).json();
    expect(counts.today).toBe(1);
  });
});
