import type { Granularity, TrendPoint } from "@/types/reports";
import { addDaysToKey, keyToDayNumber, mondayOf, type DayRange } from "@/lib/reports/range";

/** Ranges up to this many days are charted per day, longer ones per Monday-start week. */
export const DAILY_BUCKET_MAX_DAYS = 45;

export function granularityFor(days: number): Granularity {
  return days <= DAILY_BUCKET_MAX_DAYS ? "day" : "week";
}

export interface Bucket {
  key: string;
  /** First and last day of the bucket, clipped to the range. */
  from: string;
  to: string;
}

/** Every bucket in the range, in order — empty days/weeks included so the axis has no gaps. */
export function bucketsFor(range: DayRange, granularity: Granularity): Bucket[] {
  const out: Bucket[] = [];
  const last = keyToDayNumber(range.to)!;
  if (granularity === "day") {
    for (let key = range.from; keyToDayNumber(key)! <= last; key = addDaysToKey(key, 1)) {
      out.push({ key, from: key, to: key });
    }
    return out;
  }
  for (let monday = mondayOf(range.from); keyToDayNumber(monday)! <= last; monday = addDaysToKey(monday, 7)) {
    const sunday = addDaysToKey(monday, 6);
    out.push({
      key: monday,
      from: monday < range.from ? range.from : monday,
      to: keyToDayNumber(sunday)! > last ? range.to : sunday,
    });
  }
  return out;
}

/** The bucket key a clinic day falls in. */
export function bucketKeyFor(dayKey: string, granularity: Granularity): string {
  return granularity === "day" ? dayKey : mondayOf(dayKey);
}

/** Money in sen (integers), so sums never pick up floating-point drift. */
export interface DailyMoney {
  day: string;
  collectedSen: number;
  invoicedSen: number;
}

/**
 * Collected vs invoiced per bucket. Days outside the range are ignored; empty
 * buckets are zero.
 */
export function buildTrend(range: DayRange, days: DailyMoney[], granularity: Granularity): TrendPoint[] {
  const buckets = bucketsFor(range, granularity);
  const sums = new Map(buckets.map((b) => [b.key, { collected: 0, invoiced: 0 }]));
  for (const d of days) {
    if (d.day < range.from || d.day > range.to) continue;
    const sum = sums.get(bucketKeyFor(d.day, granularity));
    if (!sum) continue;
    sum.collected += d.collectedSen;
    sum.invoiced += d.invoicedSen;
  }
  return buckets.map((b) => {
    const s = sums.get(b.key)!;
    return { ...b, collected: s.collected / 100, invoiced: s.invoiced / 100 };
  });
}
