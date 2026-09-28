import { clinicDateLabel, clinicParts, clinicTimeLabel } from "@/lib/clinic-time";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "28/09/2026" in clinic time. */
export function portalDate(iso: string): string {
  return clinicDateLabel(new Date(iso), "numeric");
}

/** "Mon, 28/09/2026" in clinic time. */
export function portalDay(iso: string): string {
  const d = new Date(iso);
  return `${WEEKDAYS[clinicParts(d).weekday]}, ${clinicDateLabel(d, "numeric")}`;
}

/** "9:30 AM" in clinic time. */
export function portalTime(iso: string): string {
  return clinicTimeLabel(new Date(iso));
}

