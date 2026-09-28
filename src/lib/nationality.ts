import { isValidMyKad, parseNationality } from "@/lib/invoices";

/**
 * Patient nationality helpers for forms (client-safe). Stored as ISO 3166-1
 * alpha-2; SST on chiropractic services applies to non-Malaysians only.
 */

/** Shown first in the picker: Malaysia and the countries most patients come from. */
export const COMMON_NATIONALITIES = [
  "MY", "SG", "ID", "TH", "PH", "VN", "CN", "IN", "BD", "PK", "NP", "MM", "JP", "KR", "AU", "GB", "US",
] as const;

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

/** "Singapore" for "SG"; the code itself when the runtime has no name for it. */
export function countryName(code: string): string {
  try {
    return REGION_NAMES.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** "Malaysia (MY)", or null when no nationality is recorded. */
export function nationalityLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return `${countryName(upper)} (${upper})`;
}

export interface CountryOption {
  code: string;
  name: string;
}

let allCountriesCache: CountryOption[] | null = null;

/** Every country code the API accepts, sorted by English name. */
export function allCountries(): CountryOption[] {
  if (allCountriesCache) return allCountriesCache;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const options: CountryOption[] = [];
  for (const a of letters) {
    for (const b of letters) {
      const code = a + b;
      if (parseNationality(code) === code) options.push({ code, name: countryName(code) });
    }
  }
  allCountriesCache = options.sort((x, y) => x.name.localeCompare(y.name));
  return allCountriesCache;
}

/**
 * What a patient form saves: the user's pick (`null` = deliberately cleared),
 * or — while the field is untouched (`undefined`) — Malaysia for a valid
 * MyKad IC, mirroring the API's default.
 */
export function effectiveNationality(picked: string | null | undefined, icNumber: string | null | undefined): string | null {
  if (picked !== undefined) return picked;
  return isValidMyKad(icNumber) ? "MY" : null;
}
