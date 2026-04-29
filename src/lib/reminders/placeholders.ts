export const ALLOWED_PLACEHOLDERS = [
  "patientName",
  "firstName",
  "lastName",
  "date",
  "time",
  "dayOfWeek",
  "doctorName",
  "branchName",
  "branchAddress",
  "branchPhone",
] as const;

export type PlaceholderName = (typeof ALLOWED_PLACEHOLDERS)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_PLACEHOLDERS);

export function isAllowedPlaceholder(name: string): name is PlaceholderName {
  return ALLOWED_SET.has(name);
}

/** Returns all `{name}` tokens found in a template string. */
export function extractPlaceholders(tpl: string): string[] {
  const re = /\{(\w+)\}/g;
  const out: string[] = [];
  for (const m of tpl.matchAll(re)) out.push(m[1]);
  return out;
}
