"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  Views,
  type View,
  type SlotInfo,
} from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format } from "date-fns/format";
import { parse } from "date-fns/parse";
import { startOfWeek } from "date-fns/startOfWeek";
import { getDay } from "date-fns/getDay";
import { addMinutes } from "date-fns/addMinutes";
import { differenceInMinutes } from "date-fns/differenceInMinutes";
import { enUS } from "date-fns/locale/en-US";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

import { CreateAppointmentDialog } from "@/components/patients/CreateAppointmentDialog";
import { EditAppointmentDialog } from "@/components/patients/EditAppointmentDialog";
import { CancelAppointmentDialog } from "@/components/patients/CancelAppointmentDialog";
import { DeleteAppointmentDialog } from "@/components/patients/DeleteAppointmentDialog";

import { AppointmentEventCard } from "./AppointmentEventCard";
import { AppointmentEventPopover } from "./AppointmentEventPopover";
import { ConflictOverrideDialog } from "./ConflictOverrideDialog";
import { CalendarFilterBar } from "./CalendarFilterBar";
import { DoctorDayCalendar } from "./DoctorDayCalendar";
import { doctorColor } from "./doctor-color";
import type { CalendarAppointment, ConflictItem, AvailabilitySlot } from "@/types/appointment";

import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "./calendar.css";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

// react-big-calendar's withDragAndDrop HOC types don't propagate the extra
// onEventDrop / onEventResize props cleanly through `Calendar`'s generics.
// Cast to a permissive component type so the JSX usage compiles; runtime is unchanged.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DnDCalendar = withDragAndDrop(BigCalendar as never) as React.ComponentType<any>;

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId?: string;
  appointment: CalendarAppointment;
}

interface Resource {
  resourceId: string;
  resourceTitle: string;
  color: string;
}

interface BranchOption {
  id: string;
  name: string;
  role: string;
  doctors: { id: string; name: string; image: string | null }[];
}

interface Props {
  currentUserId: string;
  branches: BranchOption[];
  /** When mounted inside AppointmentsPageShell, the page-level top bar already
   * renders the title and "+ New Appointment" — hide ours to avoid duplication. */
  hideHeader?: boolean;
  /** When mounted inside AppointmentsPageShell, the shell owns the `view` URL
   * param (list|calendar). Pass true to skip our internal `view=day|week|month`
   * URL sync to avoid clobbering. */
  disableUrlSync?: boolean;
}

const VIEW_FROM_PARAM: Record<string, View> = {
  day: Views.DAY,
  week: Views.WEEK,
  month: Views.MONTH,
};
const PARAM_FROM_VIEW: Record<View, string> = {
  [Views.DAY]: "day",
  [Views.WEEK]: "week",
  [Views.MONTH]: "month",
  [Views.AGENDA]: "agenda",
  [Views.WORK_WEEK]: "week",
};

