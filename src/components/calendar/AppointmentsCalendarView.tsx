"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
import { can } from "@/lib/permissions";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

import { CreateAppointmentDialog } from "@/components/patients/CreateAppointmentDialog";
import { EditAppointmentDialog } from "@/components/patients/EditAppointmentDialog";
import { CancelAppointmentDialog } from "@/components/patients/CancelAppointmentDialog";
import { DeleteAppointmentDialog } from "@/components/patients/DeleteAppointmentDialog";
import { SeriesScopeDialog, type SeriesScope } from "@/components/packages/SeriesScope";
import { useFollowingEdit } from "@/components/packages/useFollowingEdit";
import { followingUpdatedMessage } from "@/lib/series-client";

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
import { replaceUrl } from "@/lib/url-state";
import { clinicDateKey, clinicInstant, clinicInstantFromInputs, clinicParts } from "@/lib/clinic-time";

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
  /** Branch to show (the shell's branch, or the default one while the shell
   * lists "All branches"). Takes precedence over `?branch=`; when it changes
   * the calendar switches to it. */
  initialBranchId?: string;
  /** Told when the user picks another branch in the calendar's own select. */
  onBranchChange?: (branchId: string) => void;
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

/** Fetch window for the view, in clinic days (the server runs in UTC). */
function getWindow(date: Date, view: View): { start: Date; end: Date } {
  const p = clinicParts(date);
  if (view === Views.DAY) {
    return { start: clinicInstant(p.year, p.month, p.day), end: clinicInstant(p.year, p.month, p.day + 1) };
  }
  if (view === Views.MONTH) {
    return { start: clinicInstant(p.year, p.month, 1), end: clinicInstant(p.year, p.month + 1, 1) };
  }
  // Week (default), Monday first
  const monOffset = (p.weekday + 6) % 7;
  const start = clinicInstant(p.year, p.month, p.day - monOffset);
  return { start, end: clinicInstant(p.year, p.month, p.day - monOffset + 7) };
}

/** Noon on a clinic day — a stable anchor that is the same day in every zone near MYT. */
function clinicNoon(isoDate: string): Date {
  return clinicInstantFromInputs(isoDate, "12:00");
}

