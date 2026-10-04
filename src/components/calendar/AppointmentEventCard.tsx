"use client";

import type { CalendarAppointment } from "@/types/appointment";
import { clinicTimeLabel } from "@/lib/clinic-time";

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
  // event.start is shifted for the calendar grid; label from the real time.
  const time = clinicTimeLabel(new Date(event.appointment.dateTime));
  const isCancelled = a.status === "CANCELLED" || a.status === "NO_SHOW";

  return (
    <div className={`flex flex-col leading-tight ${isCancelled ? "opacity-60 line-through" : ""}`}>
      <span className="text-[12px] font-medium text-foreground truncate">
        {a.patient.firstName} {a.patient.lastName}
      </span>
      <span className="text-[11px] text-fg-secondary tabular-nums">
        {time} · {a.duration}m
      </span>
    </div>
  );
}
