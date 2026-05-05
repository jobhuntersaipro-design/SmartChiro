"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DoctorCombobox } from "@/components/patients/DoctorCombobox";
import { formatAppointmentDateTime } from "@/lib/format";

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
  patient: { id: string; firstName: string; lastName: string };
  doctor: { id: string; name: string };
  branchId: string;
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
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${HH}:${MM}` };
}

function inputsToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const [y, m, d] = date.split("-").map((s) => parseInt(s, 10));
  const [hh, mm] = time.split(":").map((s) => parseInt(s, 10));
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);

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

  if (!appointmentId) return null;

  const iso = inputsToIso(date, time);
  const isPast = iso ? new Date(iso).getTime() < Date.now() : false;
  const canSave = !!iso && !isPast && conflicts.length === 0 && !submitting;

  async function submit() {
    if (!appointmentId || !iso) return;
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {};
      if (appt && iso !== appt.dateTime) body.dateTime = iso;
      if (appt && duration !== appt.duration) body.duration = duration;
      if (isAdmin && doctor && appt && doctor.id !== appt.doctor.id) body.doctorId = doctor.id;
      if (isAdmin && appt && status !== appt.status) body.status = status;
      if (appt && (notes ?? "") !== (appt.notes ?? "")) body.notes = notes;

      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
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

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[480px] max-h-[90vh] overflow-y-auto rounded-[8px] border border-[#e5edf5] bg-white p-6"
        style={{ boxShadow: "0 12px 40px rgba(18,42,66,0.15)" }}
      >
        <h2 className="text-[18px] font-medium text-[#0A2540] mb-1">Edit appointment</h2>
        {appt && (
          <p className="text-[13px] text-[#64748d] mb-4">
            {appt.patient.firstName} {appt.patient.lastName}
          </p>
        )}

        {loading && (
          <div className="flex items-center gap-2 py-6 text-[13px] text-[#64748d]">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> Loading…
          </div>
        )}

        {!loading && appt && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[12px] font-medium text-[#425466] mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-9 rounded-[4px] border border-[#e5edf5] bg-white px-2 text-[14px] text-[#061b31] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#425466] mb-1">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full h-9 rounded-[4px] border border-[#e5edf5] bg-white px-2 text-[14px] text-[#061b31] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-[12px] font-medium text-[#425466] mb-1">
                Duration (minutes)
              </label>
              <input
                type="number"
                min={15}
                max={180}
                step={15}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value || "30", 10))}
                className="w-full h-9 rounded-[4px] border border-[#e5edf5] bg-white px-2 text-[14px] text-[#061b31] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
              />
            </div>

            {isAdmin && (
              <div className="mb-4">
                <label className="block text-[12px] font-medium text-[#425466] mb-1">Doctor</label>
                <DoctorCombobox value={doctor} onChange={setDoctor} />
              </div>
            )}

            {isAdmin && (
              <div className="mb-4">
                <label className="block text-[12px] font-medium text-[#425466] mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full h-9 rounded-[4px] border border-[#e5edf5] bg-white px-2 text-[14px] text-[#061b31] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#94a3b8] mt-1">
                  Cancel via the discrete Cancel action.
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-[12px] font-medium text-[#425466] mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-[4px] border border-[#e5edf5] bg-white px-2 py-1.5 text-[14px] text-[#061b31] focus:outline-none focus:ring-1 focus:ring-[#533afd]"
              />
            </div>

            {isPast && (
              <div className="mb-3 rounded-[4px] bg-[#FDE7EC] px-3 py-2 text-[13px] text-[#DF1B41] inline-flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" strokeWidth={2} />
                <span>Selected time is in the past.</span>
              </div>
            )}

            {conflicts.length > 0 && (
              <div className="mb-3 rounded-[4px] bg-[#FDE7EC] border border-[#DF1B41]/20 px-3 py-2 text-[13px] text-[#DF1B41]">
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
              <div className="mb-3 rounded-[4px] bg-[#FDE7EC] px-3 py-2 text-[13px] text-[#DF1B41]">
                {error}
              </div>
            )}

            <p className="text-[11px] text-[#94a3b8] mb-3">Your local time · {tz}</p>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={submitting} className="h-8 rounded-[4px] text-[14px]">
                Cancel
              </Button>
              <Button onClick={submit} disabled={!canSave} className="h-8 rounded-[4px] text-[14px] gap-1.5">
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
