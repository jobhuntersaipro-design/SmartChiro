/** Branch form field helpers shared by the branch dialogs, settings tab and API. Client-safe. */

export type WebsiteResult = { ok: true; value: string | null } | { ok: false; error: string };

/**
 * Empty (or a bare "https://") → null. A host typed without a scheme gets
 * "https://"; http(s) URLs are kept as typed.
 */
export function normalizeWebsite(input: string | null | undefined): WebsiteResult {
  const raw = (input ?? "").trim();
  if (!raw || /^https?:\/\/$/i.test(raw)) return { ok: true, value: null };

  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw);
  if (hasScheme && !/^https?:\/\//i.test(raw)) {
    return { ok: false, error: "Website must be an http:// or https:// address" };
  }
  const candidate = hasScheme ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (/\s/.test(raw) || !url.hostname.includes(".")) throw new Error("no host");
  } catch {
    return { ok: false, error: "Enter a web address like www.example.com" };
  }
  return { ok: true, value: candidate };
}

/** Stored clinic type values (lowercase); labels come from `formatClinicType`. */
export const CLINIC_TYPE_OPTIONS = ["solo", "group", "franchise"] as const;

/** "group" → "Group", "multi_location" → "Multi Location". Display only; the stored value is unchanged. */
export function formatClinicType(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split("-")
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
        .join("-"),
    )
    .join(" ");
}
