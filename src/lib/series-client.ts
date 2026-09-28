import { seriesBookedMessage } from "@/lib/package-ui";
import type { OccurrenceCheckJson } from "@/types/packages";

/** Browser calls for recurring series (Phase 3): book a series, edit "this and following". */

export interface BookSeriesBody {
  branchId: string;
  doctorId: string;
  patientId: string;
  weekdays: number[];
  startTime: string;
  intervalWeeks: number;
  startDate: string;
  count?: number;
  until?: string;
  duration: number;
  treatmentType?: string;
  room?: string;
  notes?: string;
  skipProblemDates: boolean;
  patientPackageId?: string;
  carePlanId?: string;
}

export type BookSeriesResult =
  | { ok: true; created: number; skipped: number; message: string }
  | { ok: false; message: string; problems: OccurrenceCheckJson[] | null };

export async function bookSeries(body: BookSeriesBody, fetchImpl: typeof fetch = fetch): Promise<BookSeriesResult> {
  try {
    const res = await fetchImpl("/api/appointment-series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      created?: unknown[];
      skipped?: unknown[];
      occurrences?: OccurrenceCheckJson[];
      message?: string;
    };
    if (res.ok && data.created) {
      const created = data.created.length;
      const skipped = data.skipped?.length ?? 0;
      return { ok: true, created, skipped, message: seriesBookedMessage(created, skipped) };
    }
    return {
      ok: false,
      message: data.message ?? "Couldn't book the visits.",
      problems: data.occurrences ?? null,
    };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Check the connection.", problems: null };
  }
}

/** A later occurrence that can't take the change (409 `series_problems`). */
export interface FollowingProblem extends OccurrenceCheckJson {
  appointmentId: string;
  seriesIndex: number | null;
}

export interface FollowingBody {
  dateTime?: string;
  doctorId?: string;
  duration?: number;
  status?: "CANCELLED";
  force?: boolean;
  forceOutsideHours?: boolean;
}

export type FollowingResult =
  | { ok: true; count: number }
  | { ok: false; message: string; problems: FollowingProblem[] | null };

/** PATCH /api/appointments/[id]?scope=following — this and every later booked occurrence. */
export async function patchFollowing(
  appointmentId: string,
  body: FollowingBody,
  fetchImpl: typeof fetch = fetch,
): Promise<FollowingResult> {
  try {
    const res = await fetchImpl(`/api/appointments/${appointmentId}?scope=following`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      count?: number;
      message?: string;
      error?: string;
      occurrences?: FollowingProblem[];
    };
    if (res.ok) return { ok: true, count: data.count ?? 0 };
    return {
      ok: false,
      message: data.message ?? data.error ?? `Couldn't update the series (${res.status}).`,
      problems: data.error === "series_problems" ? data.occurrences ?? [] : null,
    };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Check the connection.", problems: null };
  }
}

/** "Updated 6 appointments" */
export function followingUpdatedMessage(count: number, cancelled = false): string {
  const noun = count === 1 ? "appointment" : "appointments";
  return cancelled ? `Cancelled ${count} ${noun}` : `Updated ${count} ${noun}`;
}
