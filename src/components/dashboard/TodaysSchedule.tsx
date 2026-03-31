"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { todaysSchedule } from "@/lib/mock-data";

const statusConfig = {
  CHECKED_IN: { label: "Checked in", bg: "bg-[#E8F5E8]", text: "text-[#30B130]" },
  SCHEDULED: { label: "Scheduled", bg: "bg-[#F0EEFF]", text: "text-[#635BFF]" },
  COMPLETED: { label: "Completed", bg: "bg-[#F0F3F7]", text: "text-[#425466]" },
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
        <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-[#0A2540]">
          Today&apos;s Schedule
        </h3>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-[4px] border border-[#E3E8EE] overflow-hidden">
            <button
              onClick={() => setView("list")}
              className={`px-2.5 py-1 text-[13px] font-medium transition-colors ${
                view === "list"
                  ? "bg-[#F0EEFF] text-[#635BFF]"
                  : "bg-white text-[#425466] hover:bg-[#F0F3F7]"
              }`}
            >
              List View
            </button>
            <button
              onClick={() => setView("timeline")}
              className={`px-2.5 py-1 text-[13px] font-medium border-l border-[#E3E8EE] transition-colors ${
                view === "timeline"
                  ? "bg-[#F0EEFF] text-[#635BFF]"
                  : "bg-white text-[#425466] hover:bg-[#F0F3F7]"
              }`}
            >
              Timeline
            </button>
          </div>
          <button className="h-7 rounded-[4px] border border-[#E3E8EE] bg-white px-2.5 text-[13px] font-medium text-[#425466] transition-colors hover:bg-[#F0F3F7]">
            Filter
          </button>
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-[6px] border border-[#E3E8EE] bg-white overflow-hidden"
        style={{
          boxShadow:
            "0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)",
        }}
      >
        {/* Table header */}
        <div className="grid grid-cols-[1fr_100px_120px_100px] gap-4 px-4 py-2.5 border-b border-[#E3E8EE] bg-[#F6F9FC]">
          <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#697386]">
            Patient
          </span>
          <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#697386]">
            Time
          </span>
          <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#697386]">
            Status
          </span>
          <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#697386]">
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
              className="grid grid-cols-[1fr_100px_120px_100px] gap-4 items-center px-4 py-3 border-b border-[#E3E8EE] last:border-b-0 transition-colors hover:bg-[#F0F3F7] cursor-pointer"
            >
              {/* Patient */}
              <div className="flex items-center gap-2.5">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-[#F0EEFF] text-[#635BFF] text-[12px] font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[15px] font-medium text-[#0A2540]">
                  {appointment.patientName}
                </span>
              </div>

              {/* Time */}
              <span className="text-[15px] text-[#425466]">
                {appointment.time}
              </span>

              {/* Status */}
              <span
                className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[13px] font-medium ${status.bg} ${status.text}`}
              >
                {status.label}
              </span>

              {/* Service */}
              <span className="text-[15px] text-[#425466]">
                {appointment.service}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
