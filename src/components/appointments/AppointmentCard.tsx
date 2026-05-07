"use client";

import { format } from "date-fns/format";
import { Clock, MapPin, StickyNote } from "lucide-react";
import { AppointmentActionsMenu } from "@/components/patients/AppointmentActionsMenu";
import { STATUS_TOKENS } from "@/lib/appointment-tabs";
import type { CalendarAppointment } from "@/types/appointment";

interface Props {
  appointment: CalendarAppointment;
  selected: boolean;
  isAdmin: boolean;
  currentUserId: string;
  onSelect: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function AppointmentCard({
  appointment,
  selected,
  isAdmin,
  currentUserId,
  onSelect,
  onEdit,
  onCancel,
  onDelete,
}: Props) {
  const tokens = STATUS_TOKENS[appointment.status];
  const canEdit = isAdmin || appointment.doctor.id === currentUserId;
  const canDelete = isAdmin;

  const dt = new Date(appointment.dateTime);
  const time = format(dt, "h:mm a");

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Appointment with ${appointment.patient.firstName} ${appointment.patient.lastName} at ${time}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`relative bg-white rounded-[8px] p-4 mb-2 transition-all duration-150 cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#635BFF] ${
        selected
          ? "border border-[#635BFF] bg-[#F0EEFF]"
          : "border border-[#e5edf5] hover:border-[#C1C9D2] hover:shadow-sm"
      }`}
      style={{ boxShadow: selected ? "none" : "var(--shadow-xs)" }}
    >
      <span
        className="appointment-card-accent"
        aria-hidden="true"
        style={{ backgroundColor: tokens.accent }}
      />
      <div className="flex items-start gap-3 pl-2">
        {/* Avatar */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F0EEFF] text-[13px] font-semibold text-[#635BFF]">
          {initials(appointment.patient.firstName, appointment.patient.lastName)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[15px] font-medium text-[#061b31] truncate">
                  {appointment.patient.firstName} {appointment.patient.lastName}
                </h3>
                {appointment.notes && (
                  <span title="Has notes" aria-label="Has notes">
                    <StickyNote
                      className="h-3 w-3 text-[#697386] shrink-0"
                      strokeWidth={1.5}
                    />
                  </span>
                )}
              </div>
              {appointment.notes && (
                <p className="text-[12px] text-[#425466] mt-0.5 line-clamp-1">
                  {appointment.notes}
                </p>
              )}
            </div>

            {/* Status pill + kebab */}
            <div className="flex items-center gap-1 shrink-0">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium"
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
              <div
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <AppointmentActionsMenu
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onEdit={onEdit}
                  onCancel={onCancel}
                  onDelete={onDelete}
                />
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#425466]">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="h-3 w-3 text-[#697386]" strokeWidth={1.75} />
              {time} · {appointment.duration} min
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: tokens.accent }}
                aria-hidden="true"
              />
              {appointment.doctor.name ?? "Unassigned"}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 text-[#697386]" strokeWidth={1.75} />
              {appointment.branch.name}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
