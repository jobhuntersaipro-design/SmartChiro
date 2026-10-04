"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScheduleAppointment, ScheduleDoctor } from "@/types/branch";
import { WeekCalendar } from "./WeekCalendar";
import { CLINIC_TIME_ZONE, clinicCalendar, clinicParts } from "@/lib/clinic-time";

interface BranchScheduleTabProps {
  branchId: string;
  operatingHours: string | null;
}

/** Sunday–Saturday clinic week `weekOffset` weeks from this one. */
function getWeekRange(weekOffset: number): { start: Date; end: Date; label: string } {
  const cal = clinicCalendar();
  const sunday = -clinicParts(new Date()).weekday + 7 * weekOffset;
  const start = cal.addDays(sunday);
  const end = cal.addDays(sunday + 7);

  const startMonth = start.toLocaleDateString("en-US", { timeZone: CLINIC_TIME_ZONE, month: "short", day: "numeric" });
  const endDate = new Date(end.getTime() - 86400000); // Saturday
  const endMonth = endDate.toLocaleDateString("en-US", { timeZone: CLINIC_TIME_ZONE, month: "short", day: "numeric", year: "numeric" });
  const label = `${startMonth} — ${endMonth}`;

  return { start, end, label };
}

export function BranchScheduleTab({ branchId, operatingHours }: BranchScheduleTabProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [appointments, setAppointments] = useState<ScheduleAppointment[]>([]);
  const [doctors, setDoctors] = useState<ScheduleDoctor[]>([]);
  const [loading, setLoading] = useState(true);

  const week = getWeekRange(weekOffset);

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
    setWeekOffset(0);
  }

  function goPrev() {
    setWeekOffset((w) => w - 1);
  }

  function goNext() {
    setWeekOffset((w) => w + 1);
  }

  return (
    <div className="space-y-4">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-normal text-foreground">{week.label}</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            className="h-8 w-8 p-0 rounded-control border-border cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToday}
            className="h-8 px-3 rounded-control border-border text-[13px] cursor-pointer"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            className="h-8 w-8 p-0 rounded-control border-border cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {/* Doctor legend */}
      {doctors.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          {doctors.map((doc) => (
            <div key={doc.id} className="flex items-center gap-1.5 text-[13px] text-foreground">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: doc.color }} />
              {doc.name ?? "Unknown"}
            </div>
          ))}
        </div>
      )}

      {/* Calendar */}
      {loading ? (
        <div className="h-96 rounded-panel bg-border animate-pulse" />
      ) : (
        <WeekCalendar
          weekStart={week.start}
          appointments={appointments}
          doctors={doctors}
          operatingHours={operatingHours}
        />
      )}

      {/* Status legend */}
      <div className="flex items-center gap-4 text-[12px] text-fg-secondary">
        <span className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-info" /> Scheduled
        </span>
        <span className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-success" /> Completed
        </span>
        <span className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-warning" /> In Progress
        </span>
        <span className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-danger" /> Cancelled
        </span>
      </div>
    </div>
  );
}
