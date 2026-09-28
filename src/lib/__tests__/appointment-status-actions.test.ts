import { describe, it, expect, vi } from "vitest";
import { nextStatusActions, changeAppointmentStatus } from "@/lib/appointment-status-actions";

const start = new Date("2026-09-28T10:00:00+08:00");
const before = new Date("2026-09-28T09:40:00+08:00");
const after = new Date("2026-09-28T10:20:00+08:00");
const labels = (s: Parameters<typeof nextStatusActions>[0], now: Date) => nextStatusActions(s, start, now).map((a) => a.label);

describe("nextStatusActions", () => {
  it("offers check-in and start, and no-show only after the start time", () => {
    expect(labels("SCHEDULED", before)).toEqual(["Check in", "Start"]);
    expect(labels("SCHEDULED", after)).toEqual(["Check in", "Start", "No-show"]);
  });

  it("moves checked-in → start/complete → complete, and lets a no-show check in late", () => {
    expect(labels("CHECKED_IN", after)).toEqual(["Start", "Complete"]);
    expect(labels("IN_PROGRESS", after)).toEqual(["Complete"]);
    expect(nextStatusActions("NO_SHOW", start, after)[0].status).toBe("CHECKED_IN");
    expect(labels("COMPLETED", after)).toEqual([]);
    expect(labels("CANCELLED", after)).toEqual([]);
  });
});

describe("changeAppointmentStatus", () => {
  it("PATCHes the status and maps API errors to friendly messages", async () => {
    const ok = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await changeAppointmentStatus("a1", "CHECKED_IN", ok as unknown as typeof fetch)).toEqual({ ok: true, message: "Checked in" });
    expect(ok).toHaveBeenCalledWith("/api/appointments/a1", expect.objectContaining({ method: "PATCH", body: '{"status":"CHECKED_IN"}' }));
    const denied = vi.fn(async () => new Response('{"error":"forbidden"}', { status: 403 }));
    expect((await changeAppointmentStatus("a1", "NO_SHOW", denied as unknown as typeof fetch)).message).toMatch(/own appointments/);
  });
});
