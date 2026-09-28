/**
 * LHDN MyInvois code tables and the fixed values SmartChiro uses.
 *
 * Source: the MyInvois SDK code tables (sdk.myinvois.hasil.gov.my/codes/…),
 * read through the community mirror github.com/deadboy18/myinvois-docs
 * (05-code-tables/*) because the SDK site is not reachable from the build
 * environment. Values marked ASSUMPTION are choices the SDK leaves to the
 * taxpayer; they are constants so the owner / their tax agent can change them.
 */
import COUNTRY_CODES from "./country-codes.json";

/** e-Invoice types (05-code-tables/e-invoice-types). */
export const DOCUMENT_TYPE = {
  INVOICE: "01",
  CREDIT_NOTE: "02",
  DEBIT_NOTE: "03",
  REFUND_NOTE: "04",
} as const;
export type DocumentTypeCode = (typeof DOCUMENT_TYPE)[keyof typeof DOCUMENT_TYPE];

/**
 * v1.0 = no signature validation; v1.1 = XAdES signature required
 * (04-document-types/README: "the only difference is that signature validation
 * is disabled on this version"). v1.0 is accepted until LHDN announces its
 * retirement (official FAQ), so it is the default.
 */
export type DocumentVersion = "1.0" | "1.1";
export const DEFAULT_DOCUMENT_VERSION: DocumentVersion = "1.0";

/** Tax types (05-code-tables/tax-types). */
export const TAX_TYPE = {
  SALES_TAX: "01",
  SERVICE_TAX: "02",
  NOT_APPLICABLE: "06",
  EXEMPT: "E",
} as const;

/** Tax type for SST charged on chiropractic services to non-citizens (Service Tax). */
export const SST_TAX_TYPE = TAX_TYPE.SERVICE_TAX;
/**
 * ASSUMPTION: lines with no SST (Malaysian patients, non-taxable items, or a
 * branch that is not SST-registered) are sent as "06 Not Applicable" with 0
 * tax. Some advisers use "E" (exempt) with an exemption reason for
 * SST-registered suppliers; the SDK does not say which applies to healthcare
 * services to citizens. Confirm with the clinic's tax agent.
 */
export const NO_TAX_TAX_TYPE = TAX_TYPE.NOT_APPLICABLE;

/**
 * Classification codes (05-code-tables/classification-codes). ASSUMPTION:
 * chiropractic treatment has no dedicated code — "020 Medical examination or
 * vaccination expenses" / "021 Medical expenses for serious diseases" are
 * tax-relief categories that don't fit general chiropractic care — so
 * individual e-invoices use "022 Others". Consolidated e-invoices must use
 * "004" (Specific Guideline §3.6; ERR236 per community reports).
 */
export const DEFAULT_CLASSIFICATION = "022";
export const CONSOLIDATED_CLASSIFICATION = "004";

/** UN/ECE Rec 20 unit "C62" (one), as in every official sample. */
export const UNIT_CODE = "C62";

/** General TINs (Specific Guideline v4.8 §3.5.7, §3.6.11, §10.5; official FAQ). */
export const GENERAL_TIN = {
  /** Malaysian individual who gave only MyKad, and consolidated "General Public". */
  PUBLIC: "EI00000000010",
  /** Foreign buyer without a Malaysian TIN. */
  FOREIGN_BUYER: "EI00000000020",
} as const;

/** Buyer name on a consolidated e-invoice (Specific Guideline §3.6.11 Table 3.5). */
export const GENERAL_PUBLIC_NAME = "General Public";
export const NOT_AVAILABLE = "NA";

export const SCHEME = { TIN: "TIN", BRN: "BRN", NRIC: "NRIC", PASSPORT: "PASSPORT", ARMY: "ARMY", SST: "SST", TTX: "TTX" } as const;
export type PartyIdScheme = "BRN" | "NRIC" | "PASSPORT" | "ARMY";

/**
 * Consolidation is not allowed for any single transaction above RM10,000
 * from 1 Jan 2026 (Specific Guideline v4.8 §3.7.2 Table 3.6 item 7).
 */
export const CONSOLIDATION_MAX_TRANSACTION = 10_000;
/** Consolidated e-invoice is due within 7 calendar days after month end (§3.6.2). */
export const CONSOLIDATION_DEADLINE_DAYS = 7;
/**
 * Lines per consolidated document. Each document must stay under 300 KB and a
 * submission holds at most 100 documents / 5 MB (Submit Documents API); one
 * line is ~1.5 KB of JSON, so 100 lines keeps a document well under the cap.
 */
export const CONSOLIDATED_LINES_PER_DOCUMENT = 100;
export const MAX_DOCUMENTS_PER_SUBMISSION = 100;
/** Cancellation window after validation (Cancel Document API). */
export const CANCEL_WINDOW_HOURS = 72;

