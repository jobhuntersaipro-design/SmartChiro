"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle, Coffee, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PatientCombobox } from "@/components/patients/PatientCombobox";
import { DoctorCombobox } from "@/components/patients/DoctorCombobox";
import { formatAppointmentDateTime } from "@/lib/format";
import {
  TREATMENT_OPTIONS,
  treatmentLabelFor,
  defaultDurationFor,
  DEFAULT_APPOINTMENT_DURATION_MIN,
} from "@/lib/treatment-colors";
import type { TreatmentType } from "@/types/appointment";
import { defaultStart } from "@/lib/appointment-defaults";
import { clinicDateKey, clinicInstantFromInputs, clinicUtcOffsetLabel } from "@/lib/clinic-time";
import { DateInput } from "@/components/ui/date-input";
import { toast } from "sonner";
import { RepeatBookingSection } from "@/components/packages/RepeatBookingSection";
import { useSeriesPreview } from "@/components/packages/useSeriesPreview";
import { buildRepeatRule, defaultRepeatState, type RepeatFormState } from "@/lib/package-ui";
import { bookSeries } from "@/lib/series-client";

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
    /** The patient's branch — the booking is made there. */
    branchId?: string | null;
  } | null;
  prefilledDoctor?: { id: string; name: string } | null;
  /** Branch the page is showing; the form starts there when no patient is prefilled. */
  defaultBranchId?: string | null;
  /** ISO start time, e.g. from clicking an empty calendar slot. */
  prefilledDateTime?: string | null;
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

/** A branch from GET /api/branches (basic list). */
interface BranchOption {
  id: string;
  name: string;
  userRole: string;
  treatmentRooms: number | null;
  isActive?: boolean;
}

/** Patient's branch, else the page's branch, else the user's active branch, else the first. */
function pickBranch(list: BranchOption[], preferred: (string | null | undefined)[]): string {
  for (const id of preferred) {
    if (id && list.some((b) => b.id === id)) return id;
  }
  return list.find((b) => b.isActive)?.id ?? list[0]?.id ?? "";
}

const FIELD_CLASS =
  "w-full h-9 rounded-control border border-border bg-white px-2 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-brand";

/** Confirmation gates the user has accepted — sent as bypass flags on retry. */
interface SubmitOpts {
  forceBookOnBreak?: boolean;
  forceOutsideHours?: boolean;
  forceOnLeave?: boolean;
}

/** Date + time inputs are clinic wall-clock time, not the device's zone. */
function inputsToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const dt = clinicInstantFromInputs(date, time);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

