import { describe, it, expect } from "vitest";
import { diffSnapshots, classifyUpdate, snapshotOf } from "../appointment-audit";

describe("diffSnapshots", () => {
  it("returns only changed fields", () => {
    const before = { a: 1, b: "x", c: true };
    const after = { a: 1, b: "y", c: true };
    const d = diffSnapshots(before, after);
    expect(d).toEqual({ b: { from: "x", to: "y" } });
  });

  it("treats Date instances by time-equality", () => {
    const t1 = new Date("2026-05-07T10:00:00Z");
    const t2 = new Date("2026-05-07T10:00:00Z");
    const before = { dateTime: t1 };
    const after = { dateTime: t2 };
    expect(Object.keys(diffSnapshots(before, after))).toHaveLength(0);
  });

  it("captures null-to-value transitions", () => {
    const d = diffSnapshots({ notes: null }, { notes: "hello" });
    expect(d.notes).toEqual({ from: null, to: "hello" });
  });
});

describe("classifyUpdate", () => {
  it("UPDATE for empty change set", () => {
    expect(classifyUpdate({})).toBe("UPDATE");
  });
  it("RESCHEDULE when only dateTime changed", () => {
    expect(
      classifyUpdate({ dateTime: { from: "a", to: "b" } })
    ).toBe("RESCHEDULE");
  });
  it("RESCHEDULE when only dateTime + duration changed", () => {
    expect(
      classifyUpdate({
        dateTime: { from: "a", to: "b" },
        duration: { from: 30, to: 45 },
      })
    ).toBe("RESCHEDULE");
  });
  it("DOCTOR_REASSIGN when only doctorId changed", () => {
    expect(
      classifyUpdate({ doctorId: { from: "a", to: "b" } })
    ).toBe("DOCTOR_REASSIGN");
  });
  it("CANCEL when status moved to CANCELLED only", () => {
    expect(
      classifyUpdate({ status: { from: "SCHEDULED", to: "CANCELLED" } })
    ).toBe("CANCEL");
  });
  it("STATUS_CHANGE for non-cancel status moves", () => {
    expect(
      classifyUpdate({ status: { from: "SCHEDULED", to: "COMPLETED" } })
    ).toBe("STATUS_CHANGE");
  });
  it("NOTE_EDIT when only notes changed", () => {
    expect(
      classifyUpdate({ notes: { from: null, to: "hello" } })
    ).toBe("NOTE_EDIT");
  });
  it("UPDATE for multi-field non-special combinations", () => {
    expect(
      classifyUpdate({
        notes: { from: "a", to: "b" },
        treatmentType: { from: "ADJUSTMENT", to: "X_RAY" },
      })
    ).toBe("UPDATE");
  });
});

describe("snapshotOf", () => {
  it("picks only audited fields and ignores extras", () => {
    const row = {
      id: "appt-1",
      dateTime: new Date(),
      duration: 30,
      status: "SCHEDULED",
      notes: null,
      doctorId: "d1",
      treatmentType: null,
      branchId: "b1",
      createdAt: new Date(),
    };
    const snap = snapshotOf(row);
    expect(Object.keys(snap).sort()).toEqual(
      ["dateTime", "doctorId", "duration", "notes", "status", "treatmentType"].sort()
    );
    expect("id" in snap).toBe(false);
    expect("branchId" in snap).toBe(false);
  });
});