// ─── States (05-code-tables/state-codes) ───

export const STATE_NAMES: Record<string, string> = {
  "01": "Johor",
  "02": "Kedah",
  "03": "Kelantan",
  "04": "Melaka",
  "05": "Negeri Sembilan",
  "06": "Pahang",
  "07": "Pulau Pinang",
  "08": "Perak",
  "09": "Perlis",
  "10": "Selangor",
  "11": "Terengganu",
  "12": "Sabah",
  "13": "Sarawak",
  "14": "Wilayah Persekutuan Kuala Lumpur",
  "15": "Wilayah Persekutuan Labuan",
  "16": "Wilayah Persekutuan Putrajaya",
  "17": "Not Applicable",
};

const STATE_ALIASES: [RegExp, string][] = [
  [/johor|johore/, "01"],
  [/kedah/, "02"],
  [/kelantan/, "03"],
  [/melaka|malacca/, "04"],
  [/negeri sembilan|n\.? ?sembilan/, "05"],
  [/pahang/, "06"],
  [/pulau pinang|penang|p\.? ?pinang/, "07"],
  [/perak/, "08"],
  [/perlis/, "09"],
  [/selangor/, "10"],
  [/terengganu|trengganu/, "11"],
  [/sabah/, "12"],
  [/sarawak/, "13"],
  [/putrajaya/, "16"],
  [/labuan/, "15"],
  [/kuala lumpur|\bkl\b/, "14"],
];

/**
 * State code for a Malaysian address. Accepts a code ("14"), a state name or
 * common alias. "Wilayah Persekutuan" alone is resolved from the city or the
 * postcode (KL 50000–60999, Putrajaya 62xxx, Labuan 87xxx). Null when unknown.
 */
export function malaysianStateCode(state: string | null | undefined, city?: string | null, postcode?: string | null): string | null {
  const raw = (state ?? "").trim();
  if (/^\d{1,2}$/.test(raw)) {
    const code = raw.padStart(2, "0");
    return code in STATE_NAMES && code !== "17" ? code : null;
  }
  const text = raw.toLowerCase();
  const federal = /wilayah persekutuan|federal territory|^w\.?p\.?\b/.test(text);
  for (const [pattern, code] of STATE_ALIASES) if (pattern.test(text)) return code;
  if (!federal) return null;
  const place = `${city ?? ""}`.toLowerCase();
  if (/putrajaya/.test(place)) return "16";
  if (/labuan/.test(place)) return "15";
  if (/kuala lumpur|bangsar|cheras|kepong|setapak|wangsa maju|bukit jalil|sentul|mont kiara/.test(place)) return "14";
  const zip = Number((postcode ?? "").trim());
  if (zip >= 50000 && zip <= 60999) return "14";
  if (zip >= 62000 && zip <= 62999) return "16";
  if (zip >= 87000 && zip <= 87999) return "15";
  return null;
}

const COUNTRIES = COUNTRY_CODES as Record<string, string>;
const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

/**
 * ISO 3166-1 alpha-3 code from the official MyInvois country table, for a
 * country name ("Malaysia"), an alpha-3 code or an alpha-2 code. Blank → MYS.
 */
export function countryCode(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return "MYS";
  const upper = raw.toUpperCase();
  if (upper === "MY" || upper === "MALAYSIA") return "MYS";
  if (/^[A-Z]{3}$/.test(upper) && Object.values(COUNTRIES).includes(upper)) return upper;
  if (COUNTRIES[upper]) return COUNTRIES[upper];
  if (/^[A-Z]{2}$/.test(upper)) {
    try {
      const name = REGION_NAMES.of(upper)?.toUpperCase();
      if (name && COUNTRIES[name]) return COUNTRIES[name];
    } catch {
      return null;
    }
  }
  return null;
}

/** MSIC codes a chiropractic clinic is likely to use (05-code-tables/msic-codes, section Q). */
export const HEALTH_MSIC_SUGGESTIONS: { code: string; description: string }[] = [
  { code: "86909", description: "Other human health services n.e.c." },
  { code: "86903", description: "Physiotherapy and occupational therapy service" },
  { code: "86202", description: "Specialized medical services" },
  { code: "86201", description: "General medical services" },
  { code: "86904", description: "Acupuncture services" },
  { code: "86905", description: "Herbalist and homeopathy services" },
];

/**
 * Phone number in E.164 form ("+60123456789") as the SDK asks for. Malaysian
 * local numbers ("012-345 6789", "03-2141 0000") get +60. Null if it can't be
 * made into 8–15 digits.
 */
export function e164Phone(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1).replace(/\+/g, "");
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `60${digits.slice(1)}`;
  else if (!digits.startsWith("60")) digits = `60${digits}`;
  digits = digits.replace(/\+/g, "");
  return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
}