export function CreateAppointmentDialog({
  open,
  isAdmin,
  currentUserId,
  prefilledPatient,
  prefilledDoctor,
  prefilledDateTime,
  defaultBranchId,
  onClose,
  onCreated,
}: Props) {
  const [patient, setPatient] = useState<PatientOption | null>(null);
  const [doctor, setDoctor] = useState<{ id: string; name: string } | null>(null);
  const [date, setDate] = useState(() => defaultStart(prefilledDateTime).date);
  const [time, setTime] = useState(() => defaultStart(prefilledDateTime).time);
  const [duration, setDuration] = useState(DEFAULT_APPOINTMENT_DURATION_MIN);
  // Once the user types a duration, picking a treatment no longer overwrites it
  const [durationTouched, setDurationTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [room, setRoom] = useState("");
  const [treatmentType, setTreatmentType] = useState<TreatmentType | "">("");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchId, setBranchId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  // Each confirm keeps the gates already confirmed in this attempt so the retry re-sends them
  const [breakConfirm, setBreakConfirm] = useState<{ label: string; confirmed: SubmitOpts } | null>(null);
  // Outside opening hours, or the doctor on leave (same dialog).
  const [hoursConfirm, setHoursConfirm] = useState<{ kind: "hours" | "leave"; hours: string; confirmed: SubmitOpts } | null>(null);
  // Repeat (recurring series)
  const [repeat, setRepeat] = useState<RepeatFormState>(() => defaultRepeatState(defaultStart(prefilledDateTime).date));
  const [skipProblemDates, setSkipProblemDates] = useState(false);
  const [seriesPackageId, setSeriesPackageId] = useState("");

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
    const start = defaultStart(prefilledDateTime);
    setDate(start.date);
    setTime(start.time);
    setDuration(DEFAULT_APPOINTMENT_DURATION_MIN);
    setDurationTouched(false);
    setNotes("");
    setRoom("");
    setTreatmentType("");
    setBranchId(prefilledPatient?.branchId ?? defaultBranchId ?? "");
    setError(null);
    setConflicts([]);
    setBreakConfirm(null);
    setHoursConfirm(null);
    setRepeat(defaultRepeatState(start.date));
    setSkipProblemDates(false);
    setSeriesPackageId("");
  }, [open, prefilledPatient, prefilledDoctor, prefilledDateTime, defaultBranchId]);

  // The user's branches — for the branch field, room suggestions and per-branch role
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/branches");
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { branches?: BranchOption[] };
      if (cancelled) return;
      const list = data.branches ?? [];
      setBranches(list);
      setBranchId((prev) => pickBranch(list, [prefilledPatient?.branchId, prev, defaultBranchId]));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, prefilledPatient, defaultBranchId]);

  const branch = branches.find((b) => b.id === branchId);
  // A DOCTOR books only for themselves (the API enforces the same rule per branch)
  const canPickDoctor = branch ? branch.userRole !== "DOCTOR" : isAdmin;

  // Doctors who can't pick a doctor book for themselves — auto-pin
  useEffect(() => {
    if (!canPickDoctor && open && currentUserId && !doctor) {
      setDoctor({ id: currentUserId, name: "Me" });
    }
  }, [canPickDoctor, open, currentUserId, doctor]);

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

  const repeatRule = repeat.enabled ? buildRepeatRule(repeat, date, time) : null;
  const series = useSeriesPreview({
    rule: open && repeatRule?.ok ? repeatRule.rule : null,
    branchId,
    doctorId: doctor?.id,
    patientId: patient?.id,
    duration,
    treatmentType,
  });

  if (!open) return null;

  function changeBranch(id: string) {
    setBranchId(id);
    // Patients and doctors belong to a branch — pick again for the new one
    if (!prefilledPatient) setPatient(null);
    const next = branches.find((b) => b.id === id);
    setDoctor(next && next.userRole === "DOCTOR" ? { id: currentUserId, name: "Me" } : null);
    setRoom("");
  }

  function changeTreatment(t: TreatmentType | "") {
    setTreatmentType(t);
    if (!durationTouched) setDuration(defaultDurationFor(t));
  }

  const roomCount = branch?.treatmentRooms ?? 0;
  const iso = inputsToIso(date, time);
  const isPast = iso ? new Date(iso).getTime() < Date.now() : false;
  const seriesOk = series.preview?.summary.ok ?? 0;
  const seriesBlocked = !!series.preview && series.preview.summary.withProblems > 0 && !skipProblemDates;
  const canSave = repeat.enabled
    ? !!patient && !!doctor && !!repeatRule?.ok && !!series.preview && !series.loading && seriesOk > 0 && !seriesBlocked && !submitting
    : !!patient && !!doctor && !!iso && !isPast && conflicts.length === 0 && !submitting;

  async function submitSeries() {
    if (!patient || !doctor || !repeatRule?.ok) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await bookSeries({
        ...repeatRule.rule,
        branchId,
        doctorId: doctor.id,
        patientId: patient.id,
        duration,
        treatmentType: treatmentType || undefined,
        room: room.trim() || undefined,
        notes: notes.trim() || undefined,
        skipProblemDates,
        patientPackageId: seriesPackageId || undefined,
      });
      if (!result.ok) {
        setError(result.problems ? `${result.message} Tick “Skip problem dates” or change the repeat.` : result.message);
        return;
      }
      toast.success(result.message);
      onCreated();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(opts: SubmitOpts = {}) {
    if (repeat.enabled) return submitSeries();
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
          treatmentType: treatmentType || undefined,
          room: room.trim() || undefined,
          branchId: branchId || undefined,
          forceBookOnBreak: opts.forceBookOnBreak,
          forceOutsideHours: opts.forceOutsideHours,
          forceOnLeave: opts.forceOnLeave,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data?.error === "break_time_confirm_required") {
          setBreakConfirm({ label: data.breakLabel ?? "Break time", confirmed: opts });
          return;
        }
        if (res.status === 409 && data?.error === "outside_hours_confirm_required") {
          setHoursConfirm({ kind: "hours", hours: data.hours ?? "", confirmed: opts });
          return;
        }
        if (res.status === 409 && data?.error === "time_off_confirm_required") {
          setHoursConfirm({ kind: "leave", hours: data.leave ?? "leave", confirmed: opts });
          return;
        }
        if (res.status === 409 && data?.conflicts) {
          setConflicts(data.conflicts as ConflictItem[]);
          setError("This time conflicts with an existing appointment.");
        } else if (res.status === 422 && data?.error === "past_datetime") {
          setError("Cannot schedule for a time in the past.");
        } else if (res.status === 422 && data?.error === "patient_not_in_branch") {
          setError("This patient belongs to another branch.");
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


  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-appointment-title"
        onClick={(e) => e.stopPropagation()}
        className="w-120 max-h-[90vh] overflow-y-auto rounded-surface border border-border bg-white p-6"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <h2 id="create-appointment-title" className="text-[18px] font-medium text-foreground mb-4">Schedule appointment</h2>

        {branches.length > 1 && (
          <div className="mb-3">
            <label htmlFor="create-appointment-branch" className="block text-[12px] font-medium text-fg-secondary mb-1">
              Branch
            </label>
            <select
              id="create-appointment-branch"
              value={branchId}
              onChange={(e) => changeBranch(e.target.value)}
              disabled={!!prefilledPatient?.branchId}
              className={`${FIELD_CLASS} disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {prefilledPatient?.branchId && (
              <p className="text-[11px] text-fg-muted mt-1">Booked at the patient&apos;s branch.</p>
            )}
          </div>
        )}

        <div className="mb-3">
          <label className="block text-[12px] font-medium text-fg-secondary mb-1">Patient</label>
          <PatientCombobox
            value={patient}
            onChange={setPatient}
            disabled={!!prefilledPatient}
            branchId={branchId || undefined}
          />
        </div>

        {canPickDoctor && (
          <div className="mb-3">
            <label className="block text-[12px] font-medium text-fg-secondary mb-1">Doctor</label>
            <DoctorCombobox value={doctor} onChange={setDoctor} branchId={branchId || undefined} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label htmlFor="create-appointment-date" className="block text-[12px] font-medium text-fg-secondary mb-1">Date</label>
            <DateInput
              id="create-appointment-date"
              value={date}
              onChange={setDate}
              min={clinicDateKey()}
              inputClassName={FIELD_CLASS}
            />
          </div>
          <div>
            <label htmlFor="create-appointment-time" className="block text-[12px] font-medium text-fg-secondary mb-1">Time</label>
            <input
              id="create-appointment-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
        </div>

        <div className="mb-3">
          <label htmlFor="create-appointment-treatment" className="block text-[12px] font-medium text-fg-secondary mb-1">
            Treatment type (optional)
          </label>
          <select
            id="create-appointment-treatment"
            value={treatmentType}
            onChange={(e) => changeTreatment(e.target.value as TreatmentType | "")}
            className={FIELD_CLASS}
          >
            <option value="">— Select —</option>
            {TREATMENT_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {treatmentLabelFor(t)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label htmlFor="create-appointment-duration" className="block text-[12px] font-medium text-fg-secondary mb-1">
              Duration (minutes)
            </label>
            <input
              id="create-appointment-duration"
              type="number"
              min={5}
              max={180}
              step={5}
              value={duration}
              onChange={(e) => {
                setDurationTouched(true);
                setDuration(parseInt(e.target.value || String(DEFAULT_APPOINTMENT_DURATION_MIN), 10));
              }}
              className={FIELD_CLASS}
            />
          </div>
          <div>
            <label htmlFor="create-appointment-room" className="block text-[12px] font-medium text-fg-secondary mb-1">
              Room (optional)
            </label>
            <input
              id="create-appointment-room"
              type="text"
              value={room}
              maxLength={60}
              onChange={(e) => setRoom(e.target.value)}
              list={roomCount > 0 ? "create-appointment-rooms" : undefined}
              placeholder={roomCount > 0 ? `Room 1–${roomCount}` : "e.g. Room 2"}
              className={FIELD_CLASS}
            />
            {roomCount > 0 && (
              <datalist id="create-appointment-rooms">
                {Array.from({ length: roomCount }, (_, i) => (
                  <option key={i} value={`Room ${i + 1}`} />
                ))}
              </datalist>
            )}
          </div>
        </div>

        <RepeatBookingSection
          value={repeat}
          onChange={setRepeat}
          date={date}
          ruleError={repeatRule && !repeatRule.ok ? repeatRule.error : null}
          preview={series.preview}
          previewLoading={series.loading}
          previewError={series.error}
          skipProblemDates={skipProblemDates}
          onSkipChange={setSkipProblemDates}
          patientId={patient?.id ?? null}
          treatmentType={treatmentType}
          packageId={seriesPackageId}
          onPackageChange={setSeriesPackageId}
        />

        <div className="mb-4">
          <label className="block text-[12px] font-medium text-fg-secondary mb-1">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        {isPast && !repeat.enabled && (
          <div className="mb-3 rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-danger inline-flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" strokeWidth={2} />
            <span>Selected time is in the past.</span>
          </div>
        )}

        {conflicts.length > 0 && !repeat.enabled && (
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

        {error && (repeat.enabled || !conflicts.length) && (
          <div className="mb-3 rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-danger">
            {error}
          </div>
        )}

        <p className="text-[11px] text-fg-muted mb-3">Clinic time (GMT{clinicUtcOffsetLabel()})</p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting} className="h-8 rounded-control text-[14px]">
            Cancel
          </Button>
          <Button onClick={() => submit()} disabled={!canSave} className="h-8 rounded-control text-[14px] gap-1.5">
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
            {submitting
              ? "Scheduling…"
              : repeat.enabled && seriesOk > 0
                ? `Book ${seriesOk} visit${seriesOk === 1 ? "" : "s"}`
                : "Schedule"}
          </Button>
        </div>
      </div>

      {/* Break-time confirmation dialog — appears when API returns break_time_confirm_required */}
      {breakConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setBreakConfirm(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-105 rounded-surface border border-border bg-white p-6"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Coffee className="h-5 w-5 text-warning" strokeWidth={1.75} />
              <h3 className="text-[16px] font-semibold text-foreground">
                Book during break time?
              </h3>
            </div>
            <p className="text-[13px] text-fg-secondary mb-4">
              {doctor?.name ?? "The doctor"}&apos;s schedule has{" "}
              <strong>&ldquo;{breakConfirm.label}&rdquo;</strong> blocked at this time.
              The doctor will be notified by email if you book anyway.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setBreakConfirm(null)}
                disabled={submitting}
                className="h-8 rounded-control text-[13px]"
              >
                Pick another time
              </Button>
              <Button
                onClick={() => {
                  const confirmed = breakConfirm.confirmed;
                  setBreakConfirm(null);
                  submit({ ...confirmed, forceBookOnBreak: true });
                }}
                disabled={submitting}
                className="h-8 rounded-control text-[13px] bg-warning hover:bg-warning text-white gap-1.5"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
                Book on break
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Opening-hours confirmation — appears when API returns outside_hours_confirm_required */}
      {hoursConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setHoursConfirm(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="outside-hours-title"
            onClick={(e) => e.stopPropagation()}
            className="w-105 rounded-surface border border-border bg-white p-6"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-warning" strokeWidth={1.75} />
              <h3 id="outside-hours-title" className="text-[16px] font-semibold text-foreground">
                {hoursConfirm.kind === "leave" ? "Doctor on leave" : "Outside opening hours"}
              </h3>
            </div>
            {hoursConfirm.kind === "leave" ? (
              <p className="text-[13px] text-fg-secondary mb-4">
                {doctor?.name ?? "The doctor"} is on <strong>{hoursConfirm.hours}</strong> at this time. Book it anyway?
              </p>
            ) : (
              <p className="text-[13px] text-fg-secondary mb-4">
                This time is outside the branch&apos;s opening hours
                {hoursConfirm.hours ? (
                  <>
                    {" "}(<strong>{hoursConfirm.hours}</strong>)
                  </>
                ) : null}
                . Book it anyway?
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setHoursConfirm(null)}
                disabled={submitting}
                className="h-8 rounded-control text-[13px]"
              >
                Pick another time
              </Button>
              <Button
                onClick={() => {
                  const { confirmed, kind } = hoursConfirm;
                  setHoursConfirm(null);
                  submit({ ...confirmed, ...(kind === "leave" ? { forceOnLeave: true } : { forceOutsideHours: true }) });
                }}
                disabled={submitting}
                className="h-8 rounded-control text-[13px] bg-warning hover:bg-warning text-white gap-1.5"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
                Book anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
