import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as connectPOST } from "../connect/route";
import { GET as statusGET } from "../status/route";
import { POST as disconnectPOST } from "../disconnect/route";

const TEST_PREFIX = "rem-wa-route-";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
vi.mock("@/lib/wa/worker-client", () => ({
  startSession: vi.fn().mockResolvedValue({ ok: true }),
  logoutSession: vi.fn().mockResolvedValue({ ok: true }),
}));

import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

async function cleanup() {
  await prisma.waSession.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branchMember.deleteMany({
    where: { branch: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function setup(role: "OWNER" | "DOCTOR" = "OWNER") {
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
  } as never);
  vi.mocked(getUserBranchRole).mockResolvedValue(role);
  return { user, branch };
}

describe("WhatsApp wa/* routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });

  it("connect — DOCTOR is forbidden", async () => {
    const { branch } = await setup("DOCTOR");
    const res = await connectPOST(
      new Request("http://x", { method: "POST" }),
      { params: Promise.resolve({ branchId: branch.id }) }
    );
    expect(res.status).toBe(403);
  });

  it("connect — OWNER triggers worker.startSession and creates a PAIRING WaSession", async () => {
    const { branch } = await setup("OWNER");
    const res = await connectPOST(
      new Request("http://x", { method: "POST" }),
      { params: Promise.resolve({ branchId: branch.id }) }
    );
    expect(res.status).toBe(200);
    const row = await prisma.waSession.findUniqueOrThrow({
      where: { branchId: branch.id },
    });
    expect(row.status).toBe("PAIRING");
  });

  it("status — any branch member can read", async () => {
    const { branch } = await setup("DOCTOR");
    await prisma.waSession.create({
      data: { branchId: branch.id, status: "CONNECTED", phoneNumber: "+60123" },
    });
    const res = await statusGET(new Request("http://x"), {
      params: Promise.resolve({ branchId: branch.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("CONNECTED");
    expect(body.phoneNumber).toBe("+60123");
  });

  it("status — returns DISCONNECTED for missing session", async () => {
    const { branch } = await setup("DOCTOR");
    const res = await statusGET(new Request("http://x"), {
      params: Promise.resolve({ branchId: branch.id }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("DISCONNECTED");
  });

  it("disconnect — OWNER clears the session", async () => {
    const { branch } = await setup("OWNER");
    await prisma.waSession.create({
      data: { branchId: branch.id, status: "CONNECTED", phoneNumber: "+60123" },
    });
    const res = await disconnectPOST(
      new Request("http://x", { method: "POST" }),
      { params: Promise.resolve({ branchId: branch.id }) }
    );
    expect(res.status).toBe(200);
    const row = await prisma.waSession.findUniqueOrThrow({
      where: { branchId: branch.id },
    });
    expect(row.status).toBe("DISCONNECTED");
  });
});
