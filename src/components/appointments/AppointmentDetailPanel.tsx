"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  X,
  Phone,
  Mail,
  ExternalLink,
  Pencil,
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
import { AppointmentStatusActions } from "@/components/appointments/AppointmentStatusActions";
import { OnlineBookingBadge } from "@/components/appointments/OnlineBookingBadge";
import type { CalendarAppointment } from "@/types/appointment";
import { clinicDateLabel, clinicTimeLabel } from "@/lib/clinic-time";
import { AppointmentPackageInfo } from "@/components/packages/AppointmentPackageInfo";

interface Props {
  appointment: CalendarAppointment | null;
  isAdmin: boolean;
  /** Hard delete — defaults to isAdmin; front desk books for anyone but can't delete. */
  canDelete?: boolean;
  /** Visits are clinical — false for front desk. */
  canCreateVisit?: boolean;
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
  canDelete = isAdmin,
  canCreateVisit = true,
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
  // don't re-fetch on every parent render. A single GET returns everything we
  // need; the `recentVisits` array includes appointmentId so we can find the
  // visit linked to this appointment without a second round-trip.
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
        const visits: Array<{ id: string; visitDate: string; appointmentId: string | null }> =
          j.patient.recentVisits ?? [];
        const linked = visits.find((v) => v.appointmentId === apptIdForFetch);
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
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-105 bg-white border-l border-border shadow-lg overflow-y-auto animate-appointment-panel-in focus:outline-none"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 bg-white border-b border-border">
          <h2
            id="appointment-detail-title"
            className="text-[15px] font-semibold text-foreground"
          >
            Appointment details
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-control text-fg-muted hover:bg-surface-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        {/* Patient header */}
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-[20px] font-semibold text-brand">
              {appointment.patient.firstName.charAt(0)}
              {appointment.patient.lastName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[17px] font-semibold text-foreground truncate">
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
                {appointment.source === "ONLINE" && <OnlineBookingBadge />}
              </div>
              {patientDetail?.dateOfBirth && (
                <p className="text-[12px] text-fg-muted mt-0.5">
                  {formatDobWithAge(patientDetail.dateOfBirth)}
                </p>
              )}
              {patientDetail?.icNumber && (
                <p className="text-[12px] text-fg-muted tabular-nums">
                  IC: {patientDetail.icNumber}
                </p>
              )}
              <Link
                href={`/dashboard/patients/${appointment.patient.id}/details`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-[12px] font-medium text-brand hover:underline"
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
                className="inline-flex items-center gap-2 text-[13px] text-fg-secondary hover:text-brand transition-colors"
              >
                <Phone className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
                <span className="tabular-nums">{patientDetail.phone}</span>
              </a>
            )}
            {patientDetail?.email && (
              <a
                href={buildMailtoUrl(patientDetail.email) ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-[13px] text-fg-secondary hover:text-brand transition-colors break-all"
              >
                <Mail className="h-3.5 w-3.5 text-fg-muted" strokeWidth={1.75} />
                {patientDetail.email}
              </a>
            )}
          </div>
        </div>

        {/* Appointment info */}
        <div className="px-5 py-4 border-b border-border">
          <h4 className="text-[11px] uppercase tracking-wider font-semibold text-fg-muted mb-3">
            Appointment info
          </h4>
          <dl className="grid grid-cols-[100px_1fr] gap-y-2 text-[13px]">
            <dt className="text-fg-muted">Date & time</dt>
            <dd className="text-foreground tabular-nums">
              {clinicDateLabel(dt, "day")} · {clinicTimeLabel(dt)}
            </dd>
            <dt className="text-fg-muted">Duration</dt>
            <dd className="text-foreground tabular-nums">
              {appointment.duration} minutes
            </dd>
            {appointment.room && (
              <>
                <dt className="text-fg-muted">Room</dt>
                <dd className="text-foreground">{appointment.room}</dd>
              </>
            )}
            <dt className="text-fg-muted">Doctor</dt>
            <dd>
              <Link
                href={`/dashboard/doctors/${appointment.doctor.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-brand transition-colors"
              >
                {appointment.doctor.name ?? "Unassigned"}
                <ExternalLink className="inline-block h-3 w-3 ml-1 opacity-50" strokeWidth={1.75} />
              </Link>
            </dd>
            <dt className="text-fg-muted">Branch</dt>
            <dd>
              <Link
                href={`/dashboard/branches/${appointment.branch.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-brand transition-colors"
              >
                {appointment.branch.name}
                <ExternalLink className="inline-block h-3 w-3 ml-1 opacity-50" strokeWidth={1.75} />
              </Link>
            </dd>
            {appointment.seriesIndex != null && (
              <>
                <dt className="text-fg-muted">Series</dt>
                <dd className="text-foreground tabular-nums">Visit {appointment.seriesIndex} of a recurring series</dd>
              </>
            )}
          </dl>
          <div className="mt-3 empty:hidden">
            <AppointmentPackageInfo
              appointmentId={appointment.id}
              status={appointment.status}
              patientId={appointment.patient.id}
              treatmentType={appointment.treatmentType}
              canRedeem={canEdit}
              onChanged={onChanged}
            />
          </div>
        </div>

        {/* Notes */}
        {appointment.notes && (
          <div className="px-5 py-4 border-b border-border">
            <h4 className="text-[11px] uppercase tracking-wider font-semibold text-fg-muted mb-2">
              Notes
            </h4>
            <p className="text-[13px] text-fg-secondary whitespace-pre-wrap wrap-break-word">
              {appointment.notes}
            </p>
          </div>
        )}

        {/* Reminders */}
        <div className="px-5 py-4 border-b border-border">
          <h4 className="text-[11px] uppercase tracking-wider font-semibold text-fg-muted mb-2">
            Reminders
          </h4>
          <ReminderStatusBadge appointmentId={appointment.id} />
        </div>

        {/* History */}
        <div className="px-5 py-4 border-b border-border">
          <h4 className="text-[11px] uppercase tracking-wider font-semibold text-fg-muted mb-2">
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
              className="h-8 rounded-control border-border text-[13px] gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} /> Edit
            </Button>
          )}
          {canEdit && (
            <AppointmentStatusActions
              appointmentId={appointment.id}
              status={appointment.status}
              dateTime={appointment.dateTime}
              onChanged={onChanged}
            />
          )}
          {canEdit && appointment.status !== "CANCELLED" && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="h-8 rounded-control border-border text-[13px] text-warning gap-1.5"
            >
              <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} /> Cancel
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              className="h-8 rounded-control border-border text-[13px] text-danger gap-1.5"
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
              className="inline-flex items-center gap-1.5 h-8 rounded-control border border-border px-3 text-[13px] text-brand hover:bg-surface-muted transition-colors"
            >
              <ClipboardList className="h-3.5 w-3.5" strokeWidth={1.75} /> View visit
            </Link>
          ) : (
            appointment.status === "COMPLETED" &&
            canEdit &&
            canCreateVisit && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateVisit}
                disabled={creatingVisit}
                className="h-8 rounded-control border-border text-[13px] text-brand gap-1.5"
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
