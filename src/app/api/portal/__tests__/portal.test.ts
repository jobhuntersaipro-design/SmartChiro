import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/portal/email", () => ({
  sendPortalCodeEmail: vi.fn(async () => undefined),
  portalEmailConfigured: () => false,
}));
import { sendPortalCodeEmail } from "@/lib/portal/email";
import { ipCodeLimiter, ipVerifyLimiter } from "@/lib/portal/rules";
import { verifyPortalCode } from "@/lib/portal/auth";

import { POST as requestCode } from "../request-code/route";
import { POST as verify } from "../verify/route";
import { POST as logout } from "../logout/route";
import { GET as me } from "../me/route";
import { GET as appointments } from "../appointments/route";
import { POST as cancel } from "../appointments/[appointmentId]/cancel/route";
import { GET as packages } from "../packages/route";
import { GET as invoices } from "../invoices/route";
import { GET as invoicePdf } from "../invoices/[invoiceId]/pdf/route";
import { GET as receiptPdf } from "../invoices/[invoiceId]/payments/[paymentId]/receipt/route";

const STAMP = Date.now().toString(36);
const PREFIX = `test-portal-${STAMP}`;
const EMAIL = `${PREFIX}@t.com`;
const OTHER_EMAIL = `${PREFIX}-other@t.com`;
const H = 60 * 60_000;

let userId: string, branchA: string, branchB: string;
let patientA: string, patientB: string, otherPatient: string;
let farAppt: string, soonAppt: string, otherAppt: string;
let sentInvoice: string, draftInvoice: string, otherInvoice: string, paymentId: string, otherPaymentId: string;
let packageId: string;

