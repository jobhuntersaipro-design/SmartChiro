import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST, GET as LIST } from "../route";
import { GET as DETAIL, PATCH } from "../[appointmentId]/route";

const TEST_PREFIX = "appt-room-";

vi.mock("@/lib/auth-utils", () => ({
  getCurrentUser: vi.fn(),
  getUserBranchRole: vi.fn(),
}));
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";

async function cleanup() {
  await prisma.appointment.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.patient.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branchMember.deleteMany({ where: { branch: { name: { startsWith: TEST_PREFIX } } } });
  await prisma.branch.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function buildFixture() {
  const stamp = Date.now() + Math.floor(Math.random() * 100000);
  const owner = await prisma.user.create({ data: { email: `${TEST_PREFIX}o-${stamp}@t`, name: "O" } });
  const branch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b-${stamp}`, treatmentRooms: 3 } });
  const otherBranch = await prisma.branch.create({ data: { name: `${TEST_PREFIX}b2-${stamp}` } });
  await prisma.branchMember.create({ data: { userId: owner.id, branchId: branch.id, role: "OWNER" } });
  await prisma.branchMember.create({ data: { userId: owner.id, branchId: otherBranch.id, role: "OWNER" } });
  const patient = await prisma.patient.create({
    data: { firstName: "Room", lastName: "Test", branchId: branch.id, doctorId: owner.id, reminderChannel: "NONE" },
  });
  return { owner, branch, otherBranch, patient };
}

const futureIso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const post = (body: Record<string, unknown>) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
const ctx = (appointmentId: string) => ({ params: Promise.resolve({ appointmentId }) });

describe("appointment room", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanup();
  });
  afterAll(cleanup);

  it("round-trips through POST, GET list, GET detail and PATCH", async () => {
    const { owner, branch, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");

    const when = futureIso(72 * 60 * 60 * 1000);
    const res = await post({
      patientId: patient.id,
      doctorId: owner.id,
      dateTime: when,
      duration: 60,
      room: "  Room 2 ",
      branchId: branch.id,
    });
    expect(res.status).toBe(201);
    const created = (await res.json()).appointment;
    expect(created.room).toBe("Room 2");
    expect(created.branchId).toBe(branch.id);

    const listRes = await LIST(
      new Request(
        `http://x?branchId=${branch.id}&start=${encodeURIComponent(futureIso(0))}&end=${encodeURIComponent(futureIso(7 * 86400000))}`,
      ),
    );
    const list = (await listRes.json()).appointments as Array<{ id: string; room: string | null }>;
    expect(list.find((a) => a.id === created.id)?.room).toBe("Room 2");

    const detail = await (await DETAIL(new Request("http://x"), ctx(created.id))).json();
    expect(detail.appointment.room).toBe("Room 2");

    const patched = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ room: "Room 3" }) }),
      ctx(created.id),
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).appointment.room).toBe("Room 3");

    const cleared = await PATCH(
      new Request("http://x", { method: "PATCH", body: JSON.stringify({ room: "" }) }),
      ctx(created.id),
    );
    expect((await cleared.json()).appointment.room).toBeNull();
  });

  it("room is optional and stored as null", async () => {
    const { owner, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const res = await post({ patientId: patient.id, doctorId: owner.id, dateTime: futureIso(96 * 3600000) });
    expect(res.status).toBe(201);
    expect((await res.json()).appointment.room).toBeNull();
  });

  it("rejects a branch that is not the patient's", async () => {
    const { owner, otherBranch, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const res = await post({
      patientId: patient.id,
      doctorId: owner.id,
      dateTime: futureIso(96 * 3600000),
      branchId: otherBranch.id,
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("patient_not_in_branch");
  });

  it("rejects a room longer than 60 characters", async () => {
    const { owner, patient } = await buildFixture();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: owner.id } as never);
    vi.mocked(getUserBranchRole).mockResolvedValue("OWNER");
    const res = await post({
      patientId: patient.id,
      doctorId: owner.id,
      dateTime: futureIso(96 * 3600000),
      room: "x".repeat(61),
    });
    expect(res.status).toBe(422);
  });
});
