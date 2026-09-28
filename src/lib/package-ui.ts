import { clinicDateKey, clinicDateLabel, clinicTimeLabel } from "@/lib/clinic-time";
import type {
  CarePlanProgressJson,
  OccurrenceCheckJson,
  OccurrenceProblem,
  PackageStatusValue,
  RedemptionSummaryJson,
  TreatmentTypeValue,
} from "@/types/packages";

/**
 * Client-side helpers for the packages / repeat-booking / care-plan screens
 * (Phase 3). Pure — no fetches, no React.
 */

// ─── Repeat rule (booking dialog, care plan dialog) ───

export type RepeatEndMode = "count" | "until";

export interface RepeatFormState {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: number[];
  intervalWeeks: number;
  endMode: RepeatEndMode;
  count: number;
  /** "YYYY-MM-DD", inclusive. */
  until: string;
}

/** The repeat rule the series endpoints take (`count` or `until`). */
export interface RepeatRulePayload {
  weekdays: number[];
  startTime: string;
  intervalWeeks: number;
  startDate: string;
  count?: number;
  until?: string;
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Monday-first order for weekday pickers. */
export const WEEKDAY_PICKER_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const MAX_REPEAT_VISITS = 104;

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Weekday (0 = Sunday) of a "YYYY-MM-DD" calendar day — no time zones involved. */
export function weekdayOfDateKey(dateKey: string): number | null {
  const m = DATE_KEY_RE.exec(dateKey);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCDay();
}

export function defaultRepeatState(dateKey: string, count = 6): RepeatFormState {
  const day = weekdayOfDateKey(dateKey);
  return {
    enabled: false,
    weekdays: day === null ? [] : [day],
    intervalWeeks: 1,
    endMode: "count",
    count,
    until: "",
  };
}

/** Spread N visits a week over the clinic week: 3 → Mon, Wed, Fri. */
export function defaultWeekdaysForVisits(visitsPerWeek: number): number[] {
  const table: Record<number, number[]> = {
    1: [1],
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return table[Math.min(7, Math.max(1, Math.floor(visitsPerWeek) || 1))];
}

export function toggleWeekday(weekdays: number[], day: number): number[] {
  return weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day].sort((a, b) => a - b);
}

/**
 * Turns the repeat form into the API rule, or explains what is missing.
 * The first visit is the chosen date/time; weekdays are clinic days.
 */
export function buildRepeatRule(
  state: RepeatFormState,
  startDate: string,
  startTime: string,
): { ok: true; rule: RepeatRulePayload } | { ok: false; error: string } {
  if (!DATE_KEY_RE.test(startDate)) return { ok: false, error: "Pick the first date." };
  if (!TIME_RE.test(startTime)) return { ok: false, error: "Pick a start time." };
  const weekdays = [...new Set(state.weekdays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  if (weekdays.length === 0) return { ok: false, error: "Choose at least one weekday." };
  const intervalWeeks = Math.floor(state.intervalWeeks);
  if (!Number.isFinite(intervalWeeks) || intervalWeeks < 1 || intervalWeeks > 12) {
    return { ok: false, error: "Repeat every 1 to 12 weeks." };
  }
  const base = { weekdays, startTime, intervalWeeks, startDate };
  if (state.endMode === "count") {
    const count = Math.floor(state.count);
    if (!Number.isFinite(count) || count < 1 || count > MAX_REPEAT_VISITS) {
      return { ok: false, error: `Book between 1 and ${MAX_REPEAT_VISITS} visits.` };
    }
    return { ok: true, rule: { ...base, count } };
  }
  if (!DATE_KEY_RE.test(state.until)) return { ok: false, error: "Pick the end date." };
  if (state.until < startDate) return { ok: false, error: "The end date is before the first visit." };
  return { ok: true, rule: { ...base, until: state.until } };
}

/** "Mon, Wed, Fri · every week · 12 visits" */
export function repeatSummary(rule: RepeatRulePayload): string {
  const days = [...rule.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY_SHORT[d]).join(", ");
  const every = rule.intervalWeeks === 1 ? "every week" : `every ${rule.intervalWeeks} weeks`;
  const end = rule.count ? `${rule.count} ${rule.count === 1 ? "visit" : "visits"}` : `until ${rule.until}`;
  return `${days} · ${every} · ${end}`;
}

// ─── Occurrence problems (preview, series 409s) ───

export const OCCURRENCE_PROBLEM_LABELS: Record<OccurrenceProblem, string> = {
  conflict: "Conflict",
  break: "Break",
  outside_hours: "Outside hours",
  time_off: "Time off",
  past: "Past",
};

/** One line per problem, with the detail the API sent ("Conflict with Adam bin Yusoff"). */
export function describeOccurrenceProblems(occ: Pick<OccurrenceCheckJson, "problems" | "conflicts" | "breakLabel" | "hours">): string[] {
  return occ.problems.map((p) => {
    switch (p) {
      case "conflict": {
        const names = (occ.conflicts ?? []).map((c) => `${c.patient.firstName} ${c.patient.lastName}`);
        return names.length > 0 ? `Conflict with ${names.join(", ")}` : "Conflicts with another booking";
      }
      case "break":
        return occ.breakLabel ? `Doctor's break (${occ.breakLabel})` : "Doctor's break";
      case "outside_hours":
        return occ.hours ? `Outside opening hours (${occ.hours})` : "Outside opening hours";
      case "time_off":
        return "Doctor is on time off";
      case "past":
        return "In the past";
      default:
        return p;
    }
  });
}

/** "Mon, 5 Oct 2026 · 10:00 AM" in clinic time. */
export function occurrenceWhen(iso: string): string {
  const d = new Date(iso);
  return `${clinicDateLabel(d, "day")} · ${clinicTimeLabel(d)}`;
}

/**
 * Whether "Apply anyway" can override the problems of a "this and following"
 * edit: managers (appointment.manageAll) force everything but `past`; a doctor
 * may only push past opening hours.
 */
export function forceOptionFor(
  occurrences: Pick<OccurrenceCheckJson, "problems">[],
  canManageAll: boolean,
): "force" | "outside_hours" | null {
  const problems = occurrences.flatMap((o) => o.problems);
  if (problems.includes("past")) return null;
  if (canManageAll) return "force";
  return problems.length > 0 && problems.every((p) => p === "outside_hours") ? "outside_hours" : null;
}

/** "Booked 11 of 12 — 1 skipped" */
export function seriesBookedMessage(created: number, skipped: number): string {
  const total = created + skipped;
  if (skipped === 0) return `Booked ${created} ${created === 1 ? "visit" : "visits"}`;
  return `Booked ${created} of ${total} — ${skipped} skipped`;
}

// ─── Packages ───

export const PACKAGE_STATUS_STYLE: Record<PackageStatusValue, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-[#E8F7EE] text-[#108c3d]" },
  COMPLETED: { label: "Used up", className: "bg-[#F0EEFF] text-[#533afd]" },
  EXPIRED: { label: "Expired", className: "bg-[#FFF8E1] text-[#9b6829]" },
  CANCELLED: { label: "Cancelled", className: "bg-[#FDE7EC] text-[#DF1B41]" },
};

/** "5 of 12 used" */
export function sessionsUsedLabel(used: number, total: number): string {
  return `${used} of ${total} used`;
}

/** Toast after a visit used a session: "Session 5 of 12 used from 12 Adjustments". */
export function redemptionToast(r: Pick<RedemptionSummaryJson, "sessionsUsed" | "sessionsTotal" | "packageName">): string {
  return `Session ${r.sessionsUsed} of ${r.sessionsTotal} used from ${r.packageName}`;
}

/** Whether a package covers a treatment type (empty list = any). */
export function packageCoversTreatment(treatmentTypes: TreatmentTypeValue[], treatmentType: string | null | undefined): boolean {
  if (treatmentTypes.length === 0) return true;
  return !!treatmentType && (treatmentTypes as string[]).includes(treatmentType);
}

/** "Any treatment" or "Adjustment, Gonstead +2". */
export function treatmentTypesSummary(types: string[], labelFor: (t: string) => string, max = 3): string {
  if (types.length === 0) return "Any treatment";
  const shown = types.slice(0, max).map(labelFor).join(", ");
  return types.length > max ? `${shown} +${types.length - max}` : shown;
}

/** Parses a ringgit amount typed by the user ("1,080" / "1080.5"); null when invalid. */
export function parseRinggit(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "").replace(/^RM/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Deep link to an appointment on the Appointments list (opens its detail panel). */
export function appointmentHref(appointmentId: string, dateTimeIso: string, branchId?: string | null): string {
  const params = new URLSearchParams({
    view: "list",
    tab: "all",
    date: clinicDateKey(new Date(dateTimeIso)),
    appointment: appointmentId,
  });
  if (branchId) params.set("branch", branchId);
  return `/dashboard/appointments?${params.toString()}`;
}

// ─── Care plans ───

export interface CarePlanProgressView {
  completed: number;
  upcoming: number;
  missed: number;
  planned: number;
  /** Planned visits not yet booked (never negative). */
  unbooked: number;
  /** 0–100, share of planned visits completed / booked ahead. */
  completedPct: number;
  upcomingPct: number;
}

export function carePlanProgressView(p: CarePlanProgressJson): CarePlanProgressView {
  const planned = Math.max(0, p.planned);
  const pct = (n: number) => (planned === 0 ? 0 : Math.min(100, Math.round((n / planned) * 100)));
  const completedPct = pct(p.completed);
  return {
    completed: p.completed,
    upcoming: p.upcoming,
    missed: p.noShow,
    planned,
    unbooked: Math.max(0, planned - p.completed - p.upcoming),
    completedPct,
    upcomingPct: Math.max(0, Math.min(100 - completedPct, pct(p.upcoming))),
  };
}