let ipSeq = 0;
const nextIp = () => `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/portal/x", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": nextIp(), ...headers },
    body: JSON.stringify(body),
  });
const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

function lastSentCode(): string {
  const calls = vi.mocked(sendPortalCodeEmail).mock.calls;
  return calls[calls.length - 1][1];
}

async function signIn(email = EMAIL): Promise<string> {
  await prisma.portalLoginCode.deleteMany({ where: { email: email.toLowerCase() } });
  const res = await requestCode(post({ email }));
  expect(res.status).toBe(200);
  const v = await verify(post({ email, code: lastSentCode() }));
  expect(v.status).toBe(200);
  const cookie = v.headers.getSetCookie().find((c) => c.startsWith("sc_portal="))!;
  return cookie.split(";")[0];
}

const authed = (cookie: string, init: RequestInit = {}) =>
  new Request("http://localhost/api/portal/x", { ...init, headers: { cookie, ...(init.headers ?? {}) } });

describe("patient portal API", () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `${PREFIX}-dr@t.com`, name: "Dr. Portal Test" } });
    userId = u.id;
    const a = await prisma.branch.create({ data: { name: `${PREFIX} KLCC`, phone: "03-1111 2222", invoicePrefix: `PA${STAMP.slice(-5)}` } });
    const b = await prisma.branch.create({ data: { name: `${PREFIX} Penang`, phone: "04-3333 4444", portalCancelHours: 48 } });
    branchA = a.id;
    branchB = b.id;
    const clinical = { medicalHistory: "SECRET-MEDICAL", notes: "SECRET-STAFF-NOTE", allergies: "SECRET-ALLERGY", icNumber: null };
    patientA = (await prisma.patient.create({ data: { firstName: "Aisha", lastName: PREFIX, email: EMAIL, phone: "012-345 6789", branchId: branchA, doctorId: userId, ...clinical } })).id;
    // Same person at another branch, email typed with different case.
    patientB = (await prisma.patient.create({ data: { firstName: "Aisha", lastName: `${PREFIX}-pg`, email: EMAIL.toUpperCase(), branchId: branchB, doctorId: userId, status: "discharged" } })).id;
    otherPatient = (await prisma.patient.create({ data: { firstName: "Other", lastName: PREFIX, email: OTHER_EMAIL, branchId: branchA, doctorId: userId } })).id;

    const now = Date.now();
    farAppt = (await prisma.appointment.create({ data: { dateTime: new Date(now + 72 * H), patientId: patientA, branchId: branchA, doctorId: userId, treatmentType: "ADJUSTMENT", notes: "SECRET-APPT-NOTE" } })).id;
    soonAppt = (await prisma.appointment.create({ data: { dateTime: new Date(now + 30 * H), patientId: patientB, branchId: branchB, doctorId: userId } })).id;
    otherAppt = (await prisma.appointment.create({ data: { dateTime: new Date(now + 96 * H), patientId: otherPatient, branchId: branchA, doctorId: userId } })).id;
    await prisma.appointment.create({ data: { dateTime: new Date(now - 72 * H), status: "COMPLETED", patientId: patientA, branchId: branchA, doctorId: userId } });
    await prisma.visit.create({ data: { patientId: patientA, doctorId: userId, subjective: "SECRET-SOAP", assessment: "SECRET-SOAP" } });

    await prisma.appointmentReminder.create({ data: { appointmentId: farAppt, channel: "EMAIL", offsetMin: 1440, scheduledFor: new Date(now + 48 * H) } });
    const pkg = await prisma.patientPackage.create({ data: { patientId: patientA, branchId: branchA, name: "10 adjustments", sessionsTotal: 10, sessionsUsed: 3, price: 900, notes: "SECRET-PKG-NOTE" } });
    packageId = pkg.id;
    await prisma.packageRedemption.create({ data: { patientPackageId: pkg.id, appointmentId: farAppt } });

    const inv = (patientId: string, status: "SENT" | "DRAFT", n: string) =>
      prisma.invoice.create({
        data: { invoiceNumber: `${PREFIX}-${n}`, amount: 150, status, lineItems: [{ description: "Adjustment", quantity: 1, unitPrice: 150, total: 150 }], patientId, branchId: branchA, notes: null },
      });
    sentInvoice = (await inv(patientA, "SENT", "1")).id;
    draftInvoice = (await inv(patientA, "DRAFT", "2")).id;
    otherInvoice = (await inv(otherPatient, "SENT", "3")).id;
    paymentId = (await prisma.payment.create({ data: { invoiceId: sentInvoice, branchId: branchA, amount: 50, method: "CASH", receivedAt: new Date(), receiptNumber: `${PREFIX}-R1` } })).id;
    await prisma.invoice.update({ where: { id: sentInvoice }, data: { amountPaid: 50, status: "PARTIALLY_PAID" } });
    otherPaymentId = (await prisma.payment.create({ data: { invoiceId: otherInvoice, branchId: branchA, amount: 150, method: "CARD", receivedAt: new Date(), receiptNumber: `${PREFIX}-R2` } })).id;
  });

  beforeEach(() => {
    vi.mocked(sendPortalCodeEmail).mockClear();
    ipCodeLimiter.reset();
    ipVerifyLimiter.reset();
  });

  afterAll(async () => {
    await prisma.portalSession.deleteMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });
    await prisma.portalLoginCode.deleteMany({ where: { email: { in: [EMAIL, OTHER_EMAIL, `${PREFIX}-nobody@t.com`] } } });
    await prisma.appointmentAuditLog.deleteMany({ where: { appointmentId: { in: [farAppt, soonAppt, otherAppt] } } });
    await prisma.branch.deleteMany({ where: { id: { in: [branchA, branchB] } } });
    await prisma.visit.deleteMany({ where: { doctorId: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("request-code answers the same for unknown and known emails, and only sends to patients", async () => {
    const unknown = await requestCode(post({ email: `${PREFIX}-nobody@t.com` }));
    const known = await requestCode(post({ email: EMAIL.toUpperCase() }));
    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(await unknown.json()).toEqual(await known.json());
    expect(sendPortalCodeEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendPortalCodeEmail).mock.calls[0][0]).toBe(EMAIL);
    expect(await prisma.portalLoginCode.count({ where: { email: `${PREFIX}-nobody@t.com` } })).toBe(0);
    const row = await prisma.portalLoginCode.findFirst({ where: { email: EMAIL }, orderBy: { createdAt: "desc" } });
    expect(row?.codeHash).not.toContain(lastSentCode());
    expect((await requestCode(post({ email: "not-an-email" }))).status).toBe(422);
  });

  it("rate-limits codes per email silently and per IP with 429", async () => {
    await prisma.portalLoginCode.deleteMany({ where: { email: EMAIL } });
    const bodies = [];
    for (let i = 0; i < 4; i++) bodies.push(await (await requestCode(post({ email: EMAIL }))).json());
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(sendPortalCodeEmail).toHaveBeenCalledTimes(3);
    expect(await prisma.portalLoginCode.count({ where: { email: EMAIL } })).toBe(3);

    const ip = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < 10; i++) expect((await requestCode(post({ email: `${PREFIX}-nobody@t.com` }, ip))).status).toBe(200);
    expect((await requestCode(post({ email: `${PREFIX}-nobody@t.com` }, ip))).status).toBe(429);
  });

  it("verify: wrong codes use up attempts, a used code can't be reused, the newest code wins", async () => {
    await prisma.portalLoginCode.deleteMany({ where: { email: EMAIL } });
    await requestCode(post({ email: EMAIL }));
    const code = lastSentCode();
    const wrong = code === "000000" ? "111111" : "000000";
    const bad = await verify(post({ email: EMAIL, code: wrong }));
    expect(bad.status).toBe(400);
    const badBody = await bad.json();
    expect((await verify(post({ email: `${PREFIX}-nobody@t.com`, code }))).status).toBe(400);
    expect(await (await verify(post({ email: `${PREFIX}-nobody@t.com`, code }))).json()).toEqual(badBody);
    for (let i = 0; i < 4; i++) expect((await verify(post({ email: EMAIL, code: wrong }))).status).toBe(400);
    // Five wrong guesses: the right code is dead too.
    expect((await verify(post({ email: EMAIL, code }))).status).toBe(400);

    await requestCode(post({ email: EMAIL }));
    const first = lastSentCode();
    await requestCode(post({ email: EMAIL }));
    const second = lastSentCode();
    if (first !== second) expect((await verify(post({ email: EMAIL, code: first }))).status).toBe(400);
    const ok = await verify(post({ email: EMAIL, code: second }, { "user-agent": "vitest" }));
    expect(ok.status).toBe(200);
    const cookies = ok.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    for (const c of cookies) {
      expect(c).toMatch(/^sc_portal=[A-Za-z0-9_-]{43}; /);
      expect(c).toContain("HttpOnly");
      expect(c).toContain("SameSite=Lax");
      expect(c).toMatch(/Max-Age=259\d{4}/);
    }
    expect(cookies.map((c) => c.match(/Path=([^;]+)/)?.[1]).sort()).toEqual(["/api/portal", "/portal"]);
    const token = cookies[0].split(";")[0].split("=")[1];
    const stored = await prisma.portalSession.findFirst({ where: { email: EMAIL }, orderBy: { createdAt: "desc" } });
    expect(stored?.tokenHash).not.toBe(token);
    expect(stored?.userAgent).toBe("vitest");
    expect((await verify(post({ email: EMAIL, code: second }))).status).toBe(400);
  });

  it("codes expire after 10 minutes", async () => {
    await prisma.portalLoginCode.deleteMany({ where: { email: EMAIL } });
    await requestCode(post({ email: EMAIL }));
    const late = await verifyPortalCode(EMAIL, lastSentCode(), null, new Date(Date.now() + 10 * 60_000 + 1000));
    expect(late.ok).toBe(false);
  });

  it("a session covers every patient with that email across branches, and nobody else", async () => {
    const cookie = await signIn();
    const res = await me(authed(cookie));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe(EMAIL);
    expect(body.patients.map((p: { id: string }) => p.id).sort()).toEqual([patientA, patientB].sort());
    expect(body.patients.find((p: { id: string }) => p.id === patientA).branch).toMatchObject({ name: `${PREFIX} KLCC`, phone: "03-1111 2222" });

    const appts = await (await appointments(authed(cookie))).json();
    const ids = appts.upcoming.map((a: { id: string }) => a.id);
    expect(ids).toEqual([soonAppt, farAppt]);
    expect(ids).not.toContain(otherAppt);
    expect(appts.past).toHaveLength(1);
    const far = appts.upcoming.find((a: { id: string }) => a.id === farAppt);
    expect(far).toMatchObject({ canCancel: true, cancelHours: 24, treatment: "Adjustment", doctorName: "Dr. Portal Test" });
    expect(appts.upcoming.find((a: { id: string }) => a.id === soonAppt)).toMatchObject({ canCancel: false, cancelHours: 48 });

    const pk = await (await packages(authed(cookie))).json();
    expect(pk.packages).toEqual([expect.objectContaining({ id: packageId, sessionsLeft: 7, status: "ACTIVE" })]);
  });

  it("requires a live session", async () => {
    expect((await me(new Request("http://localhost/api/portal/me"))).status).toBe(401);
    expect((await me(authed("sc_portal=forged-token"))).status).toBe(401);
    const cookie = await signIn();
    await prisma.portalSession.updateMany({ where: { email: EMAIL }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await me(authed(cookie))).status).toBe(401);
  });

  it("cancel: ownership, cutoff and the staff side effects", async () => {
    const cookie = await signIn();
    const call = (id: string, body: unknown = {}, headers: Record<string, string> = {}) =>
      cancel(authed(cookie, { method: "POST", body: JSON.stringify(body), headers }), params({ appointmentId: id }));

    expect((await call(otherAppt)).status).toBe(404);
    expect((await call("does-not-exist")).status).toBe(404);
    const late = await call(soonAppt);
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({ error: "too_late", cancelHours: 48 });
    expect((await call(farAppt, {}, { origin: "https://evil.example", host: "localhost" })).status).toBe(403);

    const ok = await call(farAppt, { reason: "Travelling for work" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).appointment).toMatchObject({ id: farAppt, status: "CANCELLED", canCancel: false });

    expect((await prisma.appointment.findUnique({ where: { id: farAppt } }))?.status).toBe("CANCELLED");
    expect((await prisma.appointment.findUnique({ where: { id: otherAppt } }))?.status).toBe("SCHEDULED");
    expect(await prisma.appointmentReminder.count({ where: { appointmentId: farAppt, status: "PENDING" } })).toBe(0);
    const pkg = await prisma.patientPackage.findUnique({ where: { id: packageId } });
    expect(pkg?.sessionsUsed).toBe(2);
    const redemption = await prisma.packageRedemption.findFirst({ where: { appointmentId: farAppt } });
    expect(redemption?.reversedAt).not.toBeNull();
    const audit = await prisma.appointmentAuditLog.findFirst({ where: { appointmentId: farAppt, action: "CANCEL" } });
    expect(audit).toMatchObject({ actorId: null, actorName: "Patient portal", actorEmail: EMAIL });
    expect(audit?.changes).toMatchObject({ status: { from: "SCHEDULED", to: "CANCELLED" }, cancelReason: { to: "Travelling for work" } });

    const again = await call(farAppt);
    expect(again.status).toBe(409);
    expect((await call(farAppt, { reason: "x".repeat(301) })).status).toBe(422);
  });

  it("invoices and receipts: only the session's issued invoices", async () => {
    const cookie = await signIn();
    const list = await (await invoices(authed(cookie))).json();
    expect(list.invoices.map((i: { id: string }) => i.id)).toEqual([sentInvoice]);
    expect(list.invoices[0]).toMatchObject({ total: 150, paid: 50, balance: 100, status: "PARTIALLY_PAID" });
    expect(list.invoices[0].receipts).toEqual([expect.objectContaining({ id: paymentId, amount: 50, method: "Cash" })]);

    const pdf = await invoicePdf(authed(cookie), params({ invoiceId: sentInvoice }));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(pdf.headers.get("cache-control")).toContain("no-store");
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    expect((await invoicePdf(authed(cookie), params({ invoiceId: otherInvoice }))).status).toBe(404);
    expect((await invoicePdf(authed(cookie), params({ invoiceId: draftInvoice }))).status).toBe(404);

    const receipt = await receiptPdf(authed(cookie), params({ invoiceId: sentInvoice, paymentId }));
    expect(receipt.status).toBe(200);
    expect(receipt.headers.get("content-type")).toBe("application/pdf");
    expect((await receiptPdf(authed(cookie), params({ invoiceId: otherInvoice, paymentId: otherPaymentId }))).status).toBe(404);
    expect((await receiptPdf(authed(cookie), params({ invoiceId: sentInvoice, paymentId: otherPaymentId }))).status).toBe(404);

    const outsider = await signIn(OTHER_EMAIL);
    expect((await invoicePdf(authed(outsider), params({ invoiceId: sentInvoice }))).status).toBe(404);
    expect((await receiptPdf(authed(outsider), params({ invoiceId: sentInvoice, paymentId }))).status).toBe(404);
  });

  it("never returns clinical data or staff notes", async () => {
    const cookie = await signIn();
    const bodies = await Promise.all([me, appointments, packages, invoices].map(async (h) => (await h(authed(cookie))).text()));
    for (const text of bodies) {
      expect(text).not.toContain("SECRET");
      expect(text).not.toMatch(/medicalHistory|subjective|allergies|icNumber|"notes"/);
    }
  });

  it("logout deletes the session and clears both cookies", async () => {
    const cookie = await signIn();
    const out = await logout(authed(cookie, { method: "POST" }));
    expect(out.status).toBe(200);
    const cleared = out.headers.getSetCookie();
    expect(cleared).toHaveLength(2);
    for (const c of cleared) expect(c).toContain("Max-Age=0");
    expect((await me(authed(cookie))).status).toBe(401);
  });
});
