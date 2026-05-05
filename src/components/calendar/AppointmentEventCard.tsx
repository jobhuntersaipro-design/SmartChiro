"use client";

import { format } from "date-fns/format";
import type { CalendarAppointment } from "@/types/appointment";

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  appointment: CalendarAppointment;
}

interface Props {
  event: CalendarEvent;
}

export function AppointmentEventCard({ event }: Props) {
  const a = event.appointment;
  const time = format(event.start, "HH:mm");
  const isCancelled = a.status === "CANCELLED" || a.status === "NO_SHOW";

  return (
    <div className={`flex flex-col leading-tight ${isCancelled ? "opacity-60 line-through" : ""}`}>
      <span className="text-[12px] font-medium text-[#061b31] truncate">
        {a.patient.firstName} {a.patient.lastName}
      </span>
      <span className="text-[11px] text-[#64748d] tabular-nums">
        {time} · {a.duration}m
      </span>
    </div>
  );
}