export function AppointmentsCalendarView({
  currentUserId,
  branches,
  hideHeader = false,
  disableUrlSync = false,
  initialBranchId: branchIdProp,
  onBranchChange,
}: Props) {
  const searchParams = useSearchParams();

  // OWNER / ADMIN / FRONT_DESK book and move appointments for any doctor;
  // only OWNER / ADMIN hard-delete.
  const isAdmin = useMemo(
    () => branches.some((b) => can(b.role, "appointment.manageAll")),
    [branches]
  );
  const canDelete = useMemo(
    () => branches.some((b) => can(b.role, "appointment.delete")),
    [branches]
  );

  // ─── URL state ───
  const isBranch = (id: string | null | undefined): id is string =>
    !!id && branches.some((b) => b.id === id);
  const urlBranchId = searchParams.get("branch");
  const initialBranchId = isBranch(branchIdProp)
    ? branchIdProp
    : isBranch(urlBranchId)
      ? urlBranchId
      : branches[0]?.id ?? "";
  const initialDoctorIds =
    searchParams.get("doctors")?.split(",").filter(Boolean) ?? [];
  const initialView =
    VIEW_FROM_PARAM[searchParams.get("view") ?? "day"] ?? Views.DAY;
  // Parsed as a clinic day; `new Date("YYYY-MM-DD")` is UTC midnight.
  const dateParam = searchParams.get("date");
  const initialDate = clinicNoon(
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : clinicDateKey()
  );

  const [branchId, setBranchId] = useState<string>(initialBranchId);
  // Drop ids that aren't doctors of the branch (a stale or copied link).
  const [doctorIds, setDoctorIds] = useState<string[]>(() => {
    const known = new Set(branches.find((b) => b.id === initialBranchId)?.doctors.map((d) => d.id));
    return initialDoctorIds.filter((id) => known.has(id));
  });
  // Follow the shell's branch when it changes (e.g. the sidebar branch switcher).
  const [syncedBranchProp, setSyncedBranchProp] = useState(branchIdProp);
  if (branchIdProp !== syncedBranchProp) {
    setSyncedBranchProp(branchIdProp);
    if (isBranch(branchIdProp) && branchIdProp !== branchId) {
      setBranchId(branchIdProp);
      setDoctorIds([]);
    }
  }
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

  // react-big-calendar lays out in the device zone, so it renders only in the
  // browser; server HTML in UTC would never match (hydration error #418).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const todayParts = clinicParts(new Date());

  // ─── Sync URL when state changes (skip when shell owns the URL) ───
  useEffect(() => {
    if (disableUrlSync) return;
    const params = new URLSearchParams();
    params.set("branch", branchId);
    if (doctorIds.length > 0) params.set("doctors", doctorIds.join(","));
    params.set("view", PARAM_FROM_VIEW[view] ?? "week");
    params.set("date", clinicDateKey(date));
    replaceUrl(`?${params.toString()}`);
  }, [branchId, doctorIds, view, date, disableUrlSync]);

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

  // ─── Day-view doctor columns ───
  // Branch clinicians (narrowed by the doctor filter), plus anyone else who
  // has an appointment in the loaded window — otherwise bookings for an
  // ADMIN-as-doctor or a former member silently vanished. Unknown ids in a
  // stale ?doctors= are ignored.
  const dayDoctors = useMemo(() => {
    const all = branch?.doctors ?? [];
    const known = new Set(all.map((d) => d.id));
    const selected = doctorIds.filter((id) => known.has(id));
    const base = selected.length === 0 ? all : all.filter((d) => selected.includes(d.id));
    if (selected.length > 0) return base;
    const seen = new Set(base.map((d) => d.id));
    const extra: { id: string; name: string; image: string | null }[] = [];
    for (const a of appointments) {
      if (seen.has(a.doctor.id)) continue;
      seen.add(a.doctor.id);
      extra.push({ id: a.doctor.id, name: a.doctor.name ?? "Unknown doctor", image: a.doctor.image });
    }
    return [...base, ...extra];
  }, [branch, doctorIds, appointments]);

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
  // Series visits: "this appointment" / "this and following"
  const [scopePrompt, setScopePrompt] = useState<((scope: SeriesScope | null) => void) | null>(null);
  const following = useFollowingEdit(isAdmin);
  const runFollowing = following.run;

  // Single mutation handler — react-big-calendar fires the same shape for
  // both drop and resize, and `newDuration` derives correctly from `newEnd - newStart`
  // for either gesture.
  const handleEventMutation = useCallback(
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

      // 3b. Series visit — this one only, or shift every later booked visit too
      if (event.appointment.seriesId) {
        const scope = await new Promise<SeriesScope | null>((resolve) => setScopePrompt(() => resolve));
        if (!scope) {
          await fetchAppointments();
          return;
        }
        if (scope === "following") {
          const outcome = await runFollowing(event.id, {
            dateTime: newStart.toISOString(),
            ...(newDuration !== event.appointment.duration ? { duration: newDuration } : {}),
            ...(doctorChanged ? { doctorId: newDoctorId } : {}),
          });
          if (outcome.ok) toast.success(followingUpdatedMessage(outcome.count));
          else if (!outcome.dismissed) toast.error(outcome.message);
          await fetchAppointments();
          return;
        }
      }

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

      // 5. PATCH (re-sent with forceOutsideHours once the user confirms)
      const patch = (forceOutsideHours = false) =>
        fetch(`/api/appointments/${event.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            dateTime: newStart.toISOString(),
            duration: newDuration,
            ...(doctorChanged ? { doctorId: newDoctorId } : {}),
            ...(forceOutsideHours ? { forceOutsideHours: true } : {}),
          }),
        });
      let res = await patch();
      if (res.status === 409) {
        const body = await res.clone().json().catch(() => ({}));
        if (body.error === "outside_hours_confirm_required") {
          const hours = body.hours ? ` (${body.hours})` : "";
          if (!window.confirm(`This time is outside the branch's opening hours${hours}. Move it anyway?`)) {
            await fetchAppointments(); // snap back
            return;
          }
          res = await patch(true);
        }
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Save failed (${res.status})`);
        await fetchAppointments();
        return;
      }
      toast.success("Appointment updated");
      await fetchAppointments();
    },
    [currentUserId, fetchAppointments, isAdmin, runFollowing]
  );


  // ─── Render ───
  if (branches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-[18px] font-medium text-foreground mb-2">
          You haven&apos;t joined any branches yet
        </h2>
        <p className="text-[14px] text-fg-secondary">
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
            <h1 className="text-[23px] font-medium tracking-[-0.18px] text-foreground">Appointments</h1>
            <p className="text-[14px] text-fg-secondary">Schedule, reschedule, and manage all bookings.</p>
          </div>
          <Button
            onClick={() => {
              setCreatePrefill(null);
              setCreateOpen(true);
            }}
            className="h-9 rounded-md bg-primary hover:bg-primary/90 text-white text-[14px] gap-1.5"
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
          onBranchChange?.(id);
        }}
        onDoctorIdsChange={setDoctorIds}
        onViewChange={setView}
        onDateChange={(d) =>
          // The picker returns device-local midnight; keep the picked day.
          setDate(clinicInstant(d.getFullYear(), d.getMonth() + 1, d.getDate(), 12))
        }
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
        onToday={() => setDate(clinicNoon(clinicDateKey()))}
      />

      {error && (
        <div className="px-3 py-2 rounded-md bg-danger-subtle text-[13px] text-danger">
          {error}
        </div>
      )}

      {view === Views.DAY ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <DoctorDayCalendar
            date={date}
            doctors={dayDoctors}
            appointments={appointments}
            availability={availability}
            loading={loading}
            isAdmin={isAdmin}
            canDelete={canDelete}
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
      <div className="relative flex-1 min-h-0 rounded-panel border border-border bg-white overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
            <Loader2 className="h-5 w-5 text-brand animate-spin" strokeWidth={2} />
          </div>
        )}
        {mounted && (
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
          onEventDrop={handleEventMutation as never}
          onEventResize={handleEventMutation as never}
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
                color: "#0b0b0b",
                fontSize: "12px",
                padding: "2px 6px",
              },
            };
          }}
          dayPropGetter={(d: Date) =>
            d.getFullYear() === todayParts.year &&
            d.getMonth() + 1 === todayParts.month &&
            d.getDate() === todayParts.day
              ? { style: { backgroundColor: "#ede7ff" } }
              : {}
          }
          toolbar={false}
        />
        )}
      </div>
      )}

      {/* Popover */}
      {popoverEvent && popoverAnchor && (
        <AppointmentEventPopover
          appointment={popoverEvent}
          anchor={popoverAnchor}
          isAdmin={isAdmin}
          canDelete={canDelete}
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
          onStatusChanged={() => {
            setPopoverEvent(null);
            setPopoverAnchor(null);
            fetchAppointments();
          }}
        />
      )}

      {/* Dialogs */}
      <CreateAppointmentDialog
        open={createOpen}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        prefilledPatient={null}
        defaultBranchId={branchId || null}
        prefilledDateTime={createPrefill?.dateTime ?? null}
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
        seriesId={cancelTarget?.seriesId ?? null}
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
      <SeriesScopeDialog
        open={!!scopePrompt}
        title="Move recurring appointment"
        verb="Shift"
        onChoose={(scope) => {
          scopePrompt?.(scope);
          setScopePrompt(null);
        }}
        onClose={() => {
          scopePrompt?.(null);
          setScopePrompt(null);
        }}
      />
      {following.dialog}
      {conflictDialog && (
        <ConflictOverrideDialog
          conflicts={conflictDialog.conflicts}
          onOverride={conflictDialog.onOverride}
          onCancel={conflictDialog.onCancel}
        />
      )}

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
