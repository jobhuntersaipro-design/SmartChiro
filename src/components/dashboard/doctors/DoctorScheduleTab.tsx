"use client";

import { Clock, MapPin, DollarSign } from "lucide-react";
import type { DoctorDetail, WorkingSchedule, DaySchedule } from "@/types/doctor";

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
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return days[new Date().getDay()];
}

function getHoursCount(day: DaySchedule | null | undefined): string {
  if (!day) return "-";
  const [startH, startM] = day.start.split(":").map(Number);
  const [endH, endM] = day.end.split(":").map(Number);
  const hours = (endH * 60 + endM - startH * 60 - startM) / 60;
  return `${hours}h`;
}

export function DoctorScheduleTab({ doctor }: DoctorScheduleTabProps) {
  const schedule = (doctor.profile?.workingSchedule ?? null) as WorkingSchedule | null;
  const todayKey = getTodayDayKey();

  if (!schedule) {
    return (
      <div className="py-12 text-center">
        <Clock className="h-10 w-10 mx-auto text-[#e5edf5] mb-3" strokeWidth={1} />
        <p className="text-[15px] text-[#64748d]">No schedule has been set for this doctor.</p>
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
      <div className="rounded-[6px] border border-[#e5edf5] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e5edf5]">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#533afd]" strokeWidth={1.5} />
            <h2 className="text-[16px] font-medium text-[#061b31]">Weekly Schedule</h2>
            <span className="text-[13px] text-[#64748d] ml-auto">
              {workingDays} days &middot; {Math.round(totalHours)}h/week
            </span>
          </div>
        </div>

        <div className="divide-y divide-[#e5edf5]">
          {dayKeys.map((key) => {
            const day = schedule[key];
            const isToday = key === todayKey;
            const isWorking = !!day;

            return (
              <div
                key={key}
                className={`flex items-center px-5 py-3.5 transition-colors ${
                  isToday ? "bg-[#ededfc]" : "hover:bg-[#F6F9FC]"
                }`}
              >
                <div className="w-32">
                  <span
                    className={`text-[14px] ${
                      isToday
                        ? "text-[#533afd] font-medium"
                        : "text-[#061b31] font-medium"
                    }`}
                  >
                    {dayLabels[key]}
                  </span>
                  {isToday && (
                    <span className="ml-2 text-[11px] text-[#533afd] bg-white rounded-full px-2 py-0.5 border border-[#533afd]/20">
                      Today
                    </span>
                  )}
                </div>

                <div className="flex-1">
                  {isWorking ? (
                    <div className="flex items-center gap-4">
                      <div
                        className={`h-2 rounded-full ${isToday ? "bg-[#533afd]" : "bg-[#0570DE]"}`}
                        style={{ width: `${Math.min(100, ((parseInt(day.end) - parseInt(day.start)) / 12) * 100)}%`, minWidth: "40px" }}
                      />
                      <span className={`text-[14px] ${isToday ? "text-[#533afd]" : "text-[#273951]"}`}>
                        {day.start} - {day.end}
                      </span>
                      <span className="text-[12px] text-[#64748d]">
                        {getHoursCount(day)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[14px] text-[#c1c9d2] italic">Off</span>
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
          <div className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-[#0570DE]" strokeWidth={1.5} />
              <span className="text-[13px] text-[#64748d]">Treatment Room</span>
            </div>
            <p className="text-[16px] font-medium text-[#061b31]">{doctor.profile.treatmentRoom}</p>
          </div>
        )}
        {doctor.profile?.consultationFee != null && (
          <div className="rounded-[6px] border border-[#e5edf5] bg-white px-5 py-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-[#30B130]" strokeWidth={1.5} />
              <span className="text-[13px] text-[#64748d]">Consultation Fee</span>
            </div>
            <p className="text-[16px] font-medium text-[#061b31]">RM {doctor.profile.consultationFee}</p>
          </div>
        )}
      </div>
    </div>
  );
}
