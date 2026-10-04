import type { AppointmentStatus, CalendarAppointment } from "@/types/appointment";
import { clinicDateKey, clinicDayBounds, clinicInstant, clinicParts } from "@/lib/clinic-time";

export type AppointmentTabId =
  | "all"
  | "today"
  | "upcoming"
  | "completed"
  | "cancelled"
  | "noshow";

/**
 * A day's appointments everywhere (Today tab, its badge, stat cards, the
 * dashboard): every booking that day except cancelled and no-show ones.
 */
export const OFF_THE_DAY_STATUSES: readonly AppointmentStatus[] = ["CANCELLED", "NO_SHOW"];

export interface AppointmentCounts {
  all: number;
  today: number;
  upcoming: number;
  completed: number;
  cancelled: number;
  noshow: number;
  /** SCHEDULED + dateTime in the past — surfaced in stat cards but not as a tab. */
  stale?: number;
}

/**
 * Pure tab filter — accepts an appointment and the current tab/date and decides
 * whether the appointment belongs in that tab.
 *
 * `now` and `selectedDate` are passed in so unit tests can fix time deterministically
 * and so SSR/CSR agree on midnight-boundary behavior.
 */
export function appointmentMatchesTab(
  appt: Pick<CalendarAppointment, "dateTime" | "status">,
  tab: AppointmentTabId,
  now: Date,
  selectedDate: Date,
  options: { showCancelled?: boolean; showNoShow?: boolean } = {}
): boolean {
  const dt = new Date(appt.dateTime);

  if (tab === "today") {
    if (!isSameLocalDay(dt, selectedDate)) return false;
    if (appt.status === "CANCELLED") return !!options.showCancelled;
    if (appt.status === "NO_SHOW") return !!options.showNoShow;
    return true;
  }
  if (tab === "upcoming") {
    return (
      dt.getTime() > now.getTime() &&
      (appt.status === "SCHEDULED" ||
        appt.status === "CHECKED_IN" ||
        appt.status === "IN_PROGRESS")
    );
  }
  if (tab === "completed") return appt.status === "COMPLETED";
  if (tab === "cancelled") return appt.status === "CANCELLED";
  if (tab === "noshow") return appt.status === "NO_SHOW";

  // tab === "all" — respects show-cancelled / show-noshow toggles
  if (appt.status === "CANCELLED" && !options.showCancelled) return false;
  if (appt.status === "NO_SHOW" && !options.showNoShow) return false;
  return true;
}

/** Same clinic day (Asia/Kuala_Lumpur), whatever the device's time zone. */
function isSameLocalDay(a: Date, b: Date): boolean {
  return clinicDateKey(a) === clinicDateKey(b);
}

/**
 * Per-status visual tokens used by the appointment card, status pill, and accent bar.
 * Keep in sync with the spec §4.7 status palette and existing AppointmentEventPopover.
 */
export const STATUS_TOKENS: Record<
  AppointmentStatus,
  { bg: string; text: string; accent: string; label: string; pulse?: boolean }
> = {
  SCHEDULED: {
    bg: "#EEF2FF",
    text: "#7747ff",
    accent: "#7747ff",
    label: "Scheduled",
    pulse: true,
  },
  CHECKED_IN: {
    bg: "#ECFDF5",
    text: "#15BE53",
    accent: "#15BE53",
    label: "Checked in",
  },
  IN_PROGRESS: {
    bg: "#FFF7ED",
    text: "#9b6829",
    accent: "#F5A623",
    label: "In progress",
    pulse: true,
  },
  COMPLETED: {
    bg: "#ECFDF5",
    text: "#108c3d",
    accent: "#30B130",
    label: "Completed",
  },
  CANCELLED: {
    bg: "#FEF2F2",
    text: "#DF1B41",
    accent: "#DF1B41",
    label: "Cancelled",
  },
  NO_SHOW: {
    bg: "#f1f1f1",
    text: "#585858",
    accent: "#7d7d7d",
    label: "No show",
  },
};

/**
 * Stat card derivation from an in-memory appointment array.
 *
 * `selectedDate` controls the "Today" interpretation (it's actually "selected day"),
 * and `now` is needed for the upcoming filter.
 */
export function deriveStats(
  appointments: Pick<
    CalendarAppointment,
    "dateTime" | "status" | "duration"
  >[],
  doctorIds: string[],
  now: Date = new Date(),
  selectedDate: Date = new Date()
): {
  todayCount: number;
  todayRemaining: number;
  weekCount: number;
  uniqueDoctors: number;
  completionCount: number;
  totalForCompletionRate: number;
} {
  const { start: dayStart, end: dayEnd } = clinicDayBounds(clinicDateKey(selectedDate));

  // Monday-start clinic week to match calendar config
  const p = clinicParts(now);
  const dow = (p.weekday + 6) % 7;
  const weekStart = clinicInstant(p.year, p.month, p.day - dow);
  const weekEnd = clinicInstant(p.year, p.month, p.day - dow + 7);

  let todayCount = 0;
  let todayRemaining = 0;
  let weekCount = 0;
  let completionCount = 0;
  let nonCancelledCount = 0;

  for (const a of appointments) {
    const dt = new Date(a.dateTime);
    const isToday = dt >= dayStart && dt < dayEnd;
    const isThisWeek = dt >= weekStart && dt < weekEnd;
    if (isToday && !OFF_THE_DAY_STATUSES.includes(a.status)) {
      todayCount++;
      // A checked-in or in-progress patient is still on the day's list even
      // once their slot has started; a SCHEDULED one only until its start.
      const inClinic = a.status === "CHECKED_IN" || a.status === "IN_PROGRESS";
      if (inClinic || (a.status === "SCHEDULED" && dt.getTime() > now.getTime())) {
        todayRemaining++;
      }
    }
    if (isThisWeek && !OFF_THE_DAY_STATUSES.includes(a.status)) weekCount++;
    // Completion rate: visits whose time has come (future bookings can't be
    // completed yet), cancelled ones left out.
    const finished = a.status === "COMPLETED" || a.status === "NO_SHOW";
    if (a.status !== "CANCELLED" && (finished || dt.getTime() <= now.getTime())) {
      nonCancelledCount++;
      if (a.status === "COMPLETED") completionCount++;
    }
  }

  return {
    todayCount,
    todayRemaining,
    weekCount,
    uniqueDoctors: doctorIds.length,
    completionCount,
    totalForCompletionRate: nonCancelledCount,
  };
}
