import type { AppointmentCounts } from "@/types/reports";

/** numerator ÷ denominator, or null when the denominator is 0 (no "0%" out of nothing). */
export function rate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

/** "12.5%" (one decimal, trailing ".0" dropped), or "—" for a rate that has no denominator. */
export function formatRate(value: number | null): string {
  if (value === null) return "—";
  const pct = Math.round(value * 1000) / 10;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

/** Appointment count per status, as grouped by the database. */
export interface StatusCount {
  status: string;
  count: number;
}

const OPEN = new Set(["SCHEDULED", "CHECKED_IN", "IN_PROGRESS"]);

/**
 * Booked = every appointment in the range; no-show rate = no-show ÷
 * (completed + no-show) — of the visits that were due, how many were missed;
 * cancellation rate = cancelled ÷ booked.
 */
export function appointmentCounts(rows: StatusCount[]): AppointmentCounts {
  let booked = 0;
  let completed = 0;
  let cancelled = 0;
  let noShow = 0;
  let open = 0;
  for (const { status, count } of rows) {
    booked += count;
    if (status === "COMPLETED") completed += count;
    else if (status === "CANCELLED") cancelled += count;
    else if (status === "NO_SHOW") noShow += count;
    else if (OPEN.has(status)) open += count;
  }
  return {
    booked,
    completed,
    cancelled,
    noShow,
    open,
    noShowRate: rate(noShow, completed + noShow),
    cancellationRate: rate(cancelled, booked),
  };
}
