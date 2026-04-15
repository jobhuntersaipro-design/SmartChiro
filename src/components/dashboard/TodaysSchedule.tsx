"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { todaysSchedule } from "@/lib/mock-data";

const statusConfig = {
  CHECKED_IN: { label: "Checked in", bg: "bg-[#E8F5E8]", text: "text-[#30B130]" },
  SCHEDULED: { label: "Scheduled", bg: "bg-[#ededfc]", text: "text-[#533afd]" },
  COMPLETED: { label: "Completed", bg: "bg-[#f6f9fc]", text: "text-[#273951]" },
  IN_PROGRESS: { label: "In progress", bg: "bg-[#FFF8E8]", text: "text-[#F5A623]" },
  CANCELLED: { label: "Cancelled", bg: "bg-[#FDE8EC]", text: "text-[#DF1B41]" },
  NO_SHOW: { label: "No show", bg: "bg-[#FDE8EC]", text: "text-[#DF1B41]" },
} as const;

type ViewMode = "list" | "timeline";

export function TodaysSchedule() {
  const [view, setView] = useState<ViewMode>("list");

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[18px] font-light tracking-[-0.01em] text-[#061b31]">
          Today&apos;s Schedule
        </h3>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-[4px] border border-[#e5edf5] overflow-hidden">
            <button
              onClick={() => setView("list")}
              className={`px-2.5 py-1 text-[13px] font-medium transition-colors ${
                view === "list"
                  ? "bg-[#ededfc] text-[#533afd]"
                  : "bg-white text-[#273951] hover:bg-[#f6f9fc]"
              }`}
            >
              List View
            </button>
            <button
              onClick={() => setView("timeline")}
              className={`px-2.5 py-1 text-[13px] font-medium border-l border-[#e5edf5] transition-colors ${
                view === "timeline"
                  ? "bg-[#ededfc] text-[#533afd]"
                  : "bg-white text-[#273951] hover:bg-[#f6f9fc]"
              }`}
            >
              Timeline
            </button>
          </div>
          <button className="h-7 rounded-[4px] border border-[#e5edf5] bg-white px-2.5 text-[13px] font-medium text-[#273951] transition-colors hover:bg-[#f6f9fc]">
            Filter
          </button>
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-[6px] border border-[#e5edf5] bg-white overflow-hidden"
        style={{
          boxShadow:
            "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
        }}
      >
        {/* Table header */}
        <div className="grid grid-cols-[1fr_100px_120px_100px] gap-4 px-4 py-2.5 border-b border-[#e5edf5] bg-[#f6f9fc]">
          <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
            Patient
          </span>
          <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
            Time
          </span>
          <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
            Status
          </span>
          <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
            Service
          </span>
        </div>

        {/* Table rows */}
        {todaysSchedule.map((appointment) => {
          const status = statusConfig[appointment.status];
          const initials = appointment.patientName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2);

          return (
            <div
              key={appointment.id}
              className="grid grid-cols-[1fr_100px_120px_100px] gap-4 items-center px-4 py-3 border-b border-[#e5edf5] last:border-b-0 transition-colors hover:bg-[#f6f9fc] cursor-pointer"
            >
              {/* Patient */}
              <div className="flex items-center gap-2.5">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[12px] font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[15px] font-medium text-[#061b31]">
                  {appointment.patientName}
                </span>
              </div>

              {/* Time */}
              <span className="text-[15px] text-[#273951]">
                {appointment.time}
              </span>

              {/* Status */}
              <span
                className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[13px] font-medium ${status.bg} ${status.text}`}
              >
                {status.label}
              </span>

              {/* Service */}
              <span className="text-[15px] text-[#273951]">
                {appointment.service}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
