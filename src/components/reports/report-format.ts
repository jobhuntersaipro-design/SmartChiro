import { formatMYR } from "@/lib/invoices";
import { formatDayKey } from "@/lib/reports/range";

export { formatMYR };
export { formatRate } from "@/lib/reports/rates";

/** "RM 1.2k" / "RM 850" — for chart axes and bar-end labels where space is tight. */
export function compactMYR(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}RM ${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}RM ${trim(abs / 1_000)}k`;
  return `${sign}RM ${Math.round(abs)}`;
}

function trim(n: number): string {
  return n >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "");
}

/** Minutes as hours with one decimal: "37.5 h". */
export function formatHours(minutes: number): string {
  return `${(Math.round((minutes / 60) * 10) / 10).toLocaleString("en-MY")} h`;
}

/** Minutes as a plain hours number for CSV ("37.5"). */
export function hoursNumber(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-MY");
}

/** "03/08" for axis ticks. */
export function formatDayShort(key: string): string {
  return formatDayKey(key).slice(0, 5);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}
