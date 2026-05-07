"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns/format";
import { Loader2 } from "lucide-react";
import { AppointmentActionsMenu } from "@/components/patients/AppointmentActionsMenu";
import { treatmentTokensFor, treatmentLabelFor } from "@/lib/treatment-colors";
import { STATUS_TOKENS } from "@/lib/appointment-tabs";
import type { CalendarAppointment, AvailabilitySlot } from "@/types/appointment";

interface DoctorOption {
  id: string;
  name: string | null;
  image: string | null;
}

interface Props {
  date: Date;
  doctors: DoctorOption[];
  appointments: CalendarAppointment[];
  availability: AvailabilitySlot[];
  loading?: boolean;
  isAdmin: boolean;
  currentUserId: string;
  /** Inclusive start hour (0-23). Defaults to 8 (8am). */
  startHour?: number;
  /** Exclusive end hour (1-24). Defaults to 19 (7pm). */
  endHour?: number;
  /** Pixel height of one hour. */
  hourHeightPx?: number;
  onSelectEvent: (appointment: CalendarAppointment) => void;
  onSelectSlot?: (slot: { dateTime: Date; doctorId: string }) => void;
  onEdit: (appointment: CalendarAppointment) => void;
  onCancel: (appointment: CalendarAppointment) => void;
  onDelete: (appointment: CalendarAppointment) => void;
}

const DEFAULT_START = 8; // 8 AM
const DEFAULT_END = 19; // 7 PM
const DEFAULT_HOUR = 70; // px per hour

/**
 * Custom Day-with-doctor-columns calendar inspired by Zendenta. Built from scratch (not
 * react-big-calendar) because we need full control over column headers, NOT_AVAILABLE +
 * BREAK_TIME band overlays, treatment-color cards, and the WAITING_PAYMENT highlight band.
 */
