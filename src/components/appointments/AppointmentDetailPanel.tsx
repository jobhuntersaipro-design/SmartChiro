"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns/format";
import {
  X,
  Phone,
  Mail,
  ExternalLink,
  Pencil,
  CheckCircle2,
  XCircle,
  Trash2,
  ClipboardList,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ReminderStatusBadge } from "@/components/appointments/ReminderStatusBadge";
import { AppointmentAuditLog } from "@/components/appointments/AppointmentAuditLog";
import { buildWhatsAppUrl, buildMailtoUrl, formatDobWithAge } from "@/lib/format";
import { STATUS_TOKENS } from "@/lib/appointment-tabs";
import type { CalendarAppointment } from "@/types/appointment";

interface Props {
  appointment: CalendarAppointment | null;
  isAdmin: boolean;
  currentUserId: string;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  /** Called after a successful PATCH so the list can refresh. */
  onChanged: () => void;
}

interface PatientDetail {
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  icNumber: string | null;
}

interface VisitLink {
  id: string;
  visitDate: string;
}

export function AppointmentDetailPanel({
  appointment,
  isAdmin,
  currentUserId,
  onClose,
  onEdit,
  onCancel,
  onDelete,
  onChanged,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [patientDetail, setPatientDetail] = useState<PatientDetail | null>(null);
  const [linkedVisit, setLinkedVisit] = useState<VisitLink | null>(null);
  const [completing, setCompleting] = useState(false);
  const [creatingVisit, setCreatingVisit] = useState(false);

  // Trap focus + Esc-to-close
  useEffect(() => {
    if (!appointment) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [appointment, onClose]);

  // Move initial focus into the panel for keyboard users — fires only when the
  // appointment id changes (parent may pass a fresh reference on every fetch).
  const apptId = appointment?.id;
  useEffect(() => {
    if (apptId && ref.current) {
      ref.current.focus();
    }
  }, [apptId]);

  // Lazy-load extra patient + linked visit info — keyed on appointment id so we
  // don't re-fetch on every parent render.
  const apptIdForFetch = appointment?.id;
  const patientId = appointment?.patient.id;
  useEffect(() => {
    if (!apptIdForFetch || !patientId) return;
    setPatientDetail(null);
    setLinkedVisit(null);

    let cancelled = false;
    fetch(`/api/patients/${patientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.patient) return;
        setPatientDetail({
          email: j.patient.email ?? null,
          phone: j.patient.phone ?? null,
          dateOfBirth: j.patient.dateOfBirth ?? null,
          icNumber: j.patient.icNumber ?? null,
        });
      })
      .catch(() => {});

    fetch(`/api/patients/${patientId}?include=detail`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.patient?.visits) return;
        const linked = j.patient.visits.find(
          (v: { appointmentId: string | null; id: string; visitDate: string }) =>
            v.appointmentId === apptIdForFetch
        );
        if (linked) setLinkedVisit({ id: linked.id, visitDate: linked.visitDate });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [apptIdForFetch, patientId]);

  if (!appointment) return null;

  const tokens = STATUS_TOKENS[appointment.status];
  const dt = new Date(appointment.dateTime);
  const canEdit = isAdmin || appointment.doctor.id === currentUserId;
  const canDelete = isAdmin;
  const canMarkComplete =
    canEdit &&
    (appointment.status === "SCHEDULED" ||
      appointment.status === "CHECKED_IN" ||
      appointment.status === "IN_PROGRESS");

  async function handleMarkComplete() {
    setCompleting(true);
    try {
      const res = await fetch(`/api/appointments/${appointment!.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Could not mark as complete");
        return;
      }
      toast.success("Appointment marked as complete");
      onChanged();
    } finally {
      setCompleting(false);
    }
  }

  async function handleCreateVisit() {
    setCreatingVisit(true);
    try {
      const res = await fetch(`/api/appointments/${appointment!.id}/visit`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Could not create visit");
        return;
      }
      const body = await res.json();
      const visitId = body.visit?.id;
      if (visitId) {
        toast.success("Visit created");
        setLinkedVisit({ id: visitId, visitDate: body.visit.visitDate });
      }
    } finally {
      setCreatingVisit(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="appointment-detail-title"
        tabIndex={-1}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[420px] bg-white border-l border-[#e5edf5] shadow-lg overflow-y-auto animate-appointment-panel-in focus:outline-none"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 bg-white border-b border-[#e5edf5]">
          <h2
            id="appointment-detail-title"
            className="text-[15px] font-semibold text-[#061b31]"
          >
            Appointment details
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[#697386] hover:bg-[#f6f9fc] hover:text-[#061b31] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#635BFF]"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        {/* Patient header */}
        <div className="px-5 py-4 border-b border-[#e5edf5]">
          <div className="flex items-start gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#F0EEFF] text-[20px] font-semibold text-[#635BFF]">
              {appointment.patient.firstName.charAt(0)}
              {appointment.patient.lastName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[17px] font-semibold text-[#061b31] truncate">
                  {appointment.patient.firstName} {appointment.patient.lastName}
                </h3>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium shrink-0"
                  style={{ backgroundColor: tokens.bg, color: tokens.text }}
                >
                  {tokens.pulse && (
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full animate-subtle-blink"
                      style={{ backgroundColor: tokens.text }}
                      aria-hidden="true"
                    />
                  )}
                  {tokens.label}
                </span>
              </div>
              {patientDetail?.dateOfBirth && (
                <p className="text-[12px] text-[#697386] mt-0.5">
                  {formatDobWithAge(patientDetail.dateOfBirth)}
                </p>
              )}
              {patientDetail?.icNumber && (
                <p className="text-[12px] text-[#697386] tabular-nums">
                  IC: {patientDetail.icNumber}
                </p>
              )}
              <Link
                href={`/dashboard/patients/${appointment.patient.id}/details`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-[12px] font-medium text-[#635BFF] hover:underline"
              >
                View patient profile
                <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
              </Link>
            </div>
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-1 mt-3">
            {patientDetail?.phone && (
              <a
                href={buildWhatsAppUrl(patientDetail.phone) ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-[13px] text-[#425466] hover:text-[#635BFF] transition-colors"
              >
                <Phone className="h-3.5 w-3.5 text-[#697386]" strokeWidth={1.75} />
                <span className="tabular-nums">{patientDetail.phone}</span>
              </a>
            )}
            {patientDetail?.email && (
              <a
                href={buildMailtoUrl(patientDetail.email) ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-[13px] text-[#425466] hover:text-[#635BFF] transition-colors break-all"
              >
                <Mail className="h-3.5 w-3.5 text-[#697386]" strokeWidth={1.75} />
                {patientDetail.email}
              </a>
            )}
          </div>
        </div>

        {/* Appointment info */}
        <div className="px-5 py-4 border-b border-[#e5edf5]">
          <h4 className="text-[11px] uppercase tracking-wider font-semibold text-[#697386] mb-3">
            Appointment info
          </h4>
          <dl className="grid grid-cols-[100px_1fr] gap-y-2 text-[13px]">
            <dt className="text-[#697386]">Date & time</dt>
            <dd className="text-[#061b31] tabular-nums">
              {format(dt, "EEE, d MMM yyyy")} · {format(dt, "h:mm a")}
            </dd>
            <dt className="text-[#697386]">Duration</dt>
            <dd className="text-[#061b31] tabular-nums">
              {appointment.duration} minutes
            </dd>
            <dt className="text-[#697386]">Doctor</dt>
            <dd>
              <Link
                href={`/dashboard/doctors/${appointment.doctor.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#061b31] hover:text-[#635BFF] transition-colors"
              >
                {appointment.doctor.name ?? "Unassigned"}
                <ExternalLink className="inline-block h-3 w-3 ml-1 opacity-50" strokeWidth={1.75} />
              </Link>
            </dd>
            <dt className="text-[#697386]">Branch</dt>
            <dd>
              <Link
                href={`/dashboard/branches/${appointment.branch.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#061b31] hover:text-[#635BFF] transition-colors"
              >
                {appointment.branch.name}
                <ExternalLink className="inline-block h-3 w-3 ml-1 opacity-50" strokeWidth={1.75} />
              </Link>
            </dd>
          </dl>
        </div>

        {/* Notes */}
        {appointment.notes && (
          <div className="px-5 py-4 border-b border-[#e5edf5]">
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-[#697386] mb-2">
              Notes
            </h4>
            <p className="text-[13px] text-[#425466] whitespace-pre-wrap break-words">
              {appointment.notes}
            </p>
          </div>
        )}

        {/* Reminders */}
        <div className="px-5 py-4 border-b border-[#e5edf5]">
          <h4 className="text-[11px] uppercase tracking-wider font-semibold text-[#697386] mb-2">
            Reminders
          </h4>
          <ReminderStatusBadge appointmentId={appointment.id} />
        </div>

        {/* History */}
        <div className="px-5 py-4 border-b border-[#e5edf5]">
          <h4 className="text-[11px] uppercase tracking-wider font-semibold text-[#697386] mb-2">
            History
          </h4>
          <AppointmentAuditLog appointmentId={appointment.id} />
        </div>

        {/* Actions */}
        <div className="px-5 py-4 flex flex-wrap gap-2">
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              className="h-8 rounded-[4px] border-[#e5edf5] text-[13px] gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} /> Edit
            </Button>
          )}
          {canMarkComplete && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkComplete}
              disabled={completing}
              className="h-8 rounded-[4px] border-[#e5edf5] text-[13px] text-[#108c3d] gap-1.5"
            >
              {completing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
              Mark complete
            </Button>
          )}
          {canEdit && appointment.status !== "CANCELLED" && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="h-8 rounded-[4px] border-[#e5edf5] text-[13px] text-[#9b6829] gap-1.5"
            >
              <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} /> Cancel
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              className="h-8 rounded-[4px] border-[#e5edf5] text-[13px] text-[#DF1B41] gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} /> Delete
            </Button>
          )}
          {/* View / Create Visit */}
          {linkedVisit ? (
            <Link
              href={`/dashboard/patients/${appointment.patient.id}/details?tab=history&visit=${linkedVisit.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 rounded-[4px] border border-[#e5edf5] px-3 text-[13px] text-[#635BFF] hover:bg-[#f6f9fc] transition-colors"
            >
              <ClipboardList className="h-3.5 w-3.5" strokeWidth={1.75} /> View visit
            </Link>
          ) : (
            appointment.status === "COMPLETED" &&
            canEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateVisit}
                disabled={creatingVisit}
                className="h-8 rounded-[4px] border-[#e5edf5] text-[13px] text-[#635BFF] gap-1.5"
              >
                {creatingVisit ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                ) : (
                  <ClipboardList className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
                Create visit
              </Button>
            )
          )}
        </div>
      </aside>
    </>
  );
}
