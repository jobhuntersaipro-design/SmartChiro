import type { AppointmentStatus, CalendarAppointment } from "@/types/appointment";

export type AppointmentTabId =
  | "all"
  | "today"
  | "upcoming"
  | "completed"
  | "cancelled"
  | "noshow";

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
    return isSameLocalDay(dt, selectedDate);
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

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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
    text: "#635BFF",
    accent: "#635BFF",
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
    bg: "#F1F5F9",
    text: "#64748b",
    accent: "#697386",
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
  const dayStart = new Date(selectedDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const weekStart = new Date(now);
  // Monday-start week to match calendar config
  const dow = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - dow);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  let todayCount = 0;
  let todayRemaining = 0;
  let weekCount = 0;
  let completionCount = 0;
  let nonCancelledCount = 0;

  for (const a of appointments) {
    const dt = new Date(a.dateTime);
    const isToday = dt >= dayStart && dt < dayEnd;
    const isThisWeek = dt >= weekStart && dt < weekEnd;
    if (isToday && a.status !== "CANCELLED") {
      todayCount++;
      if (
        dt.getTime() > now.getTime() &&
        (a.status === "SCHEDULED" || a.status === "CHECKED_IN")
      ) {
        todayRemaining++;
      }
    }
    if (isThisWeek && a.status !== "CANCELLED") weekCount++;
    if (a.status !== "CANCELLED") {
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
