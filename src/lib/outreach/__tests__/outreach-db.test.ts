import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import type { BranchRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/whatsapp/crypto";
import { RECALL_TEMPLATE_NAME, REVIEW_TEMPLATE_NAME } from "@/lib/whatsapp/template-text";

const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({ sendReminderEmail: (a: unknown) => sendEmailMock(a) }));
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

import { dispatchOutreach, materializeOutreach } from "../dispatcher";
import { applyWebhookEvent } from "@/lib/whatsapp/webhook";
import { GET as getPatientOutreach, POST as postPatientOutreach } from "@/app/api/patients/[patientId]/outreach/route";

const PREFIX = `test-outreach-${Date.now()}`;
const DAY = 86_400_000;
const HOUR = 3_600_000;

let branchId: string;
let doctorId: string;
const users: Record<string, string> = {};
let seq = 0;

async function patient(opts: {
  consent?: boolean;
  phone?: string | null;
  email?: string | null;
  lastVisitDaysAgo?: number;
  lang?: string;
  status?: string;
}) {
  seq++;
  const p = await prisma.patient.create({
    data: {
      firstName: `P${seq}`,
      lastName: PREFIX,
      branchId,
      doctorId,
      phone: opts.phone === undefined ? `01234${String(seq).padStart(5, "0")}` : opts.phone,
      email: opts.email === undefined ? null : opts.email,
      marketingConsent: opts.consent ?? true,
      preferredLanguage: opts.lang ?? "en",
      status: opts.status ?? "active",
    },
  });
  if (opts.lastVisitDaysAgo !== undefined) {
    await prisma.visit.create({
      data: { patientId: p.id, doctorId, visitDate: new Date(Date.now() - opts.lastVisitDaysAgo * DAY) },
    });
  }
  return p;
}

async function setSettings(data: Record<string, unknown>) {
  await prisma.branchReminderSettings.upsert({
    where: { branchId },
    create: { branchId, enabled: false, offsetsMin: [], templates: {}, ...data },
    update: data,
  });
}

async function wipeOutreach() {
  await prisma.patientOutreach.deleteMany({ where: { branchId } });
  await prisma.appointment.deleteMany({ where: { branchId } });
  await prisma.visit.deleteMany({ where: { patient: { branchId } } });
  await prisma.patient.deleteMany({ where: { branchId } });
  await prisma.whatsAppAccount.deleteMany({ where: { branchId } });
}

beforeAll(async () => {
  process.env.WHATSAPP_TOKEN_KEY = "d".repeat(64);
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test";
  const branch = await prisma.branch.create({ data: { name: `${PREFIX}-branch`, phone: "03-2181 1234" } });
  branchId = branch.id;
  for (const role of ["OWNER", "ADMIN", "DOCTOR", "FRONT_DESK"] as BranchRole[]) {
    const u = await prisma.user.create({ data: { email: `${PREFIX}-${role.toLowerCase()}@t.test`, name: role } });
    users[role] = u.id;
    await prisma.branchMember.create({ data: { userId: u.id, branchId, role } });
  }
  doctorId = users.DOCTOR;
});

