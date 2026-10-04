import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { clinicCalendar, clinicDateKey, clinicInstantFromInputs } from "@/lib/clinic-time";
import { resetRateLimits } from "@/lib/booking/rate-limit";

vi.mock("@/lib/booking/notify", () => ({ notifyOnlineBooking: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/auth-utils", () => ({ getCurrentUser: vi.fn(), getUserBranchRole: vi.fn() }));

import { notifyOnlineBooking } from "@/lib/booking/notify";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { GET as getConfig } from "../[slug]/route";
import { GET as getDays } from "../[slug]/days/route";
import { GET as getSlots } from "../[slug]/slots/route";
import { POST as postBook } from "../[slug]/book/route";
import { GET as getIcs } from "../[slug]/ics/route";
import { GET as getSettings, PUT as putSettings } from "@/app/api/branches/[branchId]/booking/route";

const PREFIX = "pub-book-";
const ALL_DAY = JSON.stringify(
  Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "08:00", close: "20:00" }])),
);

let ipCounter = 0;
const nextIp = () => `10.9.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

async function cleanup() {
  const appts = await prisma.appointment.findMany({
    where: { branch: { name: { startsWith: PREFIX } } },
    select: { id: true },
  });
  await prisma.appointmentAuditLog.deleteMany({ where: { appointmentId: { in: appts.map((a) => a.id) } } });
  await prisma.branch.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.patient.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

async function fixture(opts: { enabled?: boolean; doctorIds?: "picked" | "all" } = {}) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e5)}`;
  const mk = (tag: string, name: string) => prisma.user.create({ data: { email: `${PREFIX}${tag}-${stamp}@t`, name } });
  const [owner, docA, docB, admin, desk] = await Promise.all([
    mk("o", "Owner Person"),
    mk("a", "Dr. Alice Tan"),
    mk("b", "Bala Kumar"),
    mk("ad", "Admin Person"),
    mk("fd", "Desk Person"),
  ]);
  const slug = `${PREFIX}${stamp}`;
  const branch = await prisma.branch.create({
    data: {
      name: `${PREFIX}${stamp}`,
      phone: "03-2161 5500",
      address: "Suria KLCC",
      operatingHours: ALL_DAY,
      bookingEnabled: opts.enabled ?? true,
      bookingSlug: slug,
      bookingLeadMinutes: 0,
      bookingSlotMinutes: 30,
      bookingHorizonDays: 30,
      bookingDoctorIds: opts.doctorIds === "all" ? [] : [docA.id, docB.id],
    },
  });
  await prisma.branchMember.createMany({
    data: [
      { userId: owner.id, branchId: branch.id, role: "OWNER" },
      { userId: docA.id, branchId: branch.id, role: "DOCTOR" },
      { userId: docB.id, branchId: branch.id, role: "DOCTOR" },
      { userId: admin.id, branchId: branch.id, role: "ADMIN" },
      { userId: desk.id, branchId: branch.id, role: "FRONT_DESK" },
    ],
  });
  return { owner, docA, docB, admin, desk, branch, slug };
}

const target = () => clinicDateKey(clinicCalendar().addDays(3));
const at = (hm: string) => clinicInstantFromInputs(target(), hm).toISOString();
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const get = (path: string, ip = nextIp()) => new Request(`http://x${path}`, { headers: { "x-forwarded-for": ip } });

function book(slug: string, body: Record<string, unknown>, ip = nextIp()) {
  return postBook(
    new Request(`http://x/api/public/booking/${slug}/book`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({
        treatment: "ADJUSTMENT",
        name: "Siti Nurhaliza",
        phone: "012-345 6789",
        consentData: true,
        ...body,
      }),
    }),
    ctx(slug),
  );
}

