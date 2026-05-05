"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PatientCombobox } from "@/components/patients/PatientCombobox";
import { DoctorCombobox } from "@/components/patients/DoctorCombobox";
import { formatAppointmentDateTime } from "@/lib/format";

interface Props {
  open: boolean;
  isAdmin: boolean;
  currentUserId: string;
  prefilledPatient?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
  } | null;
  prefilledDoctor?: { id: string; name: string } | null;
  onClose: () => void;
  onCreated: () => void;
}

interface ConflictItem {
  id: string;
  dateTime: string;
  duration: number;
  patient: { firstName: string; lastName: string };
}

interface PatientOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function inputsToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const [y, m, d] = date.split("-").map((s) => parseInt(s, 10));
  const [hh, mm] = time.split(":").map((s) => parseInt(s, 10));
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

export function CreateAppointmentDialog({
  open,
  isAdmin,
  currentUserId,
  prefilledPatient,
  prefilledDoctor,
  onClose,
  onCreated,
}: Props) {
  const [patient, setPatient] = useState<PatientOption | null>(null);
  const [doctor, setDoctor] = useState<{ id: string; name: string } | null>(null);
  const [date, setDate] = useState(defaultDate());
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);

  // Initialize from prefills when the dialog opens
  useEffect(() => {
    if (!open) return;
    setPatient(
      prefilledPatient
        ? {
            id: prefilledPatient.id,
            firstName: prefilledPatient.firstName,
            lastName: prefilledPatient.lastName,
            email: prefilledPatient.email ?? null,
            phone: prefilledPatient.phone ?? null,
          }
        : null,
    );
    setDoctor(prefilledDoctor ?? null);
    setDate(defaultDate());
    setTime("10:00");
    setDuration(30);
    setNotes("");
    setError(null);
    setConflicts([]);
  }, [open, prefilledPatient, prefilledDoctor]);

  // Doctors who are not admins can only book for themselves — auto-pin
  useEffect(() => {
    if (!isAdmin && open && currentUserId && !doctor) {
      // Without admin rights, the user must be the doctor themselves.
      setDoctor({ id: currentUserId, name: "Me" });
    }
  }, [isAdmin, open, currentUserId, doctor]);

  // Live conflict preview
  useEffect(() => {
    if (!doctor || !date || !time) {
      setConflicts([]);
      return;
    }
    const iso = inputsToIso(date, time);
    if (!iso) return;
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/appointments/check-conflict?doctorId=${doctor.id}&dateTime=${encodeURIComponent(iso)}&duration=${duration}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setConflicts(data?.conflicts ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [doctor, date, time, duration]);

  if (!open) return null;

  const iso = inputsToIso(date, time);
  const isPast = iso ? new Date(iso).getTime() < Date.now() : false;
  const canSave =
    !!patient && !!doctor && !!iso && !isPast && conflicts.length === 0 && !submitting;

  async function submit() {
    if (!patient || !doctor || !iso) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/appointments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          patientId: patient.id,
          doctorId: doctor.id,
          dateTime: iso,
          duration,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data?.conflicts) {
          setConflicts(data.conflicts as ConflictItem[]);
          setError("This time conflicts with an existing appointment.");
        } else if (res.status === 422 && data?.error === "past_datetime") {
          setError("Cannot schedule for a time in the past.");
        } else {
          setError(data?.error ?? `Create failed (${res.status})`);
        }
        return;
      }
      onCreated();
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
        <h2 className="text-[18px] font-medium text-[#0A2540] mb-4">Schedule appointment</h2>

        <div className="mb-3">
          <label className="block text-[12px] font-medium text-[#425466] mb-1">Patient</label>
          <PatientCombobox
            value={patient}
            onChange={setPatient}
            disabled={!!prefilledPatient}
          />
        </div>

        {isAdmin && (
          <div className="mb-3">
            <label className="block text-[12px] font-medium text-[#425466] mb-1">Doctor</label>
            <DoctorCombobox value={doctor} onChange={setDoctor} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
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

        <div className="mb-3">
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

        <div className="mb-4">
          <label className="block text-[12px] font-medium text-[#425466] mb-1">
            Notes (optional)
          </label>
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
            {submitting ? "Scheduling…" : "Schedule"}
          </Button>
        </div>
      </div>
    </div>
  );
}