function getWindow(date: Date, view: View): { start: Date; end: Date } {
  const start = new Date(date);
  const end = new Date(date);
  if (view === Views.DAY) {
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
  } else if (view === Views.MONTH) {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1);
    end.setDate(1);
    end.setHours(0, 0, 0, 0);
  } else {
    // Week (default)
    const dow = start.getDay();
    const monOffset = (dow + 6) % 7; // mon=0
    start.setDate(start.getDate() - monOffset);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

export function AppointmentsCalendarView({
  currentUserId,
  branches,
  hideHeader = false,
  disableUrlSync = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const isAdmin = useMemo(
    () =>
      branches.some(
        (b) => b.role === "OWNER" || b.role === "ADMIN"
      ),
    [branches]
  );

  // ─── URL state ───
  const initialBranchId =
    searchParams.get("branch") ?? branches[0]?.id ?? "";
  const initialDoctorIds =
    searchParams.get("doctors")?.split(",").filter(Boolean) ?? [];
  const initialView =
    VIEW_FROM_PARAM[searchParams.get("view") ?? "day"] ?? Views.DAY;
  const initialDate = searchParams.get("date")
    ? new Date(searchParams.get("date")!)
    : new Date();

  const [branchId, setBranchId] = useState<string>(initialBranchId);
  const [doctorIds, setDoctorIds] = useState<string[]>(initialDoctorIds);
  const [view, setView] = useState<View>(initialView);
  const [date, setDate] = useState<Date>(initialDate);
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Dialog state ───
  const [createOpen, setCreateOpen] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<{
    dateTime: string;
    doctorId: string;
  } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CalendarAppointment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarAppointment | null>(null);
  const [popoverEvent, setPopoverEvent] = useState<CalendarAppointment | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);
  const [conflictDialog, setConflictDialog] = useState<{
    conflicts: ConflictItem[];
    onOverride: () => void;
    onCancel: () => void;
  } | null>(null);

  const branch = useMemo(
    () => branches.find((b) => b.id === branchId),
    [branchId, branches]
  );

  // ─── Sync URL when state changes (skip when shell owns the URL) ───
  useEffect(() => {
    if (disableUrlSync) return;
    const params = new URLSearchParams();
    params.set("branch", branchId);
    if (doctorIds.length > 0) params.set("doctors", doctorIds.join(","));
    params.set("view", PARAM_FROM_VIEW[view] ?? "week");
    params.set("date", date.toISOString().split("T")[0]);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [branchId, doctorIds, view, date, router, disableUrlSync]);

  // ─── Fetch appointments + availability when window changes ───
  const fetchAppointments = useCallback(async () => {
    if (!branchId) return;
    const { start, end } = getWindow(date, view);
    const params = new URLSearchParams({
      branchId,
      start: start.toISOString(),
      end: end.toISOString(),
    });
    if (doctorIds.length > 0) params.set("doctorIds", doctorIds.join(","));
    const availParams = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
    });
    if (doctorIds.length > 0) availParams.set("doctorIds", doctorIds.join(","));
    setLoading(true);
    setError(null);
    try {
      const [apptRes, availRes] = await Promise.all([
        fetch(`/api/appointments?${params.toString()}`),
        fetch(`/api/branches/${branchId}/availability?${availParams.toString()}`),
      ]);
      if (!apptRes.ok) {
        const body = await apptRes.json().catch(() => ({}));
        if (body.error === "window_too_wide") {
          setError(`Too many events (${body.count}) — narrow your filters.`);
        } else {
          setError(body.error ?? "Failed to load appointments");
        }
        setAppointments([]);
      } else {
        const body = await apptRes.json();
        setAppointments(body.appointments);
      }
      if (availRes.ok) {
        const body = await availRes.json();
        setAvailability(body.slots);
      } else {
        setAvailability([]);
      }
    } catch {
      setError("Network error loading appointments");
      setAppointments([]);
      setAvailability([]);
    } finally {
      setLoading(false);
    }
  }, [branchId, date, view, doctorIds]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // ─── Map appointments → calendar events ───
  const events: CalendarEvent[] = useMemo(
    () =>
      appointments.map((a) => ({
        id: a.id,
        title: `${a.patient.firstName} ${a.patient.lastName}`,
        start: new Date(a.dateTime),
        end: addMinutes(new Date(a.dateTime), a.duration),
        resourceId: a.doctor.id,
        appointment: a,
      })),
    [appointments]
  );

  // ─── Resource columns (Day view + 2+ doctors) ───
  const resources: Resource[] | undefined = useMemo(() => {
    if (view !== Views.DAY || doctorIds.length < 2) return undefined;
    return doctorIds.map((id) => {
      const doc = branch?.doctors.find((d) => d.id === id);
      return {
        resourceId: id,
        resourceTitle: doc?.name ?? "Unknown",
        color: doctorColor(id),
      };
    });
  }, [view, doctorIds, branch]);

  // ─── Slot click — open Create dialog ───
  const handleSelectSlot = useCallback(
    (slot: SlotInfo) => {
      const slotStart = slot.start as Date;
      if (slotStart.getTime() < Date.now()) {
        toast.error("Can't create an appointment in the past");
        return;
      }
      const resourceDoctorId =
        typeof slot.resourceId === "string" ? slot.resourceId : doctorIds[0] ?? currentUserId;
      setCreatePrefill({
        dateTime: slotStart.toISOString(),
        doctorId: resourceDoctorId,
      });
      setCreateOpen(true);
    },
    [doctorIds, currentUserId]
  );

  // ─── Event click — show popover ───
  const handleSelectEvent = useCallback(
    (event: CalendarEvent, e: React.SyntheticEvent<HTMLElement>) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPopoverAnchor(rect);
      setPopoverEvent(event.appointment);
    },
    []
  );

  // ─── Drag-and-drop handler ───
  const conflictResolverRef = useRef<((override: boolean) => void) | null>(null);

  const handleEventDrop = useCallback(
    async ({
      event,
      start,
      end,
      resourceId,
    }: {
      event: CalendarEvent;
      start: Date | string;
      end: Date | string;
      resourceId?: string | number;
    }) => {
      const newStart = start instanceof Date ? start : new Date(start);
      const newEnd = end instanceof Date ? end : new Date(end);
      const newDoctorId =
        (typeof resourceId === "string" ? resourceId : null) ?? event.appointment.doctor.id;

      // 1. Past-time guard
      if (newStart.getTime() < Date.now()) {
        toast.error("Can't move an appointment to the past");
        await fetchAppointments(); // snap back
        return;
      }

      // 2. Doctor reassign requires OWNER/ADMIN
      const doctorChanged = newDoctorId !== event.appointment.doctor.id;
      if (doctorChanged && !isAdmin) {
        toast.error("Only owners and admins can reassign appointments to another doctor");
        await fetchAppointments();
        return;
      }

      // 3. Other-doctor's appointment requires OWNER/ADMIN
      if (event.appointment.doctor.id !== currentUserId && !isAdmin) {
        toast.error("You can only move your own appointments");
        await fetchAppointments();
        return;
      }

      const newDuration = differenceInMinutes(newEnd, newStart);

      // 4. Pre-flight conflict check
      const conflictUrl = new URL("/api/appointments/check-conflict", window.location.origin);
      conflictUrl.searchParams.set("doctorId", newDoctorId);
      conflictUrl.searchParams.set("dateTime", newStart.toISOString());
      conflictUrl.searchParams.set("duration", String(newDuration));
      conflictUrl.searchParams.set("excludeId", event.id);

      const conflictRes = await fetch(conflictUrl);
      if (conflictRes.ok) {
        const conflictBody = await conflictRes.json();
        if (conflictBody.conflicts && conflictBody.conflicts.length > 0) {
          if (!isAdmin) {
            toast.error(
              `${conflictBody.conflicts[0].patient.firstName} ${conflictBody.conflicts[0].patient.lastName} already booked at this time`
            );
            await fetchAppointments();
            return;
          }
          // OWNER/ADMIN — ask
          const userOk = await new Promise<boolean>((resolve) => {
            conflictResolverRef.current = resolve;
            setConflictDialog({
              conflicts: conflictBody.conflicts,
              onOverride: () => {
                setConflictDialog(null);
                conflictResolverRef.current?.(true);
              },
              onCancel: () => {
                setConflictDialog(null);
                conflictResolverRef.current?.(false);
              },
            });
          });
          if (!userOk) {
            await fetchAppointments();
            return;
          }
        }
      }

      // 5. PATCH
      const res = await fetch(`/api/appointments/${event.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dateTime: newStart.toISOString(),
          duration: newDuration,
          ...(doctorChanged ? { doctorId: newDoctorId } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Save failed (${res.status})`);
        await fetchAppointments();
        return;
      }
      toast.success("Appointment updated");
      await fetchAppointments();
    },
    [currentUserId, fetchAppointments, isAdmin]
  );

  const handleEventResize = handleEventDrop; // same logic

  // ─── Render ───
  if (branches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-[18px] font-medium text-[#061b31] mb-2">
          You haven&apos;t joined any branches yet
        </h2>
        <p className="text-[14px] text-[#64748d]">
          Create a branch from the Branches page to start scheduling appointments.
        </p>
      </div>
    );
  }

  return (
    <div className={hideHeader ? "flex flex-col gap-4 h-full" : "flex flex-col gap-4 h-[calc(100vh-110px)]"}>
      {!hideHeader && (
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="text-[23px] font-light tracking-[-0.18px] text-[#061b31]">Appointments</h1>
            <p className="text-[14px] text-[#64748d]">Schedule, reschedule, and manage all bookings.</p>
          </div>
          <Button
            onClick={() => {
              setCreatePrefill(null);
              setCreateOpen(true);
            }}
            className="h-9 rounded-[4px] bg-[#635BFF] hover:bg-[#5851EB] text-white text-[14px] gap-1.5"
          >
            New Appointment
          </Button>
        </div>
      )}

      <CalendarFilterBar
        branches={branches}
        branchId={branchId}
        doctorIds={doctorIds}
        view={view}
        date={date}
        onBranchChange={(id) => {
          setBranchId(id);
          setDoctorIds([]); // clear doctor filter when branch changes
        }}
        onDoctorIdsChange={setDoctorIds}
        onViewChange={setView}
        onDateChange={setDate}
        onPrev={() => {
          const next = new Date(date);
          if (view === Views.DAY) next.setDate(next.getDate() - 1);
          else if (view === Views.WEEK) next.setDate(next.getDate() - 7);
          else if (view === Views.MONTH) next.setMonth(next.getMonth() - 1);
          setDate(next);
        }}
        onNext={() => {
          const next = new Date(date);
          if (view === Views.DAY) next.setDate(next.getDate() + 1);
          else if (view === Views.WEEK) next.setDate(next.getDate() + 7);
          else if (view === Views.MONTH) next.setMonth(next.getMonth() + 1);
          setDate(next);
        }}
        onToday={() => setDate(new Date())}
      />

      {error && (
        <div className="px-3 py-2 rounded-[4px] bg-[#FDE7EC] text-[13px] text-[#DF1B41]">
          {error}
        </div>
      )}

      {view === Views.DAY ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <DoctorDayCalendar
            date={date}
            doctors={
              doctorIds.length === 0
                ? branch?.doctors ?? []
                : (branch?.doctors ?? []).filter((d) => doctorIds.includes(d.id))
            }
            appointments={appointments}
            availability={availability}
            loading={loading}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            onSelectEvent={(a) => {
              setPopoverEvent(a);
              setPopoverAnchor(
                new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0)
              );
            }}
            onSelectSlot={(slot) => {
              setCreatePrefill({
                dateTime: slot.dateTime.toISOString(),
                doctorId: slot.doctorId,
              });
              setCreateOpen(true);
            }}
            onEdit={(a) => setEditId(a.id)}
            onCancel={(a) => setCancelTarget(a)}
            onDelete={(a) => setDeleteTarget(a)}
          />
        </div>
      ) : (
      <div className="relative flex-1 min-h-0 rounded-[6px] border border-[#e5edf5] bg-white overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
            <Loader2 className="h-5 w-5 text-[#635BFF] animate-spin" strokeWidth={2} />
          </div>
        )}
        <DnDCalendar
          localizer={localizer}
          events={events}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          views={[Views.DAY, Views.WEEK, Views.MONTH]}
          resources={resources}
          resourceIdAccessor="resourceId"
          resourceTitleAccessor="resourceTitle"
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={(event: CalendarEvent, e: React.SyntheticEvent<HTMLElement>) =>
            handleSelectEvent(event, e)
          }
          onEventDrop={handleEventDrop as never}
          onEventResize={handleEventResize as never}
          resizable
          step={15}
          timeslots={4}
          components={{
            event: ({ event }: { event: CalendarEvent }) => (
              <AppointmentEventCard event={event} />
            ),
          }}
          eventPropGetter={(event: CalendarEvent) => {
            const color = doctorColor(event.appointment.doctor.id);
            return {
              style: {
                backgroundColor: `${color}1A`, // 10% opacity bg
                borderLeft: `3px solid ${color}`,
                borderRadius: "4px",
                color: "#061b31",
                fontSize: "12px",
                padding: "2px 6px",
              },
            };
          }}
          dayPropGetter={(d: Date) => {
            const today = new Date();
            const isToday =
              d.getFullYear() === today.getFullYear() &&
              d.getMonth() === today.getMonth() &&
              d.getDate() === today.getDate();
            return isToday ? { style: { backgroundColor: "#F0EEFF" } } : {};
          }}
          toolbar={false}
        />
      </div>
      )}

      {/* Popover */}
      {popoverEvent && popoverAnchor && (
        <AppointmentEventPopover
          appointment={popoverEvent}
          anchor={popoverAnchor}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onClose={() => {
            setPopoverEvent(null);
            setPopoverAnchor(null);
          }}
          onEdit={() => {
            setEditId(popoverEvent.id);
            setPopoverEvent(null);
          }}
          onCancel={() => {
            setCancelTarget(popoverEvent);
            setPopoverEvent(null);
          }}
          onDelete={() => {
            setDeleteTarget(popoverEvent);
            setPopoverEvent(null);
          }}
        />
      )}

      {/* Dialogs */}
      <CreateAppointmentDialog
        open={createOpen}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        prefilledPatient={null}
        prefilledDoctor={
          createPrefill?.doctorId
            ? branch?.doctors.find((d) => d.id === createPrefill.doctorId)
              ? {
                  id: createPrefill.doctorId,
                  name: branch!.doctors.find((d) => d.id === createPrefill.doctorId)!.name,
                }
              : null
            : null
        }
        onClose={() => {
          setCreateOpen(false);
          setCreatePrefill(null);
        }}
        onCreated={() => {
          setCreateOpen(false);
          setCreatePrefill(null);
          fetchAppointments();
        }}
      />
      <EditAppointmentDialog
        appointmentId={editId}
        isAdmin={isAdmin}
        onClose={() => setEditId(null)}
        onUpdated={() => {
          setEditId(null);
          fetchAppointments();
        }}
      />
      <CancelAppointmentDialog
        appointmentId={cancelTarget?.id ?? null}
        patientName={cancelTarget ? `${cancelTarget.patient.firstName} ${cancelTarget.patient.lastName}` : ""}
        appointmentDateTime={cancelTarget?.dateTime ?? null}
        onClose={() => setCancelTarget(null)}
        onCancelled={() => {
          setCancelTarget(null);
          fetchAppointments();
        }}
      />
      <DeleteAppointmentDialog
        appointmentId={deleteTarget?.id ?? null}
        patientName={deleteTarget ? `${deleteTarget.patient.firstName} ${deleteTarget.patient.lastName}` : ""}
        appointmentDateTime={deleteTarget?.dateTime ?? null}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          fetchAppointments();
        }}
      />
      {conflictDialog && (
        <ConflictOverrideDialog
          conflicts={conflictDialog.conflicts}
          onOverride={conflictDialog.onOverride}
          onCancel={conflictDialog.onCancel}
        />
      )}
      <Toaster richColors closeButton position="bottom-right" />

      {/* Hidden navigation buttons (kept for keyboard nav, visible variants are in CalendarFilterBar) */}
      <div className="sr-only">
        <button onClick={() => setView(Views.DAY)}>Day</button>
        <button onClick={() => setView(Views.WEEK)}>Week</button>
        <button onClick={() => setView(Views.MONTH)}>Month</button>
        <button onClick={() => setDate(new Date(date.getTime() - 86400000))}><ChevronLeft /></button>
        <button onClick={() => setDate(new Date(date.getTime() + 86400000))}><ChevronRight /></button>
      </div>
    </div>
  );
}
