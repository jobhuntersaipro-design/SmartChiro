"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DoctorCombobox } from "@/components/patients/DoctorCombobox";
import { formatAppointmentDateTime } from "@/lib/format";
import { clinicDateKey, clinicInstantFromInputs, clinicTimeInput } from "@/lib/clinic-time";
import { DateInput } from "@/components/ui/date-input";
import { toast } from "sonner";
import { SeriesScopeDialog, type SeriesScope } from "@/components/packages/SeriesScope";
import { useFollowingEdit } from "@/components/packages/useFollowingEdit";
import { followingUpdatedMessage } from "@/lib/series-client";

interface Props {
  appointmentId: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

interface AppointmentDetail {
  id: string;
  dateTime: string;
  duration: number;
  status: string;
  notes: string | null;
  room?: string | null;
  patient: { id: string; firstName: string; lastName: string };
  doctor: { id: string; name: string };
  branchId: string;
  seriesId?: string | null;
}

interface ConflictItem {
  id: string;
  dateTime: string;
  duration: number;
  patient: { firstName: string; lastName: string };
}

const STATUSES = [
  "SCHEDULED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "NO_SHOW",
] as const;

function isoToInputs(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return { date: clinicDateKey(d), time: clinicTimeInput(d) };
}

/** Date + time inputs are clinic wall-clock time, not the device's zone. */
function inputsToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const dt = clinicInstantFromInputs(date, time);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

export function EditAppointmentDialog({
  appointmentId,
  isAdmin,
  onClose,
  onUpdated,
}: Props) {
  const [appt, setAppt] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(30);
  const [doctor, setDoctor] = useState<{ id: string; name: string } | null>(null);
  const [status, setStatus] = useState<string>("SCHEDULED");
  const [notes, setNotes] = useState("");
  const [room, setRoom] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [scopeOpen, setScopeOpen] = useState(false);
  const following = useFollowingEdit(isAdmin);

  useEffect(() => {
    if (!appointmentId) {
      setAppt(null);
      return;
    }
    setLoading(true);
    fetch(`/api/appointments/${appointmentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.appointment) return;
        const a: AppointmentDetail = data.appointment;
        setAppt(a);
        const { date: d, time: t } = isoToInputs(a.dateTime);
        setDate(d);
        setTime(t);
        setDuration(a.duration);
        setDoctor(a.doctor);
        setStatus(a.status);
        setNotes(a.notes ?? "");
        setRoom(a.room ?? "");
      })
      .finally(() => setLoading(false));
  }, [appointmentId]);

  // Live conflict preview (debounced)
  useEffect(() => {
    if (!doctor || !date || !time) {
      setConflicts([]);
      return;
    }
    const iso = inputsToIso(date, time);
    if (!iso) return;
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/appointments/check-conflict?doctorId=${doctor.id}&dateTime=${encodeURIComponent(iso)}&duration=${duration}${appointmentId ? `&excludeId=${appointmentId}` : ""}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setConflicts(data?.conflicts ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [doctor, date, time, duration, appointmentId]);

  useEffect(() => {
    if (!appointmentId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [appointmentId, onClose]);

  if (!appointmentId) return null;

  const iso = inputsToIso(date, time);
  const isPast = iso ? new Date(iso).getTime() < Date.now() : false;
  const canSave = !!iso && !isPast && conflicts.length === 0 && !submitting;

  async function submit(scope?: SeriesScope) {
    if (!appointmentId || !iso) return;
    setError(null);
    const body: Record<string, unknown> = {};
    if (appt && iso !== appt.dateTime) body.dateTime = iso;
    if (appt && duration !== appt.duration) body.duration = duration;
    if (isAdmin && doctor && appt && doctor.id !== appt.doctor.id) body.doctorId = doctor.id;
    if (isAdmin && appt && status !== appt.status) body.status = status;
    if (appt && (notes ?? "") !== (appt.notes ?? "")) body.notes = notes;
    if (appt && room.trim() !== (appt.room ?? "")) body.room = room.trim() || null;

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    // A series visit whose time / doctor / length changes: ask which visits it applies to.
    const seriesFields = ["dateTime", "duration", "doctorId"].filter((k) => k in body);
    if (appt?.seriesId && seriesFields.length > 0 && !scope) {
      setScopeOpen(true);
      return;
    }
    if (scope === "following") return submitFollowing(body, seriesFields);
    setSubmitting(true);
    try {

      const patch = (extra: Record<string, unknown> = {}) =>
        fetch(`/api/appointments/${appointmentId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, ...extra }),
        });
      let res = await patch();
      if (res.status === 409) {
        const data = await res.clone().json().catch(() => ({}));
        if (data?.error === "outside_hours_confirm_required") {
          const hours = data.hours ? ` (${data.hours})` : "";
          if (!window.confirm(`This time is outside the branch's opening hours${hours}. Save anyway?`)) return;
          res = await patch({ forceOutsideHours: true });
        }
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data?.conflicts) {
          setConflicts(data.conflicts as ConflictItem[]);
          setError("This time conflicts with an existing appointment. Pick a different time.");
        } else if (res.status === 422 && data?.error === "past_datetime") {
          setError("Cannot reschedule to a time in the past.");
        } else {
          setError(data?.error ?? `Save failed (${res.status})`);
        }
        return;
      }
      onUpdated();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  /** Time / doctor / length go to every later visit; other edits stay on this one. */
  async function submitFollowing(body: Record<string, unknown>, seriesFields: string[]) {
    if (!appointmentId) return;
    const rest = Object.fromEntries(Object.entries(body).filter(([k]) => !seriesFields.includes(k)));
    const shared = Object.fromEntries(seriesFields.map((k) => [k, body[k]]));
    setSubmitting(true);
    try {
      if (Object.keys(rest).length > 0) {
        const res = await fetch(`/api/appointments/${appointmentId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(rest),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data?.message ?? data?.error ?? `Save failed (${res.status})`);
          return;
        }
      }
      const outcome = await following.run(appointmentId, shared);
      if (!outcome.ok) {
        if (!outcome.dismissed) setError(outcome.message);
        return;
      }
      toast.success(followingUpdatedMessage(outcome.count));
      onUpdated();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-appointment-title"
        onClick={(e) => e.stopPropagation()}
        className="w-120 max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-white p-6"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <h2 id="edit-appointment-title" className="text-[18px] font-medium text-foreground mb-1">Edit appointment</h2>
        {appt && (
          <p className="text-[13px] text-fg-secondary mb-4">
            {appt.patient.firstName} {appt.patient.lastName}
          </p>
        )}

        {loading && (
          <div className="flex items-center gap-2 py-6 text-[13px] text-fg-secondary">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> Loading…
          </div>
        )}

        {!loading && appt && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label htmlFor="edit-appointment-date" className="block text-[12px] font-medium text-fg-secondary mb-1">Date</label>
                <DateInput
                  id="edit-appointment-date"
                  value={date}
                  onChange={setDate}
                  inputClassName="w-full h-9 rounded-md border border-border bg-white px-2 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label htmlFor="edit-appointment-time" className="block text-[12px] font-medium text-fg-secondary mb-1">Time</label>
                <input
                  id="edit-appointment-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-white px-2 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="edit-appointment-duration" className="block text-[12px] font-medium text-fg-secondary mb-1">
                Duration (minutes)
              </label>
              <input
                id="edit-appointment-duration"
                type="number"
                min={15}
                max={180}
                step={15}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value || "30", 10))}
                className="w-full h-9 rounded-md border border-border bg-white px-2 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            {isAdmin && (
              <div className="mb-4">
                <label className="block text-[12px] font-medium text-fg-secondary mb-1">Doctor</label>
                <DoctorCombobox value={doctor} onChange={setDoctor} branchId={appt.branchId} />
              </div>
            )}

            {isAdmin && (
              <div className="mb-4">
                <label htmlFor="edit-appointment-status" className="block text-[12px] font-medium text-fg-secondary mb-1">Status</label>
                <select
                  id="edit-appointment-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-white px-2 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-fg-muted mt-1">
                  Cancel via the discrete Cancel action.
                </p>
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="edit-appointment-room" className="block text-[12px] font-medium text-fg-secondary mb-1">Room (optional)</label>
              <input
                id="edit-appointment-room"
                type="text"
                value={room}
                maxLength={60}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="e.g. Room 2"
                className="w-full h-9 rounded-md border border-border bg-white px-2 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            <div className="mb-4">
              <label htmlFor="edit-appointment-notes" className="block text-[12px] font-medium text-fg-secondary mb-1">Notes</label>
              <textarea
                id="edit-appointment-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            {isPast && (
              <div className="mb-3 rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-danger inline-flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" strokeWidth={2} />
                <span>Selected time is in the past.</span>
              </div>
            )}

            {conflicts.length > 0 && (
              <div className="mb-3 rounded-md bg-danger-subtle border border-danger/20 px-3 py-2 text-[13px] text-danger">
                <div className="flex items-center gap-1.5 font-medium mb-1">
                  <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
                  Conflicts with existing appointment
                  {conflicts.length > 1 ? "s" : ""}:
                </div>
                <ul className="space-y-0.5 pl-5 list-disc">
                  {conflicts.map((c) => (
                    <li key={c.id}>
                      {c.patient.firstName} {c.patient.lastName} —{" "}
                      <span className="tabular-nums">{formatAppointmentDateTime(c.dateTime)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && !conflicts.length && (
              <div className="mb-3 rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-danger">
                {error}
              </div>
            )}

            <p className="text-[11px] text-fg-muted mb-3">Your local time · {tz}</p>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={submitting} className="h-8 rounded-md text-[14px]">
                Cancel
              </Button>
              <Button onClick={() => submit()} disabled={!canSave} className="h-8 rounded-md text-[14px] gap-1.5">
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </>
        )}
      </div>
      <SeriesScopeDialog
        open={scopeOpen}
        title="Edit recurring appointment"
        verb="Shift"
        onClose={() => setScopeOpen(false)}
        onChoose={(scope) => {
          setScopeOpen(false);
          void submit(scope);
        }}
      />
      {following.dialog}
    </div>
  );
}
