export type AppointmentStatus = "SCHEDULED" | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export interface StatusAction {
  status: AppointmentStatus;
  label: string;
  tone: "primary" | "success" | "danger";
}

const CHECK_IN: StatusAction = { status: "CHECKED_IN", label: "Check in", tone: "primary" };
const START: StatusAction = { status: "IN_PROGRESS", label: "Start", tone: "primary" };
const COMPLETE: StatusAction = { status: "COMPLETED", label: "Complete", tone: "success" };
const NO_SHOW: StatusAction = { status: "NO_SHOW", label: "No-show", tone: "danger" };

/**
 * The one-click steps that make sense next at the front desk / in the room.
 * No-show is only offered once the start time has passed, and a no-show can
 * still be checked in if the patient turns up late.
 */
export function nextStatusActions(
  status: AppointmentStatus,
  startsAt: Date,
  now: Date = new Date(),
): StatusAction[] {
  const started = now.getTime() >= startsAt.getTime();
  switch (status) {
    case "SCHEDULED":
      return started ? [CHECK_IN, START, NO_SHOW] : [CHECK_IN, START];
    case "CHECKED_IN":
      return [START, COMPLETE];
    case "IN_PROGRESS":
      return [COMPLETE];
    case "NO_SHOW":
      return [{ ...CHECK_IN, label: "Arrived late — check in" }];
    default:
      return [];
  }
}

const SUCCESS: Record<AppointmentStatus, string> = {
  SCHEDULED: "Appointment rescheduled",
  CHECKED_IN: "Checked in",
  IN_PROGRESS: "Appointment started",
  COMPLETED: "Appointment completed",
  CANCELLED: "Appointment cancelled",
  NO_SHOW: "Marked as no-show",
};

const ERRORS: Record<string, string> = {
  forbidden: "You can only update your own appointments.",
  forbidden_past_edit: "You can only change the status of this past appointment.",
  not_found: "This appointment no longer exists.",
  unauthorized: "Your session expired — sign in again.",
};

/** PATCH the status; resolves with a message for a toast. */
export async function changeAppointmentStatus(
  appointmentId: string,
  status: AppointmentStatus,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetchImpl(`/api/appointments/${appointmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) return { ok: true, message: SUCCESS[status] };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, message: (body.error && ERRORS[body.error]) ?? "Couldn't update the appointment." };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Check the connection." };
  }
}