export function DoctorDayCalendar({
  date,
  doctors,
  appointments,
  availability,
  loading = false,
  isAdmin,
  currentUserId,
  startHour = DEFAULT_START,
  endHour = DEFAULT_END,
  hourHeightPx = DEFAULT_HOUR,
  onSelectEvent,
  onSelectSlot,
  onEdit,
  onCancel,
  onDelete,
}: Props) {
  const totalMinutes = (endHour - startHour) * 60;
  const totalHeight = (totalMinutes / 60) * hourHeightPx;
  const containerRef = useRef<HTMLDivElement>(null);

  // Tick every minute so the red current-time line moves
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll to the current time on first mount when viewing today
  const isToday = useMemo(
    () =>
      now.getFullYear() === date.getFullYear() &&
      now.getMonth() === date.getMonth() &&
      now.getDate() === date.getDate(),
    [now, date]
  );
  useEffect(() => {
    if (isToday && containerRef.current) {
      const minutesNow = now.getHours() * 60 + now.getMinutes();
      const minutesFromStart = minutesNow - startHour * 60;
      if (minutesFromStart > 0 && minutesFromStart < totalMinutes) {
        const scrollTop = (minutesFromStart / 60) * hourHeightPx - 100;
        containerRef.current.scrollTop = Math.max(0, scrollTop);
      }
    }
    // run once per date change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date.toDateString()]);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = startHour; h <= endHour; h++) arr.push(h);
    return arr;
  }, [startHour, endHour]);

  const apptsByDoctor = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (const a of appointments) {
      const arr = map.get(a.doctor.id) ?? [];
      arr.push(a);
      map.set(a.doctor.id, arr);
    }
    return map;
  }, [appointments]);

  const slotsByDoctor = useMemo(() => {
    const map = new Map<string, AvailabilitySlot[]>();
    for (const s of availability) {
      const arr = map.get(s.doctorId) ?? [];
      arr.push(s);
      map.set(s.doctorId, arr);
    }
    return map;
  }, [availability]);

  // Convert a Date into "minutes from startHour" within the visible window,
  // clipped to [0, totalMinutes]. Returns null if entirely outside.
  function minutesFromTop(d: Date): number | null {
    if (
      d.getFullYear() !== date.getFullYear() ||
      d.getMonth() !== date.getMonth() ||
      d.getDate() !== date.getDate()
    ) {
      return null;
    }
    const m = d.getHours() * 60 + d.getMinutes();
    if (m < startHour * 60) return 0;
    if (m >= endHour * 60) return totalMinutes;
    return m - startHour * 60;
  }

  function pxFromMinutes(m: number): number {
    return (m / 60) * hourHeightPx;
  }

  // Current-time indicator
  const currentMinuteOffset = isToday ? minutesFromTop(now) : null;

  function handleColumnClick(
    e: React.MouseEvent<HTMLDivElement>,
    doctorId: string
  ) {
    if (!onSelectSlot) return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutesFromTop = (y / hourHeightPx) * 60;
    const slotMinutes =
      Math.floor(minutesFromTop / 15) * 15 + startHour * 60;
    const slotDate = new Date(date);
    slotDate.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0);
    if (slotDate.getTime() < Date.now()) return;
    onSelectSlot({ dateTime: slotDate, doctorId });
  }

  if (doctors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-[14px] text-[#697386]">
          No doctors at this branch.
        </p>
      </div>
    );
  }

  return (
    <div className="relative bg-white border border-[#e5edf5] rounded-[6px] overflow-hidden">
      {loading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/60 pointer-events-none">
          <Loader2 className="h-5 w-5 text-[#635BFF] animate-spin" strokeWidth={2} />
        </div>
      )}

      {/* Sticky column headers — doctor avatars + names + count */}
      <div
        className="sticky top-0 z-20 flex bg-white border-b border-[#e5edf5]"
        style={{
          gridTemplateColumns: `80px repeat(${doctors.length}, minmax(220px, 1fr))`,
          display: "grid",
        }}
      >
        <div className="px-2 py-3 text-[11px] font-medium text-[#697386] tabular-nums border-r border-[#e5edf5] flex items-end justify-center">
          GMT
          <br />
          {tzOffset()}
        </div>
        {doctors.map((d) => {
          const todaysCount = (apptsByDoctor.get(d.id) ?? []).filter((a) => {
            const dt = new Date(a.dateTime);
            return (
              dt.getFullYear() === date.getFullYear() &&
              dt.getMonth() === date.getMonth() &&
              dt.getDate() === date.getDate() &&
              a.status !== "CANCELLED"
            );
          }).length;
          return (
            <div
              key={d.id}
              className="px-3 py-3 border-r border-[#e5edf5] last:border-r-0 flex items-center gap-2 min-w-0"
            >
              <DoctorAvatar doctor={d} />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[#061b31] truncate">
                  {d.name ?? "Unassigned"}
                </p>
                <p className="text-[12px] text-[#697386] truncate">
                  Today&apos;s appointment: {todaysCount} patient
                  {todaysCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable body */}
      <div
        ref={containerRef}
        className="relative overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 280px)" }}
      >
        <div
          className="grid relative"
          style={{
            gridTemplateColumns: `80px repeat(${doctors.length}, minmax(220px, 1fr))`,
            height: totalHeight,
          }}
        >
          {/* Time gutter */}
          <div className="border-r border-[#e5edf5] relative">
            {hours.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-2 text-[11px] text-[#697386] tabular-nums text-right pr-1 -translate-y-1/2"
                style={{ top: pxFromMinutes((h - startHour) * 60) }}
              >
                {format(new Date(2020, 0, 1, h, 0), "h:mm a")}
              </div>
            ))}
          </div>

          {/* Doctor columns */}
          {doctors.map((d) => (
            <div
              key={d.id}
              role={onSelectSlot ? "button" : undefined}
              onClick={(e) => handleColumnClick(e, d.id)}
              className="relative border-r border-[#e5edf5] last:border-r-0 cursor-pointer"
              style={{ height: totalHeight }}
            >
              {/* Hour grid lines */}
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-[#f1f4f8]"
                  style={{
                    top: pxFromMinutes((h - startHour) * 60),
                    borderTopStyle: i === 0 ? "none" : "solid",
                  }}
                />
              ))}
              {/* Half-hour dotted lines */}
              {hours.slice(0, -1).map((h) => (
                <div
                  key={`half-${h}`}
                  className="absolute left-0 right-0 border-t border-dotted border-[#f1f4f8]"
                  style={{ top: pxFromMinutes((h - startHour) * 60 + 30) }}
                />
              ))}

              {/* Availability slots (BREAK_TIME / TIME_OFF) */}
              {(slotsByDoctor.get(d.id) ?? []).map((slot, idx) => {
                const start = minutesFromTop(new Date(slot.start));
                const end = minutesFromTop(new Date(slot.end));
                if (start === null || end === null) return null;
                const top = pxFromMinutes(start);
                const height = pxFromMinutes(end - start);
                if (slot.kind === "BREAK_TIME") {
                  return (
                    <div
                      key={`b-${idx}`}
                      className="absolute left-0 right-0 bg-[#f8fafc] border-t border-b border-dashed border-[#e5edf5] flex items-center justify-center pointer-events-none"
                      style={{ top, height, zIndex: 1 }}
                    >
                      <span className="text-[11px] uppercase tracking-wider font-medium text-[#697386] flex items-center gap-1">
                        ☕ {slot.label || "Break time"}
                      </span>
                    </div>
                  );
                }
                // TIME_OFF — diagonal hatched
                return (
                  <div
                    key={`o-${idx}`}
                    className="absolute left-0 right-0 pointer-events-none flex items-center justify-center"
                    style={{
                      top,
                      height,
                      zIndex: 1,
                      backgroundImage:
                        "repeating-linear-gradient(45deg, transparent, transparent 8px, #e5edf5 8px, #e5edf5 9px)",
                      backgroundColor: "#fafbfd",
                    }}
                  >
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-[#697386]">
                      {slot.leaveType
                        ? slot.leaveType.replace(/_/g, " ")
                        : "Not available"}
                    </span>
                  </div>
                );
              })}

              {/* Appointments */}
              {(apptsByDoctor.get(d.id) ?? []).map((a) => {
                const start = minutesFromTop(new Date(a.dateTime));
                const end = minutesFromTop(
                  new Date(new Date(a.dateTime).getTime() + a.duration * 60_000)
                );
                if (start === null || end === null) return null;
                return (
                  <AppointmentBlock
                    key={a.id}
                    appointment={a}
                    top={pxFromMinutes(start)}
                    height={Math.max(36, pxFromMinutes(end - start))}
                    isAdmin={isAdmin}
                    currentUserId={currentUserId}
                    onSelectEvent={() => onSelectEvent(a)}
                    onEdit={() => onEdit(a)}
                    onCancel={() => onCancel(a)}
                    onDelete={() => onDelete(a)}
                  />
                );
              })}
            </div>
          ))}

          {/* Current-time indicator (full width across all doctor columns) */}
          {currentMinuteOffset !== null && (
            <div
              className="absolute left-[80px] right-0 pointer-events-none z-10 flex items-center"
              style={{ top: pxFromMinutes(currentMinuteOffset) }}
            >
              <span className="absolute -left-12 -top-2.5 inline-flex items-center justify-center bg-[#061b31] text-white text-[11px] font-medium tabular-nums rounded-[3px] px-1.5 py-0.5">
                {format(now, "h:mm a")}
              </span>
              <div className="h-[1.5px] w-full bg-[#DF1B41]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DoctorAvatar({ doctor }: { doctor: DoctorOption }) {
  if (doctor.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={doctor.image}
        alt={doctor.name ?? "doctor"}
        className="h-9 w-9 rounded-full object-cover shrink-0"
      />
    );
  }
  const initials =
    (doctor.name ?? "?")
      .split(" ")
      .map((s) => s.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  return (
    <div className="h-9 w-9 rounded-full bg-[#F0EEFF] text-[12px] font-semibold text-[#635BFF] flex items-center justify-center shrink-0">
      {initials}
    </div>
  );
}

function AppointmentBlock({
  appointment,
  top,
  height,
  isAdmin,
  currentUserId,
  onSelectEvent,
  onEdit,
  onCancel,
  onDelete,
}: {
  appointment: CalendarAppointment;
  top: number;
  height: number;
  isAdmin: boolean;
  currentUserId: string;
  onSelectEvent: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const treatment = treatmentTokensFor(appointment.treatmentType);
  const status = STATUS_TOKENS[appointment.status];
  const start = new Date(appointment.dateTime);
  const end = new Date(start.getTime() + appointment.duration * 60_000);
  const canEdit = isAdmin || appointment.doctor.id === currentUserId;
  const canDelete = isAdmin;

  const struck =
    appointment.status === "CANCELLED" || appointment.status === "NO_SHOW";

  const showWaitingBand =
    appointment.hasUnpaidInvoice && appointment.status === "COMPLETED";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onSelectEvent();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectEvent();
        }
      }}
      className="absolute left-1 right-1 rounded-[6px] cursor-pointer transition-shadow hover:shadow-md group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#635BFF] overflow-hidden"
      style={{
        top,
        height,
        backgroundColor: treatment.bg,
        borderLeft: `3px solid ${treatment.accent}`,
        zIndex: 5,
      }}
    >
      {showWaitingBand && (
        <div
          className="absolute inset-x-0 top-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#92400E] bg-[#FEF3C7] border-b border-[#FDE68A] z-10"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(251,191,36,0.15) 4px, rgba(251,191,36,0.15) 5px)",
          }}
        >
          ⌛ Waiting payment
        </div>
      )}
      <div className={`p-2 h-full flex flex-col gap-1 ${showWaitingBand ? "pt-5" : ""}`}>
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <p
              className={`text-[13px] font-semibold text-[#061b31] truncate ${
                struck ? "line-through opacity-70" : ""
              }`}
            >
              {appointment.patient.firstName} {appointment.patient.lastName}
            </p>
            <p className="text-[11px] text-[#425466] tabular-nums truncate">
              {format(start, "h:mm a")} → {format(end, "h:mm a")}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: status.bg, color: status.text }}
            >
              {status.pulse && (
                <span
                  className="inline-block h-1 w-1 rounded-full animate-subtle-blink"
                  style={{ backgroundColor: status.text }}
                  aria-hidden="true"
                />
              )}
              {status.label}
            </span>
            <div
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <AppointmentActionsMenu
                canEdit={canEdit}
                canDelete={canDelete}
                onEdit={onEdit}
                onCancel={onCancel}
                onDelete={onDelete}
              />
            </div>
          </div>
        </div>
        {appointment.treatmentType && height > 60 && (
          <span
            className="self-start inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: treatment.pillBg, color: treatment.pillText }}
          >
            {treatmentLabelFor(appointment.treatmentType)}
          </span>
        )}
      </div>
    </div>
  );
}

function tzOffset(): string {
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const h = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, "0");
  const m = String(Math.abs(offsetMin) % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}
