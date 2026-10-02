"use client";

import { Clock, MapPin, DollarSign } from "lucide-react";
import type { DoctorDetail, DaySchedule } from "@/types/doctor";
import { normalizeWorkingSchedule, DAY_KEYS_BY_WEEKDAY } from "@/lib/operating-hours";
import { clinicParts } from "@/lib/clinic-time";

interface DoctorScheduleTabProps {
  doctor: DoctorDetail;
}

const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const dayLabels: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

function getTodayDayKey(): string {
  return DAY_KEYS_BY_WEEKDAY[clinicParts(new Date()).weekday];
}

function getHoursCount(day: DaySchedule | null | undefined): string {
  if (!day) return "-";
  const [startH, startM] = day.start.split(":").map(Number);
  const [endH, endM] = day.end.split(":").map(Number);
  const hours = (endH * 60 + endM - startH * 60 - startM) / 60;
  return `${hours}h`;
}

export function DoctorScheduleTab({ doctor }: DoctorScheduleTabProps) {
  const schedule = normalizeWorkingSchedule(doctor.profile?.workingSchedule);
  const todayKey = getTodayDayKey();

  if (!schedule) {
    return (
      <div className="py-12 text-center">
        <Clock className="h-10 w-10 mx-auto text-border mb-3" strokeWidth={1} />
        <p className="text-[15px] text-fg-secondary">No schedule has been set for this doctor.</p>
      </div>
    );
  }

  // Count working days
  const workingDays = dayKeys.filter((k) => schedule[k]).length;
  const totalHours = dayKeys.reduce((acc, k) => {
    const day = schedule[k];
    if (!day) return acc;
    const [startH, startM] = day.start.split(":").map(Number);
    const [endH, endM] = day.end.split(":").map(Number);
    return acc + (endH * 60 + endM - startH * 60 - startM) / 60;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Schedule grid */}
      <div className="rounded-panel border border-border bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-brand" strokeWidth={1.5} />
            <h2 className="text-[16px] font-medium text-foreground">Weekly Schedule</h2>
            <span className="text-[13px] text-fg-secondary ml-auto">
              {workingDays} days &middot; {Math.round(totalHours)}h/week
            </span>
          </div>
        </div>

        <div className="divide-y divide-border">
          {dayKeys.map((key) => {
            const day = schedule[key];
            const isToday = key === todayKey;
            const isWorking = !!day;

            return (
              <div
                key={key}
                className={`flex items-center px-5 py-3.5 transition-colors ${
                  isToday ? "bg-brand-subtle" : "hover:bg-surface-muted"
                }`}
              >
                <div className="w-32">
                  <span
                    className={`text-[14px] ${
                      isToday
                        ? "text-brand font-medium"
                        : "text-foreground font-medium"
                    }`}
                  >
                    {dayLabels[key]}
                  </span>
                  {isToday && (
                    <span className="ml-2 text-[11px] text-brand bg-white rounded-full px-2 py-0.5 border border-brand/20">
                      Today
                    </span>
                  )}
                </div>

                <div className="flex-1">
                  {isWorking ? (
                    <div className="flex items-center gap-4">
                      <div
                        className={`h-2 rounded-full ${isToday ? "bg-brand" : "bg-info"}`}
                        style={{ width: `${Math.min(100, ((parseInt(day.end) - parseInt(day.start)) / 12) * 100)}%`, minWidth: "40px" }}
                      />
                      <span className={`text-[14px] ${isToday ? "text-brand" : "text-foreground"}`}>
                        {day.start} - {day.end}
                      </span>
                      <span className="text-[12px] text-fg-secondary">
                        {getHoursCount(day)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[14px] text-border-strong italic">Off</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Clinic details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {doctor.profile?.treatmentRoom && (
          <div className="rounded-panel border border-border bg-white px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-info" strokeWidth={1.5} />
              <span className="text-[13px] text-fg-secondary">Treatment Room</span>
            </div>
            <p className="text-[16px] font-medium text-foreground">{doctor.profile.treatmentRoom}</p>
          </div>
        )}
        {doctor.profile?.consultationFee != null && (
          <div className="rounded-panel border border-border bg-white px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-success" strokeWidth={1.5} />
              <span className="text-[13px] text-fg-secondary">Consultation Fee</span>
            </div>
            <p className="text-[16px] font-medium text-foreground">RM {doctor.profile.consultationFee}</p>
          </div>
        )}
      </div>
    </div>
  );
}