afterAll(async () => {
  await wipeOutreach();
  await prisma.branchReminderSettings.deleteMany({ where: { branchId } });
  await prisma.branchMember.deleteMany({ where: { branchId } });
  await prisma.branch.delete({ where: { id: branchId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});

beforeEach(async () => {
  await wipeOutreach();
  sendEmailMock.mockReset();
  mockAuth.mockReset();
});

describe("materializeOutreach — recall", () => {
  beforeEach(() =>
    setSettings({ recallEnabled: true, recallAfterDays: 42, recallCooldownDays: 90, recallDailyLimit: 30, reviewEnabled: false }),
  );

  it("queues one recall for a lapsed consenting patient only, and not again within the cooldown", async () => {
    const lapsed = await patient({ lastVisitDaysAgo: 60 });
    await patient({ consent: false, lastVisitDaysAgo: 60 });
    await patient({ lastVisitDaysAgo: 10 });
    await patient({ lastVisitDaysAgo: 60, status: "inactive" });
    await patient({ lastVisitDaysAgo: 60, phone: null, email: null });
    await patient({}); // never visited
    const booked = await patient({ lastVisitDaysAgo: 60 });
    await prisma.appointment.create({
      data: { patientId: booked.id, branchId, doctorId, dateTime: new Date(Date.now() + 3 * DAY) },
    });
    const recalled = await patient({ lastVisitDaysAgo: 120 });
    await prisma.patientOutreach.create({
      data: {
        patientId: recalled.id,
        branchId,
        type: "RECALL",
        channel: "WHATSAPP",
        status: "SENT",
        scheduledFor: new Date(Date.now() - 30 * DAY),
        createdAt: new Date(Date.now() - 30 * DAY),
      },
    });

    const first = await materializeOutreach(new Date());
    expect(first.recalls).toBe(1);
    const rows = await prisma.patientOutreach.findMany({ where: { branchId, type: "RECALL", status: "PENDING" } });
    expect(rows.map((r) => r.patientId)).toEqual([lapsed.id]);
    expect(rows[0].channel).toBe("WHATSAPP");

    const second = await materializeOutreach(new Date());
    expect(second.recalls).toBe(0);
  });

  it("uses the last completed appointment too, not only visits", async () => {
    const p = await patient({ lastVisitDaysAgo: 60 });
    await prisma.appointment.create({
      data: { patientId: p.id, branchId, doctorId, status: "COMPLETED", dateTime: new Date(Date.now() - 5 * DAY) },
    });
    expect((await materializeOutreach(new Date())).recalls).toBe(0);
  });

  it("stops at the daily limit", async () => {
    await setSettings({ recallDailyLimit: 2 });
    for (let i = 0; i < 4; i++) await patient({ lastVisitDaysAgo: 50 + i });
    expect((await materializeOutreach(new Date())).recalls).toBe(2);
    expect((await materializeOutreach(new Date())).recalls).toBe(0);
  });
});

describe("materializeOutreach — review", () => {
  beforeEach(() =>
    setSettings({
      recallEnabled: false,
      reviewEnabled: true,
      reviewDelayHours: 3,
      reviewCooldownDays: 180,
      googleReviewUrl: "https://g.page/r/test/review",
    }),
  );

  async function completed(patientId: string, hoursAgo: number) {
    return prisma.appointment.create({
      data: {
        patientId,
        branchId,
        doctorId,
        status: "COMPLETED",
        duration: 30,
        dateTime: new Date(Date.now() - hoursAgo * HOUR - 30 * 60_000),
      },
    });
  }

  it("queues one review per completed appointment for consenting patients", async () => {
    const yes = await patient({});
    const no = await patient({ consent: false });
    const soon = await patient({});
    const old = await patient({});
    const appt = await completed(yes.id, 5);
    await completed(no.id, 5);
    await completed(soon.id, 1);
    await completed(old.id, 24 * 4);

    expect((await materializeOutreach(new Date())).reviews).toBe(1);
    const rows = await prisma.patientOutreach.findMany({ where: { branchId, type: "REVIEW" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ patientId: yes.id, appointmentId: appt.id });

    expect((await materializeOutreach(new Date())).reviews).toBe(0);
  });

  it("respects the per-patient cooldown and needs a review link", async () => {
    const p = await patient({});
    await completed(p.id, 5);
    await setSettings({ googleReviewUrl: null });
    expect((await materializeOutreach(new Date())).reviews).toBe(0);

    await setSettings({ googleReviewUrl: "https://g.page/r/test/review" });
    await prisma.patientOutreach.create({
      data: { patientId: p.id, branchId, type: "REVIEW", channel: "WHATSAPP", status: "SENT", scheduledFor: new Date() },
    });
    expect((await materializeOutreach(new Date())).reviews).toBe(0);
  });
});

describe("dispatchOutreach", () => {
  const fetchMock = vi.fn();
  beforeEach(async () => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    await setSettings({ googleReviewUrl: "https://g.page/r/test/review", recallEnabled: true, reviewEnabled: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  async function connect(recallStatus: Record<string, string>) {
    await prisma.whatsAppAccount.create({
      data: {
        branchId,
        wabaId: `${PREFIX}-waba`,
        phoneNumberId: `${PREFIX}-pn`,
        connectionType: "MANUAL",
        accessTokenEnc: encryptSecret("tok"),
        templateName: "smartchiro_appt_reminder_v1",
        templateStatus: { en: "APPROVED", templates: { [RECALL_TEMPLATE_NAME]: recallStatus, [REVIEW_TEMPLATE_NAME]: recallStatus } },
      },
    });
  }

  async function queue(patientId: string, type: "RECALL" | "REVIEW" = "RECALL") {
    return prisma.patientOutreach.create({
      data: { patientId, branchId, type, channel: "WHATSAPP", scheduledFor: new Date(Date.now() - 60_000) },
    });
  }

  it("sends the recall template on WhatsApp in the patient's language", async () => {
    await connect({ en: "APPROVED", zh: "APPROVED" });
    const p = await patient({ lang: "zh", phone: "012-345 6789" });
    const row = await queue(p.id);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.R1" }] }), { status: 200 }));

    await dispatchOutreach(new Date());

    const after = await prisma.patientOutreach.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({ status: "SENT", channel: "WHATSAPP", externalId: "wamid.R1" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe("60123456789");
    expect(body.template.name).toBe(RECALL_TEMPLATE_NAME);
    expect(body.template.language.code).toBe("zh_CN");
    expect(body.template.components[0].parameters.map((x: { text: string }) => x.text)).toEqual([
      p.firstName,
      `${PREFIX}-branch`,
      "03-2181 1234",
    ]);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("falls back to email when the template isn't approved", async () => {
    await connect({ en: "PENDING" });
    const p = await patient({ email: `${PREFIX}-fb@t.test`, lang: "ms" });
    const row = await queue(p.id, "REVIEW");
    sendEmailMock.mockResolvedValue({ ok: true, id: "email-1" });

    await dispatchOutreach(new Date());

    expect(fetchMock).not.toHaveBeenCalled();
    const after = await prisma.patientOutreach.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({ status: "SENT", channel: "EMAIL", externalId: "email-1" });
    expect(after.failureReason).toMatch(/^WhatsApp: Review request template is not approved/);
    const email = sendEmailMock.mock.calls[0][0];
    expect(email.to).toBe(`${PREFIX}-fb@t.test`);
    expect(email.text).toContain("https://g.page/r/test/review");
    expect(email.text).toContain("/unsubscribe?p=");
    expect(email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("skips when WhatsApp isn't connected and there is no email, and when consent was withdrawn", async () => {
    const noEmail = await patient({});
    const withdrawn = await patient({ email: `${PREFIX}-w@t.test` });
    const a = await queue(noEmail.id);
    const b = await queue(withdrawn.id);
    await prisma.patient.update({ where: { id: withdrawn.id }, data: { marketingConsent: false } });

    await dispatchOutreach(new Date());

    const [ra, rb] = await Promise.all([
      prisma.patientOutreach.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.patientOutreach.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    expect(ra.status).toBe("SKIPPED");
    expect(ra.failureReason).toMatch(/not connected/);
    expect(rb.status).toBe("SKIPPED");
    expect(rb.failureReason).toMatch(/marketing/);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  // W3 / G6: rows wait overnight; whatever changed since must stop them.
  it("re-checks at send time: switched off, inactive, booked since, lapsed plan; staff-sent rows ignore the switch", async () => {
    const off = await patient({ email: `${PREFIX}-off@t.test` });
    const inactive = await patient({ email: `${PREFIX}-in@t.test` });
    const booked = await patient({ email: `${PREFIX}-bk@t.test` });
    const manual = await patient({ email: `${PREFIX}-mn@t.test` });
    const rOff = await queue(off.id);
    const rIn = await queue(inactive.id);
    const rBk = await queue(booked.id);
    const rMn = await prisma.patientOutreach.create({
      data: { patientId: manual.id, branchId, type: "RECALL", channel: "EMAIL", scheduledFor: new Date(Date.now() - 60_000), createdById: users.OWNER },
    });
    await setSettings({ recallEnabled: false });
    await prisma.patient.update({ where: { id: inactive.id }, data: { status: "inactive" } });
    await prisma.appointment.create({
      data: { patientId: booked.id, branchId, doctorId, dateTime: new Date(Date.now() + 3 * DAY) },
    });
    sendEmailMock.mockResolvedValue({ ok: true, id: "email-m" });

    await dispatchOutreach(new Date());

    const get = (id: string) => prisma.patientOutreach.findUniqueOrThrow({ where: { id } });
    expect(await get(rOff.id)).toMatchObject({ status: "SKIPPED", failureReason: "The clinic switched these messages off" });
    expect((await get(rIn.id)).status).toBe("SKIPPED");
    expect((await get(rBk.id)).status).toBe("SKIPPED");
    expect((await get(rMn.id)).status).toBe("SENT");

    // The clinic's plan lapses: nothing more goes out, even sent by hand.
    const payer = await prisma.user.create({ data: { email: `${PREFIX}-payer@t.test`, trialEndsAt: new Date(Date.now() - DAY) } });
    await prisma.branch.update({ where: { id: branchId }, data: { billingUserId: payer.id } });
    const late = await prisma.patientOutreach.create({
      data: { patientId: manual.id, branchId, type: "RECALL", channel: "EMAIL", scheduledFor: new Date(Date.now() - 60_000), createdById: users.OWNER },
    });
    await dispatchOutreach(new Date());
    expect(await get(late.id)).toMatchObject({ status: "SKIPPED", failureReason: "The clinic's SmartChiro plan has ended" });
    await prisma.branch.update({ where: { id: branchId }, data: { billingUserId: null } });
  });

  it("retries a transient WhatsApp error with backoff", async () => {
    await connect({ en: "APPROVED" });
    const p = await patient({});
    const row = await queue(p.id);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "Too many", code: 130429 } }), { status: 429 }));
    const now = new Date();

    await dispatchOutreach(now);

    const after = await prisma.patientOutreach.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe("PENDING");
    expect(after.attemptCount).toBe(1);
    expect(after.scheduledFor.getTime()).toBeGreaterThan(now.getTime());
  });
});

// W2: Meta accepts the message, then reports it failed (not on WhatsApp).
describe("failed-status webhook", () => {
  it("moves a recall to email, and queues the email fallback for a WhatsApp-only reminder", async () => {
    const p = await patient({ email: `${PREFIX}-late@t.test` });
    await prisma.patient.update({ where: { id: p.id }, data: { reminderChannel: "WHATSAPP" } });
    const recall = await prisma.patientOutreach.create({
      data: { patientId: p.id, branchId, type: "RECALL", channel: "WHATSAPP", status: "SENT", externalId: "wamid.LATE1", scheduledFor: new Date() },
    });
    const appt = await prisma.appointment.create({
      data: { patientId: p.id, branchId, doctorId, dateTime: new Date(Date.now() + 2 * DAY) },
    });
    await prisma.appointmentReminder.create({
      data: { appointmentId: appt.id, channel: "WHATSAPP", offsetMin: 1440, scheduledFor: new Date(), status: "SENT", externalId: "wamid.LATE2" },
    });

    await applyWebhookEvent({ kind: "message_failed", msgId: "wamid.LATE1", reason: "wa_failed: not on WhatsApp (131026)" });
    await applyWebhookEvent({ kind: "message_failed", msgId: "wamid.LATE2", reason: "wa_failed: not on WhatsApp (131026)" });

    expect(await prisma.patientOutreach.findUniqueOrThrow({ where: { id: recall.id } })).toMatchObject({ status: "PENDING", channel: "EMAIL" });
    const rows = await prisma.appointmentReminder.findMany({ where: { appointmentId: appt.id } });
    expect(rows.find((r) => r.channel === "WHATSAPP")?.status).toBe("FAILED");
    expect(rows.find((r) => r.isFallback)).toMatchObject({ channel: "EMAIL", status: "PENDING", offsetMin: 1440 });
  });
});

describe("STOP webhook", () => {
  it("clears consent for the matching patient in the connected branch and skips queued messages", async () => {
    await prisma.whatsAppAccount.create({
      data: {
        branchId,
        wabaId: `${PREFIX}-waba`,
        phoneNumberId: `${PREFIX}-pn`,
        connectionType: "MANUAL",
        accessTokenEnc: encryptSecret("tok"),
        templateName: "smartchiro_appt_reminder_v1",
        templateStatus: {},
      },
    });
    const stopper = await patient({ phone: "012-999 8888" });
    const other = await patient({ phone: "012-999 7777" });
    const queued = await prisma.patientOutreach.create({
      data: { patientId: stopper.id, branchId, type: "RECALL", channel: "WHATSAPP", scheduledFor: new Date() },
    });

    await applyWebhookEvent({ kind: "opt_out", phoneNumberId: `${PREFIX}-pn`, from: "60129998888" });

    const [s, o, q] = await Promise.all([
      prisma.patient.findUniqueOrThrow({ where: { id: stopper.id } }),
      prisma.patient.findUniqueOrThrow({ where: { id: other.id } }),
      prisma.patientOutreach.findUniqueOrThrow({ where: { id: queued.id } }),
    ]);
    expect(s).toMatchObject({ marketingConsent: false, marketingConsentAt: null });
    expect(o.marketingConsent).toBe(true);
    expect(q).toMatchObject({ status: "SKIPPED", failureReason: "opted_out" });
  });

  it("ignores STOP sent to a number no branch uses", async () => {
    const p = await patient({ phone: "012-999 6666" });
    await applyWebhookEvent({ kind: "opt_out", phoneNumberId: "someone-else", from: "60129996666" });
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: p.id } })).marketingConsent).toBe(true);
  });
});

describe("POST /api/patients/[id]/outreach (manual recall)", () => {
  const post = (patientId: string, body: unknown) =>
    postPatientOutreach(
      new Request(`http://x/api/patients/${patientId}/outreach`, { method: "POST", body: JSON.stringify(body) }),
      { params: Promise.resolve({ patientId }) },
    );
  const as = (role: string) => mockAuth.mockResolvedValue({ user: { id: users[role] } });

  beforeEach(() => setSettings({ recallCooldownDays: 90 }));

  it("lets front desk send a recall (email, WhatsApp not connected) and blocks doctors", async () => {
    const p = await patient({ phone: null, email: `${PREFIX}-m@t.test`, lastVisitDaysAgo: 5 });
    sendEmailMock.mockResolvedValue({ ok: true, id: "e-9" });

    as("DOCTOR");
    expect((await post(p.id, { type: "RECALL" })).status).toBe(403);

    as("FRONT_DESK");
    const res = await post(p.id, { type: "RECALL" });
    expect(res.status).toBe(201);
    const { outreach } = await res.json();
    expect(outreach).toMatchObject({ type: "RECALL", channel: "EMAIL", status: "SENT", createdByName: "FRONT_DESK" });
  });

  it("requires consent", async () => {
    const p = await patient({ consent: false, lastVisitDaysAgo: 60 });
    as("OWNER");
    const res = await post(p.id, { type: "RECALL" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("no_consent");
  });

  it("returns 409 inside the cooldown; only OWNER / ADMIN may force", async () => {
    const p = await patient({ phone: null, email: `${PREFIX}-c@t.test` });
    await prisma.patientOutreach.create({
      data: { patientId: p.id, branchId, type: "RECALL", channel: "EMAIL", status: "SENT", scheduledFor: new Date(Date.now() - DAY) },
    });
    sendEmailMock.mockResolvedValue({ ok: true, id: "e-10" });

    as("FRONT_DESK");
    const blocked = await post(p.id, { type: "RECALL" });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ error: "cooldown", canForce: false });
    expect((await post(p.id, { type: "RECALL", force: true })).status).toBe(403);

    as("ADMIN");
    expect((await post(p.id, { type: "RECALL", force: true })).status).toBe(201);

    as("OWNER");
    const history = await getPatientOutreach(new Request("http://x"), { params: Promise.resolve({ patientId: p.id }) });
    const body = await history.json();
    expect(body.items).toHaveLength(2);
    expect(body).toMatchObject({ marketingConsent: true, canSend: true, canForce: true });
  });

  it("reports a graceful failure when email isn't configured", async () => {
    const saved = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const p = await patient({ phone: null, email: `${PREFIX}-nr@t.test` });
      as("OWNER");
      const res = await post(p.id, { type: "RECALL" });
      expect(res.status).toBe(201);
      const { outreach } = await res.json();
      expect(outreach).toMatchObject({ status: "SKIPPED", channel: "EMAIL" });
      expect(outreach.failureReason).toMatch(/RESEND_API_KEY/);
      expect(sendEmailMock).not.toHaveBeenCalled();
    } finally {
      process.env.RESEND_API_KEY = saved;
    }
  });
});

// W4: the email's unsubscribe link really stops the messages.
describe("unsubscribe link", () => {
  it("withdraws consent and skips queued messages; a forged link does nothing", async () => {
    process.env.AUTH_SECRET ||= "test-secret";
    const { POST } = await import("@/app/api/public/unsubscribe/route");
    const { unsubscribeToken } = await import("../unsubscribe");
    const p = await patient({ email: `${PREFIX}-unsub@t.test` });
    const queued = await prisma.patientOutreach.create({
      data: { patientId: p.id, branchId, type: "RECALL", channel: "EMAIL", scheduledFor: new Date(Date.now() + HOUR) },
    });
    const forged = await POST(new Request(`http://x/api/public/unsubscribe?p=${p.id}&t=nope&oneclick=1`, { method: "POST" }));
    expect(forged.status).toBe(400);
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: p.id } })).marketingConsent).toBe(true);

    const res = await POST(new Request(`http://x/api/public/unsubscribe?p=${p.id}&t=${unsubscribeToken(p.id)}&oneclick=1`, { method: "POST" }));
    expect(res.status).toBe(200);
    expect((await prisma.patient.findUniqueOrThrow({ where: { id: p.id } })).marketingConsent).toBe(false);
    expect((await prisma.patientOutreach.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe("SKIPPED");
  });
});
