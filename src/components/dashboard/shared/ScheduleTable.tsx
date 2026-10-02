"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { AppointmentStatusActions } from "@/components/appointments/AppointmentStatusActions";
import { formatAppointmentDateTime, formatAppointmentTime } from "@/lib/format";

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
  COMPLETED:   { text: "#585858", dot: "#7d7d7d", label: "Completed"   },
  CANCELLED:   { text: "#b91c1c", dot: "#ef4444", label: "Cancelled"   },
  NO_SHOW:     { text: "#b91c1c", dot: "#ef4444", label: "No Show"     },
};

function StatusIndicator({ status }: { status: string }) {
  const c = statusConfig[status] ?? statusConfig.SCHEDULED;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium whitespace-nowrap" style={{ color: c.text }}>
      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: c.dot }} />
      {c.label}
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

  const rows = appointments.slice(0, 10);
  const th = "px-4 py-2.5 text-left text-[13px] font-medium uppercase tracking-[0.04em] text-fg-secondary whitespace-nowrap";

  return (
    <>
    {/* Phones: one card per appointment instead of a sideways-scrolling table. */}
    <ul className="sm:hidden divide-y divide-border">
      {rows.map((appt) => (
        <li key={appt.id} className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={appointmentHref(appt)}
                className="block truncate text-[15px] font-medium text-foreground hover:text-brand"
                title={`${appt.patient.firstName} ${appt.patient.lastName}`}
              >
                {appt.patient.firstName} {appt.patient.lastName}
              </Link>
              <p className="text-[13px] text-fg-secondary tabular-nums truncate">
                {formatAppointmentTime(appt.dateTime)}
                {showDoctor && appt.doctor ? ` · ${appt.doctor.name}` : ""}
              </p>
            </div>
            <StatusIndicator status={appt.status} />
          </div>
          {onStatusChanged && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <AppointmentStatusActions
                appointmentId={appt.id}
                status={appt.status}
                dateTime={appt.dateTime}
                onChanged={onStatusChanged}
                size="xs"
              />
            </div>
          )}
        </li>
      ))}
    </ul>

    <div className="relative hidden sm:block overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className={th}>When</th>
            <th className={th}>Patient</th>
            {showDoctor && <th className={th}>Doctor</th>}
            {showBranch && <th className={th}>Branch</th>}
            <th className={th}>Notes</th>
            <th className={th}>Status</th>
            {onStatusChanged && <th className="px-4 py-2.5 min-w-44"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((appt) => {
            return (
              <tr
                key={appt.id}
                className="border-b border-border last:border-b-0 hover:bg-surface-muted transition-colors duration-200 cursor-pointer"
                onClick={() => router.push(appointmentHref(appt))}
              >
                {/* Today's list — the time is enough; the full date is on hover. */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <time
                    dateTime={appt.dateTime}
                    title={formatAppointmentDateTime(appt.dateTime) ?? undefined}
                    className="text-[14px] text-foreground tabular-nums"
                  >
                    {formatAppointmentTime(appt.dateTime)}
                  </time>
                </td>
                <td className="px-4 py-3 text-[15px] text-foreground whitespace-nowrap">
                  <Link
                    href={`/dashboard/patients/${appt.patient.id}/details`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-brand hover:underline"
                  >
                    {appt.patient.firstName} {appt.patient.lastName}
                  </Link>
                </td>
                {showDoctor && (
                  <td className="px-4 py-3 text-[15px] text-foreground whitespace-nowrap">
                    {appt.doctor?.name ?? "—"}
                  </td>
                )}
                {showBranch && (
                  <td
                    className="px-4 py-3 text-[15px] text-foreground whitespace-nowrap truncate max-w-40"
                    title={appt.branch?.name}
                  >
                    {appt.branch?.name ?? "—"}
                  </td>
                )}
                <td className="px-4 py-3 text-[14px] text-fg-secondary truncate max-w-40" title={appt.notes ?? undefined}>
                  {appt.notes ?? "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusIndicator status={appt.status} />
                </td>
                {onStatusChanged && (
                  <td className="px-4 py-2 text-right whitespace-nowrap min-w-44">
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
    </>
  );
}

function appointmentHref(appt: ScheduleAppointment): string {
  const params = new URLSearchParams({ view: "list", tab: "today", appointment: appt.id });
  if (appt.branch) params.set("branch", appt.branch.id);
  return `/dashboard/appointments?${params.toString()}`;
}
