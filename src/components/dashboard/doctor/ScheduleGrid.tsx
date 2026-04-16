"use client";

import type { WorkingSchedule, DaySchedule } from "@/types/doctor";

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
] as const;

interface ScheduleGridProps {
  value: WorkingSchedule | null;
  onChange: (schedule: WorkingSchedule) => void;
  disabled?: boolean;
}

export function ScheduleGrid({ value, onChange, disabled = false }: ScheduleGridProps) {
  const schedule = value ?? {};

  function toggleDay(day: string) {
    const current = schedule[day as keyof WorkingSchedule];
    onChange({
      ...schedule,
      [day]: current ? null : { start: "09:00", end: "17:00" },
    });
  }

  function updateTime(day: string, field: keyof DaySchedule, time: string) {
    const current = schedule[day as keyof WorkingSchedule];
    if (!current) return;
    onChange({
      ...schedule,
      [day]: { ...current, [field]: time },
    });
  }

  return (
    <div className="space-y-0 rounded-[6px] border border-[#e5edf5] overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[140px_60px_1fr_1fr] gap-0 bg-[#f6f9fc] border-b border-[#e5edf5] px-3 py-2">
        <span className="text-[13px] font-medium text-[#64748d]">Day</span>
        <span className="text-[13px] font-medium text-[#64748d]">Active</span>
        <span className="text-[13px] font-medium text-[#64748d]">Start</span>
        <span className="text-[13px] font-medium text-[#64748d]">End</span>
      </div>

      {DAYS.map(({ key, label }) => {
        const daySchedule = schedule[key as keyof WorkingSchedule];
        const isActive = !!daySchedule;

        return (
          <div
            key={key}
            className="grid grid-cols-[140px_60px_1fr_1fr] gap-0 items-center px-3 py-2 border-b border-[#e5edf5] last:border-b-0"
          >
            <span
              className={`text-[14px] ${isActive ? "text-[#061b31]" : "text-[#a3acb9]"}`}
            >
              {label}
            </span>

            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isActive}
                onChange={() => toggleDay(key)}
                disabled={disabled}
                className="h-4 w-4 rounded-[3px] border-[#e5edf5] text-[#533afd] focus:ring-[#533afd] cursor-pointer disabled:cursor-not-allowed"
              />
            </label>

            {isActive ? (
              <>
                <input
                  type="time"
                  value={daySchedule!.start}
                  onChange={(e) => updateTime(key, "start", e.target.value)}
                  disabled={disabled}
                  className="h-8 rounded-[4px] border border-[#e5edf5] bg-white px-2 text-[14px] text-[#061b31] disabled:opacity-50"
                />
                <input
                  type="time"
                  value={daySchedule!.end}
                  onChange={(e) => updateTime(key, "end", e.target.value)}
                  disabled={disabled}
                  className="h-8 rounded-[4px] border border-[#e5edf5] bg-white px-2 text-[14px] text-[#061b31] disabled:opacity-50"
                />
              </>
            ) : (
              <>
                <span className="text-[13px] text-[#a3acb9]">—</span>
                <span className="text-[13px] text-[#a3acb9]">Day off</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
