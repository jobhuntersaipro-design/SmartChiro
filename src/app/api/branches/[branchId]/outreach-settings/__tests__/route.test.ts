import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

import { GET, PUT } from "../route";
import { GET as getLog } from "../../outreach/route";

const PREFIX = `test-outreach-settings-${Date.now()}`;
let branchId: string;
let ownerId: string;
let doctorId: string;

const ctx = () => ({ params: Promise.resolve({ branchId }) });
const put = (body: unknown) =>
  PUT(new Request("http://x", { method: "PUT", body: JSON.stringify(body) }), ctx());

const VALID = {
  recallEnabled: true,
  recallAfterDays: 60,
  recallCooldownDays: 120,
  recallDailyLimit: 10,
  reviewEnabled: true,
  reviewDelayHours: 2,
  reviewCooldownDays: 365,
  googleReviewUrl: "https://g.page/r/klcc/review",
};

describe("/api/branches/[id]/outreach-settings", () => {
  beforeAll(async () => {
    const [owner, doctor] = await Promise.all(
      ["owner", "doctor"].map((n) => prisma.user.create({ data: { email: `${PREFIX}-${n}@t.test`, name: n } })),
    );
    ownerId = owner.id;
    doctorId = doctor.id;
    branchId = (await prisma.branch.create({ data: { name: `${PREFIX}-b` } })).id;
    await prisma.branchMember.createMany({
      data: [
        { userId: ownerId, branchId, role: "OWNER" },
        { userId: doctorId, branchId, role: "DOCTOR" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.branchReminderSettings.deleteMany({ where: { branchId } });
    await prisma.branchMember.deleteMany({ where: { branchId } });
    await prisma.branch.delete({ where: { id: branchId } });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  });

  it("is OWNER / ADMIN only", async () => {
    mockAuth.mockResolvedValue({ user: { id: doctorId } });
    expect((await GET(new Request("http://x"), ctx())).status).toBe(403);
    expect((await put(VALID)).status).toBe(403);
    expect((await getLog(new Request("http://x"), ctx())).status).toBe(403);
  });

  it("returns defaults before anything is saved", async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const body = await (await GET(new Request("http://x"), ctx())).json();
    expect(body.settings).toEqual({
      recallEnabled: false,
      recallAfterDays: 42,
      recallCooldownDays: 90,
      recallDailyLimit: 30,
      reviewEnabled: false,
      reviewDelayHours: 3,
      reviewCooldownDays: 180,
      googleReviewUrl: null,
    });
  });

  it("validates, saves without touching reminder settings, and needs a review link for reviews", async () => {
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    expect((await put({ ...VALID, googleReviewUrl: "" })).status).toBe(422);
    expect((await put({ ...VALID, googleReviewUrl: "http://insecure" })).status).toBe(422);
    expect((await put({ ...VALID, recallDailyLimit: 0 })).status).toBe(422);

    const res = await put(VALID);
    expect(res.status).toBe(200);
    expect((await res.json()).settings).toEqual(VALID);

    await prisma.branchReminderSettings.update({ where: { branchId }, data: { enabled: true, offsetsMin: [120] } });
    await put({ ...VALID, recallEnabled: false });
    const row = await prisma.branchReminderSettings.findUniqueOrThrow({ where: { branchId } });
    expect(row).toMatchObject({ enabled: true, offsetsMin: [120], recallEnabled: false });

    const log = await (await getLog(new Request("http://x?limit=500"), ctx())).json();
    expect(log.items).toEqual([]);
  });
});
