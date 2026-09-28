import { describe, it, expect } from "vitest";
import type { BranchRole } from "@prisma/client";
import {
  ASSIGNABLE_STAFF_ROLES,
  can,
  redactClinicalFields,
  roleLabel,
  ROLE_CAPABILITIES,
  type Capability,
} from "@/lib/permissions";
import { CLINICIAN_ROLES } from "@/lib/clinician";

const ROLES: BranchRole[] = ["OWNER", "ADMIN", "DOCTOR", "FRONT_DESK"];

// The spec table (improvement-plan-spec.md §2.1), one row per capability:
// [OWNER, ADMIN, DOCTOR, FRONT_DESK]
const MATRIX: Record<Capability, [boolean, boolean, boolean, boolean]> = {
  "patient.readAll": [true, true, false, true],
  "patient.write": [true, true, true, true],
  "patient.assignDoctor": [true, true, false, true],
  "patient.delete": [true, true, false, false],
  "clinical.read": [true, true, true, false],
  "clinical.write": [true, true, true, false],
  "xray.read": [true, true, true, false],
  "xray.write": [true, true, true, false],
  "appointment.write": [true, true, true, true],
  "appointment.manageAll": [true, true, false, true],
  "appointment.delete": [true, true, false, false],
  "invoice.manage": [true, true, false, true],
  "branch.manage": [true, false, false, false],
  "staff.manage": [true, true, false, false],
  "schedule.manageAll": [true, true, false, false],
  "reminders.manage": [true, true, false, false],
  "audit.read": [true, true, false, false],
  "dashboard.clinicalStats": [true, true, true, false],
  "reports.read": [true, true, false, false],
  "package.manage": [true, true, false, false],
};

describe("permissions matrix", () => {
  for (const [capability, expected] of Object.entries(MATRIX) as [Capability, boolean[]][]) {
    it(`${capability}`, () => {
      expect(ROLES.map((r) => can(r, capability))).toEqual(expected);
    });
  }

  it("covers every capability a role holds", () => {
    for (const role of ROLES) {
      for (const cap of ROLE_CAPABILITIES[role]) {
        expect(MATRIX[cap], `${role} holds unlisted ${cap}`).toBeDefined();
      }
    }
  });

  it("denies everything without a role", () => {
    for (const cap of Object.keys(MATRIX) as Capability[]) {
      expect(can(null, cap)).toBe(false);
      expect(can(undefined, cap)).toBe(false);
      expect(can("VIEWER", cap)).toBe(false);
    }
  });

  it("front desk is never a clinician", () => {
    expect(CLINICIAN_ROLES).not.toContain("FRONT_DESK");
  });
});

describe("role labels", () => {
  it("labels every role", () => {
    expect(ROLES.map(roleLabel)).toEqual(["Owner", "Admin", "Doctor", "Front desk"]);
    expect(roleLabel(null)).toBe("");
  });

  it("staff can be added as doctor, admin or front desk (never owner)", () => {
    expect(ASSIGNABLE_STAFF_ROLES).toEqual(["DOCTOR", "ADMIN", "FRONT_DESK"]);
  });
});

describe("redactClinicalFields", () => {
  const patient = { id: "p1", firstName: "A", medicalHistory: "L4-L5", notes: "n" };

  it("strips medicalHistory and notes for front desk", () => {
    const out = redactClinicalFields("FRONT_DESK", patient);
    expect(out).toEqual({ id: "p1", firstName: "A" });
    expect("medicalHistory" in out).toBe(false);
    expect(patient.medicalHistory).toBe("L4-L5");
  });

  it("keeps them for clinical roles", () => {
    for (const role of ["OWNER", "ADMIN", "DOCTOR"] as const) {
      expect(redactClinicalFields(role, patient)).toBe(patient);
    }
  });
});
