"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { AppointmentStatusActions } from "@/components/appointments/AppointmentStatusActions";
import { formatAppointmentDateTime, getAppointmentWeekday } from "@/lib/format";

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

// Dot + colored text — same convention as patients page tables.
const statusConfig: Record<string, { text: string; dot: string; label: string }> = {
  SCHEDULED:   { text: "#15803d", dot: "#22c55e", label: "Scheduled"   },
  CHECKED_IN:  { text: "#15803d", dot: "#22c55e", label: "Checked In"  },
  IN_PROGRESS: { text: "#854d0e", dot: "#eab308", label: "In Progress" },
  COMPLETED:   { text: "#64748d", dot: "#94a3b8", label: "Completed"   },
  CANCELLED:   { text: "#b91c1c", dot: "#ef4444", label: "Cancelled"   },
  NO_SHOW:     { text: "#b91c1c", dot: "#ef4444", label: "No Show"     },
};

function StatusIndicator({ status }: { status: string }) {
  const c = statusConfig[status] ?? statusConfig.SCHEDULED;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: c.text }}>
      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

function WeekdayBadge({ label, isWeekend }: { label: string; isWeekend: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[3px] px-1 py-px text-[10px] font-semibold uppercase tracking-wider flex-shrink-0"
      style={{
        background: isWeekend ? "#fef3c7" : "#f1f5f9",
        color: isWeekend ? "#854d0e" : "#475569",
      }}
    >
      {label}
    </span>
  );
}

interface ScheduleTableProps {
  appointments: ScheduleAppointment[];
  showDoctor?: boolean;
  showBranch?: boolean;
  /** Shows one-click Check in / Start / Complete / No-show; called after a change. */
  onStatusChanged?: () => void;
}

export function ScheduleTable({
  appointments,
  showDoctor = false,
  showBranch = false,
  onStatusChanged,
}: ScheduleTableProps) {
  const router = useRouter();

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
            <th className="px-4 py-2.5 text-left text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">When</th>
            <th className="px-4 py-2.5 text-left text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Patient</th>
            {showDoctor && (
              <th className="px-4 py-2.5 text-left text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Doctor</th>
            )}
            {showBranch && (
              <th className="px-4 py-2.5 text-left text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Branch</th>
            )}
            <th className="px-4 py-2.5 text-left text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Notes</th>
            <th className="px-4 py-2.5 text-left text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">Status</th>
            {onStatusChanged && <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {appointments.slice(0, 10).map((appt) => {
            const dow = getAppointmentWeekday(appt.dateTime);
            const dateText = formatAppointmentDateTime(appt.dateTime);
            const params = new URLSearchParams({ view: "list", tab: "today", appointment: appt.id });
            if (appt.branch) params.set("branch", appt.branch.id);

            return (
              <tr
                key={appt.id}
                className="border-b border-[#e5edf5] last:border-b-0 hover:bg-[#f6f9fc] transition-colors duration-200 cursor-pointer"
                onClick={() => router.push(`/dashboard/appointments?${params.toString()}`)}
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {dow && <WeekdayBadge label={dow.label} isWeekend={dow.isWeekend} />}
                    <span className="text-[14px] text-[#273951] tabular-nums">{dateText}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-[15px] text-[#273951]">
                  <Link
                    href={`/dashboard/patients/${appt.patient.id}/details`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-[#533afd] hover:underline"
                  >
                    {appt.patient.firstName} {appt.patient.lastName}
                  </Link>
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
                <td className="px-4 py-3 text-[14px] text-[#64748d] truncate max-w-50">
                  {appt.notes ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusIndicator status={appt.status} />
                </td>
                {onStatusChanged && (
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <span className="inline-flex gap-1.5">
                      <AppointmentStatusActions
                        appointmentId={appt.id}
                        status={appt.status}
                        dateTime={appt.dateTime}
                        onChanged={onStatusChanged}
                        size="xs"
                      />
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
