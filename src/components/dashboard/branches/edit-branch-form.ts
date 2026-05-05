import type { OperatingHoursMap } from "@/types/branch";

export interface EditBranchFormData {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  operatingHours: string;
  treatmentRooms: number | null;
  billingContactName: string;
  billingContactEmail: string;
  billingContactPhone: string;
}

type BranchSourceShape = {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  operatingHours: string | null;
  treatmentRooms: number | null;
  billingContactName?: string | null;
  billingContactEmail?: string | null;
  billingContactPhone?: string | null;
};

const STRING_FIELDS = [
  "name",
  "address",
  "city",
  "state",
  "zip",
  "phone",
  "email",
  "website",
  "operatingHours",
  "billingContactName",
  "billingContactEmail",
  "billingContactPhone",
] as const;

export function branchToFormData(branch: BranchSourceShape): EditBranchFormData {
  const out = {} as EditBranchFormData;
  for (const f of STRING_FIELDS) {
    out[f] = branch[f] ?? "";
  }
  out.treatmentRooms = branch.treatmentRooms ?? null;
  return out;
}

export function computePatchPayload(
  initial: EditBranchFormData,
  current: EditBranchFormData
): Partial<EditBranchFormData> {
  const payload: Partial<EditBranchFormData> = {};
  for (const f of STRING_FIELDS) {
    if (initial[f] !== current[f]) {
      payload[f] = current[f];
    }
  }
  if (initial.treatmentRooms !== current.treatmentRooms) {
    payload.treatmentRooms = current.treatmentRooms;
  }
  return payload;
}

export function parseOperatingHoursJson(
  hoursJson: string | null
): OperatingHoursMap {
  if (!hoursJson) return {};
  try {
    const parsed = JSON.parse(hoursJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as OperatingHoursMap;
    }
    return {};
  } catch {
    return {};
  }
}
