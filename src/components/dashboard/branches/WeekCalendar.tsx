"use client";

import type { ScheduleAppointment, ScheduleDoctor, OperatingHoursMap } from "@/types/branch";
import { parseOperatingHours, hasAnyHours } from "@/lib/operating-hours";
import { CLINIC_TIME_ZONE, clinicDateKey, clinicParts } from "@/lib/clinic-time";

interface WeekCalendarProps {
  weekStart: Date;
  appointments: ScheduleAppointment[];
  doctors: ScheduleDoctor[];
  operatingHours: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "#0570DE",
  COMPLETED: "#30B130",
  IN_PROGRESS: "#F5A623",
  CHECKED_IN: "#F5A623",
  CANCELLED: "#DF1B41",
  NO_SHOW: "#DF1B41",
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const HOURS_START = 7; // 7 AM
const HOURS_END = 20; // 8 PM
const SLOT_HEIGHT = 48; // px per 30-min slot

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = HOURS_START; h < HOURS_END; h++) {
    slots.push(`${h.toString().padStart(2, "0")}:00`);
    slots.push(`${h.toString().padStart(2, "0")}:30`);
  }
  return slots;
}

export function WeekCalendar({ weekStart, appointments, doctors, operatingHours }: WeekCalendarProps) {
  const timeSlots = generateTimeSlots();
  const doctorColorMap = new Map(doctors.map((d) => [d.id, d.color]));

  const hours: OperatingHoursMap = parseOperatingHours(operatingHours);

  // 7 day columns in clinic time, whatever the device's zone (noon of each
  // clinic day, so the date never slips across midnight).
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86_400_000 + 12 * 3_600_000));
  const dayKey = (d: Date) => clinicDateKey(d);

  const todayStr = clinicDateKey();

  // Group appointments by clinic day
  const apptsByDay = new Map<string, ScheduleAppointment[]>();
  for (const appt of appointments) {
    const key = clinicDateKey(new Date(appt.dateTime));
    if (!apptsByDay.has(key)) apptsByDay.set(key, []);
    apptsByDay.get(key)!.push(appt);
  }

  function getSlotIndex(dateStr: string): number {
    const { hour: h, minute: m } = clinicParts(new Date(dateStr));
    return (h - HOURS_START) * 2 + (m >= 30 ? 1 : 0);
  }

  function isDayOpen(dayIndex: number): boolean {
    const key = DAY_KEYS[dayIndex];
    // No hours set → don't grey every day out as closed
    return !hasAnyHours(hours) || !!hours[key];
  }

  return (
    <div
      className="rounded-panel border border-border bg-white overflow-auto"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="min-w-175">
        {/* Day headers */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border sticky top-0 bg-white z-10">
          <div className="px-2 py-2" />
          {days.map((day, i) => {
            const dateStr = dayKey(day);
            const isToday = dateStr === todayStr;
            const dayName = day.toLocaleDateString("en-US", { weekday: "short", timeZone: CLINIC_TIME_ZONE });
            const dayNum = clinicParts(day).day;

            return (
              <div
                key={i}
                className={`px-2 py-2 text-center border-l border-border ${
                  isToday ? "bg-brand-subtle" : ""
                }`}
              >
                <div className="text-[12px] text-fg-secondary font-medium">{dayName}</div>
                <div className={`text-[16px] font-medium ${isToday ? "text-brand" : "text-foreground"}`}>
                  {dayNum}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="relative">
          {timeSlots.map((slot, slotIdx) => {
            const isHourMark = slot.endsWith(":00");
            return (
              <div
                key={slot}
                className="grid grid-cols-[60px_repeat(7,1fr)]"
                style={{ height: SLOT_HEIGHT }}
              >
                {/* Time label */}
                <div className="px-2 flex items-start pt-0.5 text-[11px] text-fg-secondary border-r border-border">
                  {isHourMark && (
                    <span>{parseInt(slot) > 12 ? `${parseInt(slot) - 12} PM` : parseInt(slot) === 12 ? "12 PM" : `${parseInt(slot)} AM`}</span>
                  )}
                </div>

                {/* Day columns */}
                {days.map((day, dayIdx) => {
                  const dateStr = dayKey(day);
                  const isToday = dateStr === todayStr;
                  const dayAppts = apptsByDay.get(dateStr) ?? [];
                  const slotAppts = dayAppts.filter((a) => getSlotIndex(a.dateTime) === slotIdx);
                  const closed = !isDayOpen(dayIdx);

                  return (
                    <div
                      key={dayIdx}
                      className={`border-l border-border relative ${
                        isHourMark ? "border-t border-border" : "border-t border-dashed border-border-subtle"
                      } ${closed ? "bg-surface-subtle" : ""} ${isToday && !closed ? "bg-surface-subtle" : ""}`}
                    >
                      {slotAppts.map((appt) => {
                        const docColor = appt.doctor ? doctorColorMap.get(appt.doctor.id) ?? "#585858" : "#585858";
                        const statusColor = STATUS_COLORS[appt.status] ?? "#585858";
                        const patientName = appt.patient
                          ? `${appt.patient.firstName} ${appt.patient.lastName[0]}.`
                          : "Unknown";

                        return (
                          <div
                            key={appt.id}
                            className="absolute inset-x-1 top-1 rounded-[3px] px-1.5 py-0.5 text-[11px] leading-tight overflow-hidden cursor-default"
                            style={{
                              backgroundColor: `${docColor}15`,
                              borderLeft: `3px solid ${statusColor}`,
                              height: Math.max((appt.duration / 30) * SLOT_HEIGHT - 4, SLOT_HEIGHT - 4),
                              zIndex: 5,
                            }}
                            title={`${appt.doctor?.name ?? "Unassigned"} — ${patientName} (${appt.status})`}
                          >
                            <div className="font-medium text-foreground truncate">{patientName}</div>
                            <div className="text-fg-secondary truncate">{appt.doctor?.name ?? "Unassigned"}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
