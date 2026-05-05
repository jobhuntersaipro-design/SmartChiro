"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { format } from "date-fns/format";
import { Pencil, X, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { doctorColor } from "./doctor-color";
import type { CalendarAppointment } from "@/types/appointment";

interface Props {
  appointment: CalendarAppointment;
  anchor: DOMRect;
  isAdmin: boolean;
  currentUserId: string;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  SCHEDULED:    { bg: "#EFF6FF", text: "#1D4ED8", label: "Scheduled" },
  CHECKED_IN:   { bg: "#F0EEFF", text: "#635BFF", label: "Checked in" },
  IN_PROGRESS:  { bg: "#FFF8E1", text: "#9b6829", label: "In progress" },
  COMPLETED:    { bg: "#ECFDF5", text: "#15be53", label: "Completed" },
  CANCELLED:    { bg: "#FEF2F2", text: "#DF1B41", label: "Cancelled" },
  NO_SHOW:      { bg: "#F1F5F9", text: "#64748b", label: "No show" },
};

export function AppointmentEventPopover({
  appointment,
  anchor,
  isAdmin,
  currentUserId,
  onClose,
  onEdit,
  onCancel,
  onDelete,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside dismiss
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Position popover near the clicked event card. Falls back to centred if anchor is offscreen.
  const top = Math.min(anchor.bottom + 8, window.innerHeight - 280);
  const left = Math.min(anchor.left, window.innerWidth - 340);
  const status = STATUS_COLORS[appointment.status] ?? STATUS_COLORS.SCHEDULED;
  const canEdit = isAdmin || appointment.doctor.id === currentUserId;
  const canDelete = isAdmin;
  const dotColor = doctorColor(appointment.doctor.id);

  return (
    <div
      ref={ref}
      className="fixed z-40 w-[320px] rounded-[6px] border border-[#e5edf5] bg-white"
      style={{ top, left, boxShadow: "0 12px 40px rgba(18,42,66,0.15)" }}
    >
      <div className="px-4 pt-3 pb-2 border-b border-[#e5edf5]">
        <div className="flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium"
            style={{ backgroundColor: status.bg, color: status.text }}
          >
            {status.label}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[#94a3b8] hover:text-[#061b31] transition-colors"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
        <Link
          href={`/dashboard/patients/${appointment.patient.id}/details`}
          className="block mt-2 text-[15px] font-medium text-[#061b31] hover:text-[#635BFF] transition-colors"
          onClick={onClose}
        >
          {appointment.patient.firstName} {appointment.patient.lastName}
          <ExternalLink className="inline-block h-3 w-3 ml-1 opacity-50" strokeWidth={1.75} />
        </Link>
        <p className="text-[13px] text-[#64748d] mt-0.5 tabular-nums">
          {format(new Date(appointment.dateTime), "EEE, d MMM yyyy · HH:mm")} · {appointment.duration} min
        </p>
      </div>

      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 text-[13px]">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
          <Link
            href={`/dashboard/doctors/${appointment.doctor.id}`}
            className="text-[#425466] hover:text-[#635BFF] transition-colors"
            onClick={onClose}
          >
            {appointment.doctor.name ?? "Unknown doctor"}
          </Link>
          <span className="text-[#cbd5e1]">·</span>
          <Link
            href={`/dashboard/branches/${appointment.branch.id}`}
            className="text-[#425466] hover:text-[#635BFF] transition-colors"
            onClick={onClose}
          >
            {appointment.branch.name}
          </Link>
        </div>
        {appointment.notes && (
          <p className="text-[13px] text-[#425466] whitespace-pre-wrap break-words">
            {appointment.notes}
          </p>
        )}
        {appointment.patient.phone && (
          <p className="text-[13px] text-[#64748d] tabular-nums">
            ☎ {appointment.patient.phone}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-3 pb-3 border-t border-[#e5edf5] pt-3">
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="h-7 rounded-[4px] border-[#e5edf5] text-[12px] gap-1"
          >
            <Pencil className="h-3 w-3" strokeWidth={1.75} /> Edit
          </Button>
        )}
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="h-7 rounded-[4px] border-[#e5edf5] text-[12px] text-[#9b6829] gap-1"
          >
            <X className="h-3 w-3" strokeWidth={1.75} /> Cancel
          </Button>
        )}
        {canDelete && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="h-7 rounded-[4px] border-[#e5edf5] text-[12px] text-[#DF1B41] gap-1"
          >
            <Trash2 className="h-3 w-3" strokeWidth={1.75} /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}
