"use client";

import { Calendar, Users, CheckCircle2, BarChart3 } from "lucide-react";
import type { CalendarAppointment } from "@/types/appointment";
import { deriveStats } from "@/lib/appointment-tabs";
import { clinicDateKey } from "@/lib/clinic-time";
import { plural, todayProgressLabel } from "@/lib/format";

interface Props {
  appointments: CalendarAppointment[];
  /** Selected day in the sidebar — drives the "Today / Selected day" stat. */
  selectedDate: Date;
  /** Active doctor filter, used for the "doctors" sub-text on the week card. */
  doctorFilterCount: number;
  /** Total doctors available in the current branch — used when no filter applied. */
  totalDoctors: number;
}

function isToday(d: Date): boolean {
  return clinicDateKey(d) === clinicDateKey();
}

export function AppointmentStatCards({
  appointments,
  selectedDate,
  doctorFilterCount,
  totalDoctors,
}: Props) {
  const stats = deriveStats(
    appointments,
    Array.from({ length: doctorFilterCount || totalDoctors }, (_, i) => String(i)),
    new Date(),
    selectedDate
  );
  const completionRate =
    stats.totalForCompletionRate === 0
      ? null
      : Math.round((stats.completionCount / stats.totalForCompletionRate) * 100);
  const showingToday = isToday(selectedDate);
  const dayLabel = showingToday ? "Today" : "Selected day";
  const doctorsLabel =
    doctorFilterCount > 0 ? `${doctorFilterCount} filtered` : `${totalDoctors} doctors`;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        icon={<Calendar className="h-4 w-4 text-brand" strokeWidth={1.75} />}
        label={dayLabel}
        primary={stats.todayCount === 0 ? "No appointments" : plural(stats.todayCount, "appointment")}
        secondary={
          showingToday ? todayProgressLabel(stats.todayCount, stats.todayRemaining) : "All bookings"
        }
      />
      <StatCard
        icon={<Users className="h-4 w-4 text-info" strokeWidth={1.75} />}
        label="This week"
        primary={plural(stats.weekCount, "appointment")}
        secondary={doctorsLabel}
      />
      <StatCard
        icon={<CheckCircle2 className="h-4 w-4 text-success" strokeWidth={1.75} />}
        label="Completion rate"
        primary={completionRate === null ? "—" : `${completionRate}%`}
        secondary={
          stats.totalForCompletionRate === 0
            ? "No bookings yet"
            : `${stats.completionCount}/${stats.totalForCompletionRate} completed`
        }
      />
      <StatCard
        icon={<BarChart3 className="h-4 w-4 text-warning" strokeWidth={1.75} />}
        label="Stale"
        primary={`${countStale(appointments)}`}
        secondary="Past + still SCHEDULED"
      />
    </div>
  );
}

function countStale(appointments: CalendarAppointment[]): number {
  const now = Date.now();
  return appointments.reduce(
    (acc, a) =>
      acc +
      (a.status === "SCHEDULED" && new Date(a.dateTime).getTime() < now ? 1 : 0),
    0
  );
}

function StatCard({
  icon,
  label,
  primary,
  secondary,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div
      className="bg-white border border-border rounded-panel p-4 transition-shadow hover:shadow-sm"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center gap-2 text-[12px] uppercase tracking-wider text-fg-muted font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-[20px] font-semibold text-foreground tabular-nums">
        {primary}
      </div>
      <div className="text-[12px] text-fg-muted mt-0.5">{secondary}</div>
    </div>
  );
}
