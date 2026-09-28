import { clinicDateKey, clinicInstant, clinicParts, clinicTimeInput } from "@/lib/clinic-time";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Default start for a new booking: the next half hour today (walk-ins), or
 * 09:00 tomorrow once the evening is over. A prefilled ISO time wins.
 */
export function defaultStart(prefilledIso?: string | null, now: Date = new Date()): { date: string; time: string } {
  // Clinic wall clock (Asia/Kuala_Lumpur), whatever the device's time zone.
  if (prefilledIso && !Number.isNaN(new Date(prefilledIso).getTime())) {
    const d = new Date(prefilledIso);
    return { date: clinicDateKey(d), time: clinicTimeInput(d) };
  }
  const p = clinicParts(now);
  let hour = p.hour;
  const minute = p.minute <= 30 ? 30 : 0;
  if (minute === 0) hour += 1;
  if (hour >= 20) {
    return { date: clinicDateKey(clinicInstant(p.year, p.month, p.day + 1, 12)), time: "09:00" };
  }
  return { date: clinicDateKey(now), time: `${pad(hour)}:${pad(minute)}` };
}
