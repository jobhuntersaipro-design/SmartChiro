"use client";

import { Calendar } from "lucide-react";
import { EmptyState } from "./EmptyState";

export interface ScheduleAppointment {
  id: string;
  dateTime: string;
  duration: number;
  status: "SCHEDULED" | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  notes: string | null;
  patient: { id: string; firstName: string; lastName: string };
  doctor?: { id: string; name: string };
  branch?: { id: string; name: string };
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  SCHEDULED: { bg: "#EFF6FF", text: "#0570de", label: "Scheduled" },
  CHECKED_IN: { bg: "#FFF8E1", text: "#f5a623", label: "Checked In" },
  IN_PROGRESS: { bg: "#ededfc", text: "#533afd", label: "In Progress" },
  COMPLETED: { bg: "#ECFDF5", text: "#15be53", label: "Completed" },
  CANCELLED: { bg: "#FEF2F2", text: "#df1b41", label: "Cancelled" },
  NO_SHOW: { bg: "#F3F4F6", text: "#64748d", label: "No Show" },
};

interface ScheduleTableProps {
  appointments: ScheduleAppointment[];
  showDoctor?: boolean;
  showBranch?: boolean;
}

export function ScheduleTable({
  appointments,
  showDoctor = false,
  showBranch = false,
}: ScheduleTableProps) {
  if (appointments.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No appointments today"
        description="No appointments scheduled for today."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#e5edf5]">
            <th className="px-4 py-2.5 text-left text-[14px] font-medium text-[#64748d]">Time</th>
            <th className="px-4 py-2.5 text-left text-[14px] font-medium text-[#64748d]">Patient</th>
            {showDoctor && (
              <th className="px-4 py-2.5 text-left text-[14px] font-medium text-[#64748d]">Doctor</th>
            )}
            {showBranch && (
              <th className="px-4 py-2.5 text-left text-[14px] font-medium text-[#64748d]">Branch</th>
            )}
            <th className="px-4 py-2.5 text-left text-[14px] font-medium text-[#64748d]">Service</th>
            <th className="px-4 py-2.5 text-left text-[14px] font-medium text-[#64748d]">Status</th>
          </tr>
        </thead>
        <tbody>
          {appointments.slice(0, 10).map((appt) => {
            const time = new Date(appt.dateTime).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            });
            const status = statusConfig[appt.status] ?? statusConfig.SCHEDULED;

            return (
              <tr
                key={appt.id}
                className="border-b border-[#e5edf5] last:border-b-0 hover:bg-[#f6f9fc] transition-colors"
              >
                <td className="px-4 py-3 text-[15px] text-[#061b31] font-medium whitespace-nowrap">
                  {time}
                </td>
                <td className="px-4 py-3 text-[15px] text-[#273951]">
                  {appt.patient.firstName} {appt.patient.lastName}
                </td>
                {showDoctor && (
                  <td className="px-4 py-3 text-[15px] text-[#273951]">
                    {appt.doctor?.name ?? "—"}
                  </td>
                )}
                {showBranch && (
                  <td className="px-4 py-3 text-[15px] text-[#273951]">
                    {appt.branch?.name ?? "—"}
                  </td>
                )}
                <td className="px-4 py-3 text-[15px] text-[#64748d]">
                  {appt.notes ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-medium"
                    style={{ backgroundColor: status.bg, color: status.text }}
                  >
                    {status.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
