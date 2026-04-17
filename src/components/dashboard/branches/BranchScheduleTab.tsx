"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScheduleAppointment, ScheduleDoctor } from "@/types/branch";
import { WeekCalendar } from "./WeekCalendar";

interface BranchScheduleTabProps {
  branchId: string;
  operatingHours: string | null;
}

function getWeekRange(date: Date): { start: Date; end: Date; label: string } {
  const d = new Date(date);
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - day); // Sunday
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  const startMonth = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endDate = new Date(end.getTime() - 86400000); // Saturday
  const endMonth = endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const label = `${startMonth} — ${endMonth}`;

  return { start, end, label };
}

export function BranchScheduleTab({ branchId, operatingHours }: BranchScheduleTabProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<ScheduleAppointment[]>([]);
  const [doctors, setDoctors] = useState<ScheduleDoctor[]>([]);
  const [loading, setLoading] = useState(true);

  const week = getWeekRange(currentDate);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/branches/${branchId}/schedule?start=${week.start.toISOString()}&end=${week.end.toISOString()}`
      );
      if (res.ok) {
        const data = await res.json();
        setAppointments(data.appointments);
        setDoctors(data.doctors);
      }
    } finally {
      setLoading(false);
    }
  }, [branchId, week.start.toISOString(), week.end.toISOString()]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  function goToday() {
    setCurrentDate(new Date());
  }

  function goPrev() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  }

  function goNext() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  }

  return (
    <div className="space-y-4">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-normal text-[#061b31]">{week.label}</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            className="h-8 w-8 p-0 rounded-[4px] border-[#e5edf5] cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToday}
            className="h-8 px-3 rounded-[4px] border-[#e5edf5] text-[13px] cursor-pointer"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            className="h-8 w-8 p-0 rounded-[4px] border-[#e5edf5] cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {/* Doctor legend */}
      {doctors.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          {doctors.map((doc) => (
            <div key={doc.id} className="flex items-center gap-1.5 text-[13px] text-[#273951]">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: doc.color }} />
              {doc.name ?? "Unknown"}
            </div>
          ))}
        </div>
      )}

      {/* Calendar */}
      {loading ? (
        <div className="h-96 rounded-[6px] bg-[#e5edf5] animate-pulse" />
      ) : (
        <WeekCalendar
          weekStart={week.start}
          appointments={appointments}
          doctors={doctors}
          operatingHours={operatingHours}
        />
      )}

      {/* Status legend */}
      <div className="flex items-center gap-4 text-[12px] text-[#64748d]">
        <span className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-[#0570DE]" /> Scheduled
        </span>
        <span className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-[#30B130]" /> Completed
        </span>
        <span className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-[#F5A623]" /> In Progress
        </span>
        <span className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-[#DF1B41]" /> Cancelled
        </span>
      </div>
    </div>
  );
}
