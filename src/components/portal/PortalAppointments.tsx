"use client";

import { useState } from "react";
import { Clock, MapPin, Phone, Stethoscope } from "lucide-react";
import type { PortalAppointment, PortalAppointmentStatus, PortalPatient } from "@/types/portal";
import { buildTelUrl } from "@/lib/format";
import { portalDay, portalTime } from "@/components/portal/portal-format";
import { PortalCancelDialog } from "@/components/portal/PortalCancelDialog";
import { BTN_DANGER, CARD, LINK, PILL } from "@/components/portal/styles";
import { cn } from "@/lib/utils";

const STATUS: Record<PortalAppointmentStatus, { label: string; className: string }> = {
  SCHEDULED: { label: "Booked", className: "bg-brand-subtle text-brand" },
  CHECKED_IN: { label: "Checked in", className: "bg-success-subtle text-success" },
  IN_PROGRESS: { label: "In progress", className: "bg-warning-subtle text-warning" },
  COMPLETED: { label: "Completed", className: "bg-success-subtle text-success" },
  CANCELLED: { label: "Cancelled", className: "bg-danger-subtle text-danger" },
  NO_SHOW: { label: "Missed", className: "bg-surface-hover text-fg-secondary" },
};

interface Props {
  upcoming: PortalAppointment[];
  past: PortalAppointment[];
  patients: PortalPatient[];
  showPatientName: boolean;
  onChanged: () => Promise<void>;
}

function PhoneLink({ phone, children }: { phone: string | null; children?: React.ReactNode }) {
  const href = buildTelUrl(phone);
  if (!href || !phone) return <>{children ?? "the clinic"}</>;
  return (
    <a href={href} className={LINK}>
      {children ?? phone}
    </a>
  );
}

function CutoffNote({ appt }: { appt: PortalAppointment }) {
  if (appt.status !== "SCHEDULED" || appt.canCancel) return null;
  return (
    <p className="mt-3 text-[14px] text-fg-muted">
      Online changes close {appt.cancelHours} hours before your visit. To change or cancel, call{" "}
      <PhoneLink phone={appt.branch.phone}>{appt.branch.phone ?? appt.branch.name}</PhoneLink>.
    </p>
  );
}

function UpcomingCard({
  appt,
  showPatientName,
  onCancel,
}: {
  appt: PortalAppointment;
  showPatientName: boolean;
  onCancel: (a: PortalAppointment) => void;
}) {
  const status = STATUS[appt.status];
  const cancelled = appt.status === "CANCELLED";
  return (
    <li className={cn(CARD, "p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-[18px] font-medium text-foreground", cancelled && "line-through decoration-fg-disabled")}>
            {portalDay(appt.dateTime)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[15px] text-fg-secondary">
            <Clock className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            {portalTime(appt.dateTime)} <span className="text-fg-muted">Malaysia time · {appt.duration} min</span>
          </p>
        </div>
        <span className={cn(PILL, status.className)}>{status.label}</span>
      </div>
      <dl className="mt-3 space-y-1.5 text-[15px] text-fg-secondary">
        <div className="flex items-center gap-1.5">
          <Stethoscope className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          <dt className="sr-only">Treatment and chiropractor</dt>
          <dd>
            {appt.treatment} with {appt.doctorName}
            {showPatientName && <span className="text-fg-muted"> · for {appt.patientFirstName}</span>}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
          <dt className="sr-only">Clinic</dt>
          <dd>{appt.branch.name}</dd>
        </div>
      </dl>
      {appt.canCancel && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className={BTN_DANGER} onClick={() => onCancel(appt)}>
            Cancel appointment
          </button>
          <span className="text-[14px] text-fg-muted">
            You can cancel online until {portalTime(appt.cancelBefore)}, {portalDay(appt.cancelBefore)}.
          </span>
        </div>
      )}
      <CutoffNote appt={appt} />
    </li>
  );
}

export function PortalAppointments({ upcoming, past, patients, showPatientName, onChanged }: Props) {
  const [cancelling, setCancelling] = useState<PortalAppointment | null>(null);
  const clinics = [...new Map(patients.map((p) => [p.branch.name, p.branch])).values()];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-3 text-[18px] font-medium text-foreground">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className={cn(CARD, "p-4 text-[15px] text-fg-secondary")}>You have no upcoming appointments.</p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((a) => (
              <UpcomingCard key={a.id} appt={a} showPatientName={showPatientName} onCancel={setCancelling} />
            ))}
          </ul>
        )}
        <div className="mt-4 rounded-panel border border-dashed border-border-strong bg-white p-4 text-[15px] text-fg-secondary">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <Phone className="size-4" strokeWidth={1.5} aria-hidden /> Book your next visit
          </p>
          <ul className="mt-1.5 space-y-1">
            {clinics.map((c) => (
              <li key={c.name}>
                {c.name}: <PhoneLink phone={c.phone}>{c.phone ?? "call the clinic"}</PhoneLink>
                {c.bookingUrl && (
                  <>
                    {" · "}
                    <a href={c.bookingUrl} className={LINK}>
                      Book online
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-[18px] font-medium text-foreground">Past visits</h2>
        {past.length === 0 ? (
          <p className="text-[15px] text-fg-muted">No past appointments yet.</p>
        ) : (
          <ul className={cn(CARD, "divide-y divide-border")}>
            {past.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-foreground">
                    {portalDay(a.dateTime)} · {portalTime(a.dateTime)}
                  </p>
                  <p className="truncate text-[14px] text-fg-muted">
                    {a.treatment} · {a.doctorName} · {a.branch.name}
                    {showPatientName && ` · ${a.patientFirstName}`}
                  </p>
                </div>
                <span className={cn(PILL, STATUS[a.status].className)}>{STATUS[a.status].label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PortalCancelDialog
        appointment={cancelling}
        onClose={() => setCancelling(null)}
        onCancelled={async () => {
          setCancelling(null);
          await onChanged();
        }}
      />
    </div>
  );
}