describe("public booking API", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetRateLimits();
    await cleanup();
  });
  afterAll(cleanup);

  it("GET config returns branch, default treatments and the picked doctors only", async () => {
    const { slug, docA, docB } = await fixture();
    const res = await getConfig(get(`/api/public/booking/${slug}`), ctx(slug));
    expect(res.status).toBe(200);
    const { config } = await res.json();
    expect(config.branch).toEqual({ name: expect.stringContaining(PREFIX), address: "Suria KLCC", phone: "03-2161 5500", logo: null });
    expect(config.treatments.map((t: { value: string }) => t.value)).toEqual(["INITIAL_CONSULT", "ADJUSTMENT", "FOLLOW_UP"]);
    expect(config.treatments[0].durationMin).toBe(60);
    expect(config.doctors.map((d: { id: string }) => d.id).sort()).toEqual([docA.id, docB.id].sort());
    expect(config.doctors.find((d: { id: string }) => d.id === docB.id).name).toBe("Dr. Bala Kumar");
    expect(config.timeZoneLabel).toBe("Malaysia time (GMT+8)");
    expect(JSON.stringify(config)).not.toContain("@t"); // no staff emails
  });

  it("with no doctors picked, every clinician (OWNER + DOCTOR) is bookable, never ADMIN / FRONT_DESK", async () => {
    const { slug, owner, docA, docB } = await fixture({ doctorIds: "all" });
    const { config } = await (await getConfig(get(`/api/public/booking/${slug}`), ctx(slug))).json();
    expect(config.doctors.map((d: { id: string }) => d.id).sort()).toEqual([owner.id, docA.id, docB.id].sort());
  });

  it("a disabled branch or unknown slug is 404 on every endpoint", async () => {
    const { slug } = await fixture({ enabled: false });
    expect((await getConfig(get(`/api/public/booking/${slug}`), ctx(slug))).status).toBe(404);
    expect((await getDays(get(`/api/public/booking/${slug}/days?treatment=ADJUSTMENT&month=2026-10`), ctx(slug))).status).toBe(404);
    expect((await getSlots(get(`/api/public/booking/${slug}/slots?treatment=ADJUSTMENT&date=${target()}`), ctx(slug))).status).toBe(404);
    expect((await book(slug, { doctorId: "any", dateTime: at("10:00") })).status).toBe(404);
    expect((await getConfig(get(`/api/public/booking/nope-nope`), ctx("nope-nope"))).status).toBe(404);
  });

  // G6 / D5: a lapsed clinic is read-only, so its booking page is closed.
  it("a branch whose billing account has lapsed takes no bookings", async () => {
    const { slug, branch, owner } = await fixture();
    await prisma.user.update({ where: { id: owner.id }, data: { trialEndsAt: new Date(Date.now() - 86_400_000) } });
    await prisma.branch.update({ where: { id: branch.id }, data: { billingUserId: owner.id } });
    expect((await getConfig(get(`/api/public/booking/${slug}`), ctx(slug))).status).toBe(404);
    expect((await book(slug, { doctorId: "any", dateTime: at("10:00") })).status).toBe(404);
    await prisma.user.update({ where: { id: owner.id }, data: { subscriptionStatus: "active" } });
    expect((await getConfig(get(`/api/public/booking/${slug}`), ctx(slug))).status).toBe(200);
  });

  it("GET slots steps through the day and skips existing appointments", async () => {
    const { slug, docA, branch } = await fixture();
    const q = `treatment=ADJUSTMENT&doctorId=${docA.id}&date=${target()}`;
    const first = await (await getSlots(get(`/api/public/booking/${slug}/slots?${q}`), ctx(slug))).json();
    expect(first.slots).toHaveLength(24); // 08:00–19:30, 30-min step, 30-min treatment
    expect(first.slots[0]).toEqual({ start: at("08:00"), label: "8:00 AM" });
    expect(first.durationMin).toBe(30);

    const patient = await prisma.patient.create({
      data: { firstName: "P", lastName: "X", branchId: branch.id, doctorId: docA.id },
    });
    await prisma.appointment.create({
      data: { patientId: patient.id, doctorId: docA.id, branchId: branch.id, dateTime: new Date(at("10:00")), duration: 30 },
    });
    const second = await (await getSlots(get(`/api/public/booking/${slug}/slots?${q}`), ctx(slug))).json();
    expect(second.slots).toHaveLength(23);
    expect(second.slots.map((s: { label: string }) => s.label)).not.toContain("10:00 AM");
  });

  it("GET days drops a doctor's day off, but 'any' still has it", async () => {
    const { slug, docA } = await fixture();
    const day = target();
    await prisma.doctorTimeOff.create({
      data: {
        userId: docA.id,
        type: "ANNUAL_LEAVE",
        startDate: clinicInstantFromInputs(day, "00:00"),
        endDate: clinicInstantFromInputs(day, "23:59"),
      },
    });
    const month = day.slice(0, 7);
    const one = await (await getDays(get(`/api/public/booking/${slug}/days?treatment=ADJUSTMENT&doctorId=${docA.id}&month=${month}`), ctx(slug))).json();
    const any = await (await getDays(get(`/api/public/booking/${slug}/days?treatment=ADJUSTMENT&doctorId=any&month=${month}`), ctx(slug))).json();
    expect(one.days).not.toContain(day);
    expect(any.days).toContain(day);
  });

  it("rejects a treatment the branch doesn't offer, and a non-bookable doctor", async () => {
    const { slug, owner } = await fixture();
    const bad = await getSlots(get(`/api/public/booking/${slug}/slots?treatment=X_RAY&date=${target()}`), ctx(slug));
    expect(bad.status).toBe(422);
    expect((await book(slug, { treatment: "X_RAY", doctorId: "any", dateTime: at("10:00") })).status).toBe(422);
    const res = await book(slug, { doctorId: owner.id, dateTime: at("10:00") });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("doctor_not_bookable");
  });

  it("POST book creates a new patient and an ONLINE appointment, audit row and notifications", async () => {
    const { slug, docA, branch } = await fixture();
    const res = await book(slug, {
      doctorId: docA.id,
      dateTime: at("10:00"),
      email: `${PREFIX}siti-${Date.now()}@example.com`,
      notes: "Lower back pain",
      consentMarketing: true,
    });
    expect(res.status).toBe(201);
    const { booking } = await res.json();
    expect(booking).toMatchObject({ dateTime: at("10:00"), timeLabel: "10:00 AM", treatment: "Adjustment", duration: 30, doctorName: "Dr. Alice Tan", firstName: "Siti" });
    expect(booking.icsUrl).toMatch(new RegExp(`^/api/public/booking/${slug}/ics\\?appointment=`));
    expect(booking.whatsappUrl).toBe("https://wa.me/60321615500");
    expect(JSON.stringify(booking)).not.toMatch(/patientId|"id"/);

    const patients = await prisma.patient.findMany({ where: { branchId: branch.id } });
    expect(patients).toHaveLength(1);
    expect(patients[0]).toMatchObject({ firstName: "Siti", lastName: "Nurhaliza", phone: "012-345 6789", status: "active", marketingConsent: true, doctorId: docA.id, reminderChannel: "WHATSAPP" });
    const appts = await prisma.appointment.findMany({ where: { branchId: branch.id } });
    expect(appts).toHaveLength(1);
    expect(appts[0]).toMatchObject({ source: "ONLINE", status: "SCHEDULED", treatmentType: "ADJUSTMENT", duration: 30, doctorId: docA.id, notes: "Lower back pain" });
    const audit = await prisma.appointmentAuditLog.findMany({ where: { appointmentId: appts[0].id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "CREATE", actorId: null, actorName: "Online booking" });
    expect(audit[0].changes).toMatchObject({ source: { to: "ONLINE" }, consentData: { to: true }, consentMarketing: { to: true } });
    expect(notifyOnlineBooking).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: appts[0].id, isNewPatient: true }));

    // .ics download needs the signed token
    const ics = await getIcs(get(booking.icsUrl), ctx(slug));
    expect(ics.status).toBe(200);
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    const text = await ics.text();
    expect(text).toContain(`DTSTART:${at("10:00").replace(/[-:]/g, "").replace(".000", "")}`);
    expect(text).toContain("SUMMARY:Adjustment at");
    const forged = booking.icsUrl.replace(/token=.*/, "token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    expect((await getIcs(get(forged), ctx(slug))).status).toBe(404);
    const otherId = booking.icsUrl.replace(/appointment=[^&]+/, "appointment=someone-else");
    expect((await getIcs(get(otherId), ctx(slug))).status).toBe(404);
  });

  it("a second booking with the same phone (any format) and name reuses the patient but never changes their email or IC", async () => {
    const { slug, docA, docB, branch } = await fixture();
    expect((await book(slug, { doctorId: docA.id, dateTime: at("10:00") })).status).toBe(201);
    const email = `${PREFIX}later-${Date.now()}@example.com`;
    const ic = `IC${Date.now()}`;
    const res = await book(slug, { doctorId: docB.id, dateTime: at("11:00"), phone: "+60 12-345 6789", name: "siti  NURHALIZA", email, icNumber: ic });
    expect(res.status).toBe(201);
    const patients = await prisma.patient.findMany({ where: { branchId: branch.id } });
    expect(patients).toHaveLength(1);
    expect(patients[0].email).toBeNull();
    expect(patients[0].icNumber).toBeNull();
    expect(patients[0].doctorId).toBe(docA.id); // not reassigned
    const appts = await prisma.appointment.findMany({ where: { patientId: patients[0].id, source: "ONLINE" }, orderBy: { dateTime: "asc" } });
    expect(appts).toHaveLength(2);
    expect(appts[1].notes).toContain(`Email given: ${email}`);
    expect(appts[1].notes).toContain(`IC given: ${ic}`);
    expect(notifyOnlineBooking).toHaveBeenLastCalledWith(expect.objectContaining({ isNewPatient: false }));
  });

  it("a known phone with a different name books a new patient — the existing patient's email is untouched", async () => {
    const { slug, docA, branch } = await fixture();
    const ownEmail = `${PREFIX}owner-${Date.now()}@example.com`;
    const victim = await prisma.patient.create({ data: { firstName: "Real", lastName: "Patient", phone: "012-345 6789", email: ownEmail, branchId: branch.id, doctorId: docA.id } });
    const attacker = `${PREFIX}attacker-${Date.now()}@example.com`;
    const res = await book(slug, { doctorId: docA.id, dateTime: at("10:00"), name: "Someone Else", email: attacker });
    expect(res.status).toBe(201);
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: victim.id } })).email).toBe(ownEmail);
    const created = await prisma.patient.findFirstOrThrow({ where: { branchId: branch.id, NOT: { id: victim.id } } });
    expect(created).toMatchObject({ firstName: "Someone", lastName: "Else", email: attacker });
    expect(await prisma.appointment.count({ where: { patientId: victim.id } })).toBe(0);
    expect(notifyOnlineBooking).toHaveBeenLastCalledWith(expect.objectContaining({ isNewPatient: true }));
  });

  // N10: same address in another case is the same email.
  it("an existing email typed in another case isn't stored on a second patient", async () => {
    const { slug, docA, branch } = await fixture();
    const email = `${PREFIX}Case-${Date.now()}@Example.com`;
    const first = await prisma.patient.create({ data: { firstName: "First", lastName: "One", phone: "013-111 2222", email, branchId: branch.id, doctorId: docA.id } });
    const res = await book(slug, { doctorId: docA.id, dateTime: at("11:00"), name: "Other Person", phone: "019-888 7777", email: email.toLowerCase() });
    expect(res.status).toBe(201);
    const created = await prisma.patient.findFirstOrThrow({ where: { branchId: branch.id, NOT: { id: first.id } } });
    expect(created.email).toBeNull();
  });

  it("an email already on another patient isn't stored — it goes in the appointment notes", async () => {
    const { slug, docA, branch } = await fixture();
    const email = `${PREFIX}taken-${Date.now()}@example.com`;
    await prisma.patient.create({ data: { firstName: "Other", lastName: "Person", email, branchId: branch.id, doctorId: docA.id } });
    const res = await book(slug, { doctorId: docA.id, dateTime: at("10:00"), phone: "019-888 7777", email });
    expect(res.status).toBe(201);
    const created = await prisma.patient.findFirst({ where: { branchId: branch.id, phone: "019-888 7777" } });
    expect(created?.email).toBeNull();
    const appt = await prisma.appointment.findFirst({ where: { patientId: created!.id } });
    expect(appt?.notes).toContain(`Email given: ${email}`);
  });

  it("the same slot can't be booked twice — also under a race", async () => {
    const { slug, docA, branch } = await fixture();
    expect((await book(slug, { doctorId: docA.id, dateTime: at("10:00") })).status).toBe(201);
    const again = await book(slug, { doctorId: docA.id, dateTime: at("10:00"), phone: "013-111 2222" });
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe("slot_taken");

    const [r1, r2] = await Promise.all([
      book(slug, { doctorId: docA.id, dateTime: at("14:00"), phone: "013-333 4444" }),
      book(slug, { doctorId: docA.id, dateTime: at("14:00"), phone: "013-555 6666" }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect(await prisma.appointment.count({ where: { branchId: branch.id, dateTime: new Date(at("14:00")) } })).toBe(1);
  });

  it("a time that isn't on the slot grid is rejected as taken", async () => {
    const { slug, docA } = await fixture();
    expect((await book(slug, { doctorId: docA.id, dateTime: at("10:10") })).status).toBe(409);
    expect((await book(slug, { doctorId: docA.id, dateTime: at("21:00") })).status).toBe(409);
  });

  it("'any doctor' books the least-booked free doctor", async () => {
    const { slug, docA, docB, branch } = await fixture();
    const patient = await prisma.patient.create({ data: { firstName: "P", lastName: "X", branchId: branch.id, doctorId: docA.id } });
    // Dr. Alice sorts first (and would win a tie) but already has a booking that day.
    await prisma.appointment.create({
      data: { patientId: patient.id, doctorId: docA.id, branchId: branch.id, dateTime: new Date(at("16:00")), duration: 30 },
    });
    const res = await book(slug, { doctorId: "any", dateTime: at("09:00") });
    expect(res.status).toBe(201);
    const appt = await prisma.appointment.findFirst({ where: { branchId: branch.id, source: "ONLINE" } });
    expect(appt?.doctorId).toBe(docB.id);
  });

  it("the honeypot rejects the request and creates nothing", async () => {
    const { slug, docA, branch } = await fixture();
    const res = await book(slug, { doctorId: docA.id, dateTime: at("10:00"), website: "http://spam.example" });
    expect(res.status).toBe(422);
    expect(await prisma.patient.count({ where: { branchId: branch.id } })).toBe(0);
    expect(await prisma.appointment.count({ where: { branchId: branch.id } })).toBe(0);
  });

  it("validation: consent is required", async () => {
    const { slug, docA } = await fixture();
    const res = await book(slug, { doctorId: docA.id, dateTime: at("10:00"), consentData: false });
    expect(res.status).toBe(422);
  });

  it("at most 2 online bookings per phone per day", async () => {
    const { slug, docA } = await fixture();
    expect((await book(slug, { doctorId: docA.id, dateTime: at("09:00") })).status).toBe(201);
    expect((await book(slug, { doctorId: docA.id, dateTime: at("10:00"), phone: "0123456789" })).status).toBe(201);
    const third = await book(slug, { doctorId: docA.id, dateTime: at("11:00"), phone: "+6012 345 6789" });
    expect(third.status).toBe(429);
    expect((await third.json()).error).toBe("daily_limit");
  });

  it("per-IP rate limit on booking", async () => {
    const { slug } = await fixture();
    const ip = "10.200.0.1";
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await book(slug, { doctorId: "any", dateTime: "bad" }, ip)).status);
    expect(statuses.slice(0, 5).every((s) => s === 422)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});

describe("branch booking settings API", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });
  afterAll(cleanup);

  const sctx = (branchId: string) => ({ params: Promise.resolve({ branchId }) });
  const put = (branchId: string, body: Record<string, unknown>) =>
    putSettings(
      new Request("http://x", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          slug: "x-slug",
          leadMinutes: 120,
          horizonDays: 30,
          slotMinutes: 15,
          treatments: ["ADJUSTMENT"],
          doctorIds: [],
          note: "",
          ...body,
        }),
      }),
      sctx(branchId),
    );

  it("OWNER and ADMIN can read; DOCTOR and FRONT_DESK can't", async () => {
    const { branch, owner } = await fixture({ enabled: false });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    for (const [role, status] of [["OWNER", 200], ["ADMIN", 200], ["DOCTOR", 403], ["FRONT_DESK", 403], [null, 404]] as const) {
      vi.mocked(getUserBranchRole).mockResolvedValue(role as never);
      expect((await getSettings(new Request("http://x"), sctx(branch.id))).status).toBe(status);
    }
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const body = await (await getSettings(new Request("http://x"), sctx(branch.id))).json();
    expect(body.suggestedSlug).toBe(branch.name);
    expect(body.clinicians).toHaveLength(3); // owner + 2 doctors
    expect(body.hasHours).toBe(true);
  });

  it("PUT saves settings; slugs are validated and unique", async () => {
    const a = await fixture();
    const b = await fixture({ enabled: false });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: b.owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("ADMIN");

    const taken = await put(b.branch.id, { slug: a.slug });
    expect(taken.status).toBe(409);
    expect((await taken.json()).error).toBe("slug_taken");
    expect((await put(b.branch.id, { slug: "Bad Slug" })).status).toBe(422);
    expect((await put(b.branch.id, { slug: "ab" })).status).toBe(422);
    expect((await put(b.branch.id, { slug: "" })).status).toBe(422); // enabled needs a slug
    expect((await put(b.branch.id, { doctorIds: [b.admin.id] })).status).toBe(422); // not a clinician
    expect((await put(b.branch.id, { treatments: [] })).status).toBe(422);

    const newSlug = `${PREFIX}new-${Date.now()}`;
    const ok = await put(b.branch.id, { slug: newSlug, doctorIds: [b.docA.id], note: "Bring your X-rays", treatments: ["INITIAL_CONSULT", "ADJUSTMENT"] });
    expect(ok.status).toBe(200);
    const saved = await prisma.branch.findUnique({ where: { id: b.branch.id } });
    expect(saved).toMatchObject({
      bookingEnabled: true,
      bookingSlug: newSlug,
      bookingDoctorIds: [b.docA.id],
      bookingNote: "Bring your X-rays",
      bookingTreatments: ["INITIAL_CONSULT", "ADJUSTMENT"],
    });
    // Saving the same slug again on the same branch is fine.
    expect((await put(b.branch.id, { slug: newSlug })).status).toBe(200);

    vi.mocked(getUserBranchRole).mockResolvedValue("DOCTOR");
    expect((await put(b.branch.id, { slug: newSlug })).status).toBe(403);
  });
});
