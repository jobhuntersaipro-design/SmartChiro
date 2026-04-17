"use client";

import type { ScheduleAppointment, ScheduleDoctor, OperatingHoursMap } from "@/types/branch";

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

  let hours: OperatingHoursMap = {};
  try {
    if (operatingHours) hours = JSON.parse(operatingHours);
  } catch { /* ignore */ }

  // Build 7 day columns
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Group appointments by day
  const apptsByDay = new Map<string, ScheduleAppointment[]>();
  for (const appt of appointments) {
    const d = new Date(appt.dateTime);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!apptsByDay.has(key)) apptsByDay.set(key, []);
    apptsByDay.get(key)!.push(appt);
  }

  function getSlotIndex(dateStr: string): number {
    const d = new Date(dateStr);
    const h = d.getHours();
    const m = d.getMinutes();
    return (h - HOURS_START) * 2 + (m >= 30 ? 1 : 0);
  }

  function isDayOpen(dayIndex: number): boolean {
    const key = DAY_KEYS[dayIndex];
    return !!hours[key];
  }

  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white overflow-auto"
      style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
    >
      <div className="min-w-[700px]">
        {/* Day headers */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[#e5edf5] sticky top-0 bg-white z-10">
          <div className="px-2 py-2" />
          {days.map((day, i) => {
            const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
            const isToday = dateStr === todayStr;
            const dayName = day.toLocaleDateString("en-US", { weekday: "short" });
            const dayNum = day.getDate();

            return (
              <div
                key={i}
                className={`px-2 py-2 text-center border-l border-[#e5edf5] ${
                  isToday ? "bg-[#F0EEFF]" : ""
                }`}
              >
                <div className="text-[12px] text-[#64748d] font-medium">{dayName}</div>
                <div className={`text-[16px] font-medium ${isToday ? "text-[#533afd]" : "text-[#061b31]"}`}>
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
                <div className="px-2 flex items-start pt-0.5 text-[11px] text-[#64748d] border-r border-[#e5edf5]">
                  {isHourMark && (
                    <span>{parseInt(slot) > 12 ? `${parseInt(slot) - 12} PM` : parseInt(slot) === 12 ? "12 PM" : `${parseInt(slot)} AM`}</span>
                  )}
                </div>

                {/* Day columns */}
                {days.map((day, dayIdx) => {
                  const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                  const isToday = dateStr === todayStr;
                  const dayAppts = apptsByDay.get(dateStr) ?? [];
                  const slotAppts = dayAppts.filter((a) => getSlotIndex(a.dateTime) === slotIdx);
                  const closed = !isDayOpen(dayIdx);

                  return (
                    <div
                      key={dayIdx}
                      className={`border-l border-[#e5edf5] relative ${
                        isHourMark ? "border-t border-[#e5edf5]" : "border-t border-dashed border-[#f0f3f7]"
                      } ${closed ? "bg-[#f9fafb]" : ""} ${isToday && !closed ? "bg-[#FAFAFE]" : ""}`}
                    >
                      {slotAppts.map((appt) => {
                        const docColor = appt.doctor ? doctorColorMap.get(appt.doctor.id) ?? "#64748d" : "#64748d";
                        const statusColor = STATUS_COLORS[appt.status] ?? "#64748d";
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
                            <div className="font-medium text-[#061b31] truncate">{patientName}</div>
                            <div className="text-[#64748d] truncate">{appt.doctor?.name ?? "Unassigned"}</div>
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
