import type { Branch } from "@prisma/client";

export const AUDITED_BRANCH_FIELDS = [
  "name",
  "address",
  "city",
  "state",
  "zip",
  "phone",
  "email",
  "website",
  "operatingHours",
  "treatmentRooms",
  "clinicType",
  "ownerName",
  "licenseNumber",
  "specialties",
  "insuranceProviders",
  "billingContactName",
  "billingContactEmail",
  "billingContactPhone",
] as const;

export type AuditedBranchField = (typeof AUDITED_BRANCH_FIELDS)[number];

export type BranchSnapshot = Record<AuditedBranchField, unknown>;

export type BranchDiff = {
  before: Partial<BranchSnapshot>;
  after: Partial<BranchSnapshot>;
};

export function snapshotOf(branch: Branch): BranchSnapshot {
  const snap = {} as BranchSnapshot;
  for (const field of AUDITED_BRANCH_FIELDS) {
    snap[field] = (branch as unknown as Record<string, unknown>)[field] ?? null;
  }
  return snap;
}

export function diffSnapshots(
  before: BranchSnapshot,
  after: BranchSnapshot
): BranchDiff {
  const beforeChanged: Partial<BranchSnapshot> = {};
  const afterChanged: Partial<BranchSnapshot> = {};
  for (const field of AUDITED_BRANCH_FIELDS) {
    if (before[field] !== after[field]) {
      beforeChanged[field] = before[field];
      afterChanged[field] = after[field];
    }
  }
  return { before: beforeChanged, after: afterChanged };
}
