"use client";

import { format } from "date-fns/format";
import { isSameDay } from "date-fns/isSameDay";
import { isToday } from "date-fns/isToday";
import { isTomorrow } from "date-fns/isTomorrow";
import { Calendar as CalendarIcon } from "lucide-react";
import { AppointmentCard } from "./AppointmentCard";
import type { CalendarAppointment } from "@/types/appointment";
import type { AppointmentTabId } from "@/lib/appointment-tabs";

interface Props {
  appointments: CalendarAppointment[];
  selectedId: string | null;
  isAdmin: boolean;
  currentUserId: string;
  activeTab: AppointmentTabId;
  emptyAction?: React.ReactNode;
  onSelect: (id: string) => void;
  onEdit: (appt: CalendarAppointment) => void;
  onCancel: (appt: CalendarAppointment) => void;
  onDelete: (appt: CalendarAppointment) => void;
}

function groupHeader(date: Date): string {
  if (isToday(date)) return `Today, ${format(date, "EEEE d MMMM yyyy")}`;
  if (isTomorrow(date)) return `Tomorrow, ${format(date, "EEEE d MMMM yyyy")}`;
  return format(date, "EEEE, d MMMM yyyy");
}

export function AppointmentCardList({
  appointments,
  selectedId,
  isAdmin,
  currentUserId,
  activeTab,
  emptyAction,
  onSelect,
  onEdit,
  onCancel,
  onDelete,
}: Props) {
  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CalendarIcon
          className="h-10 w-10 text-[#cbd5e1] mb-3"
          strokeWidth={1.5}
        />
        <p className="text-[14px] text-[#697386]">
          {emptyMessage(activeTab)}
        </p>
        {emptyAction && <div className="mt-3">{emptyAction}</div>}
      </div>
    );
  }

  // Group cards by date when the tab spans multiple days, otherwise render flat.
  const groupByDate = activeTab === "all" || activeTab === "upcoming";

  if (!groupByDate) {
    return (
      <div className="py-2">
        {appointments.map((a) => (
          <AppointmentCard
            key={a.id}
            appointment={a}
            selected={a.id === selectedId}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            onSelect={() => onSelect(a.id)}
            onEdit={() => onEdit(a)}
            onCancel={() => onCancel(a)}
            onDelete={() => onDelete(a)}
          />
        ))}
      </div>
    );
  }

  // Build groups in order — appointments are already sorted asc by date.
  const groups: { date: Date; items: CalendarAppointment[] }[] = [];
  for (const a of appointments) {
    const dt = new Date(a.dateTime);
    const last = groups[groups.length - 1];
    if (last && isSameDay(last.date, dt)) {
      last.items.push(a);
    } else {
      groups.push({ date: dt, items: [a] });
    }
  }

  return (
    <div className="py-2">
      {groups.map((g) => (
        <section key={g.date.toISOString().split("T")[0]} className="mb-4">
          <header className="flex items-center gap-3 mb-2">
            <span className="text-[13px] font-medium text-[#697386]">
              {groupHeader(g.date)}
            </span>
            <span className="flex-1 h-px bg-[#e5edf5]" aria-hidden="true" />
            <span className="text-[12px] text-[#697386] tabular-nums">
              {g.items.length}
            </span>
          </header>
          {g.items.map((a) => (
            <AppointmentCard
              key={a.id}
              appointment={a}
              selected={a.id === selectedId}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onSelect={() => onSelect(a.id)}
              onEdit={() => onEdit(a)}
              onCancel={() => onCancel(a)}
              onDelete={() => onDelete(a)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function emptyMessage(tab: AppointmentTabId): string {
  switch (tab) {
    case "today":
      return "No appointments scheduled for today.";
    case "upcoming":
      return "No upcoming appointments.";
    case "completed":
      return "No completed appointments yet.";
    case "cancelled":
      return "No cancelled appointments.";
    case "noshow":
      return "No no-show appointments.";
    default:
      return "No appointments match these filters.";
  }
}
