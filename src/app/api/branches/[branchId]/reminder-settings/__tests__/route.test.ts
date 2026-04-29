import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { GET, PUT } from "../route";

const TEST_PREFIX = "rem-set-";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

async function cleanup() {
  await prisma.branchReminderSettings.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.waSession.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branchMember.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function setup(role: "OWNER" | "ADMIN" | "DOCTOR" = "OWNER") {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const user = await prisma.user.create({
    data: { email: `${TEST_PREFIX}u-${stamp}@test.local`, name: "U" },
  });
  const branch = await prisma.branch.create({
    data: { name: `${TEST_PREFIX}b-${stamp}` },
  });
  await prisma.branchMember.create({
    data: { userId: user.id, branchId: branch.id, role },
  });
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: user.id,
    email: user.email,
    name: user.name,
  } as never);
  vi.mocked(getUserBranchRole).mockResolvedValue(role);
  return { user, branch };
}

describe("GET /api/branches/:id/reminder-settings", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ branchId: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a member", async () => {
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const u = await prisma.user.create({
      data: { email: `${TEST_PREFIX}u2-${stamp}@test.local`, name: "U2" },
    });
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: u.id,
      email: u.email,
      name: u.name,
    } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue(null);
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ branchId: "x" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns defaults when no settings row exists yet", async () => {
    const { branch } = await setup();
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ branchId: branch.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.enabled).toBe(false);
    expect(body.settings.offsetsMin).toEqual([1440, 120]);
  });
});

describe("PUT /api/branches/:id/reminder-settings", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("returns 403 when role is DOCTOR", async () => {
    const { branch } = await setup("DOCTOR");
    const res = await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          offsetsMin: [1440],
          templates: {},
        }),
      }),
      { params: Promise.resolve({ branchId: branch.id }) }
    );
    expect(res.status).toBe(403);
  });

  it("rejects an empty offsetsMin", async () => {
    const { branch } = await setup();
    const res = await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          offsetsMin: [],
          templates: {},
        }),
      }),
      { params: Promise.resolve({ branchId: branch.id }) }
    );
    expect(res.status).toBe(422);
  });

  it("rejects an unknown placeholder in template", async () => {
    const { branch } = await setup();
    const res = await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          offsetsMin: [1440],
          templates: {
            whatsapp: { en: "Hi {nope}", ms: "" },
            email: { en: "", ms: "", htmlEn: "", htmlMs: "" },
          },
        }),
      }),
      { params: Promise.resolve({ branchId: branch.id }) }
    );
    expect(res.status).toBe(422);
  });

  it("upserts settings", async () => {
    const { branch } = await setup();
    const res = await PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({
          enabled: true,
          offsetsMin: [1440, 120],
          templates: {
            whatsapp: { en: "Hi {firstName}", ms: "Hai {firstName}" },
            email: {
              en: "Hi",
              ms: "Hai",
              htmlEn: "<p>Hi</p>",
              htmlMs: "<p>Hai</p>",
            },
          },
        }),
      }),
      { params: Promise.resolve({ branchId: branch.id }) }
    );
    expect(res.status).toBe(200);
    const row = await prisma.branchReminderSettings.findUniqueOrThrow({
      where: { branchId: branch.id },
    });
    expect(row.enabled).toBe(true);
    expect(row.offsetsMin).toEqual([1440, 120]);
  });
});
