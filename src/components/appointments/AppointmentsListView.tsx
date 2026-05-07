"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

import { CreateAppointmentDialog } from "@/components/patients/CreateAppointmentDialog";
import { EditAppointmentDialog } from "@/components/patients/EditAppointmentDialog";
import { CancelAppointmentDialog } from "@/components/patients/CancelAppointmentDialog";
import { DeleteAppointmentDialog } from "@/components/patients/DeleteAppointmentDialog";

import { AppointmentSidebarFilters } from "./AppointmentSidebarFilters";
import { AppointmentStatCards } from "./AppointmentStatCards";
import { AppointmentTabs } from "./AppointmentTabs";
import { AppointmentCardList } from "./AppointmentCardList";
import { AppointmentDetailPanel } from "./AppointmentDetailPanel";

import {
  appointmentMatchesTab,
  type AppointmentTabId,
  type AppointmentCounts,
} from "@/lib/appointment-tabs";
import type { CalendarAppointment } from "@/types/appointment";

interface BranchOption {
  id: string;
  name: string;
  role: string;
  doctors: { id: string; name: string; image: string | null }[];
}

interface Props {
  currentUserId: string;
  branches: BranchOption[];
  branchId: string;
  doctorIds: string[];
  selectedDate: Date;
  selectedAppointmentId: string | null;
  activeTab: AppointmentTabId;
  onBranchChange: (id: string) => void;
  onDoctorIdsChange: (ids: string[]) => void;
  onDateChange: (date: Date) => void;
  onActiveTabChange: (tab: AppointmentTabId) => void;
  onSelectedAppointmentIdChange: (id: string | null) => void;
}

// Window for the list-view fetch — broad enough to power "All" / "Upcoming"
// without re-fetching when the user toggles the show-cancelled / tab options.
function getWindow(selectedDate: Date): { start: Date; end: Date } {
  const start = new Date(selectedDate);
  start.setMonth(start.getMonth() - 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(selectedDate);
  end.setMonth(end.getMonth() + 2);
  end.setHours(0, 0, 0, 0);
  return { start, end };
}

function getMarkerWindow(selectedDate: Date): { start: Date; end: Date } {
  // Slightly larger window so the calendar dot indicators stay accurate as
  // the user navigates the mini-calendar without re-fetching.
  const start = new Date(selectedDate);
  start.setMonth(start.getMonth() - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 3);
  return { start, end };
}

export function AppointmentsListView({
  currentUserId,
  branches,
  branchId,
  doctorIds,
  selectedDate,
  selectedAppointmentId,
  activeTab,
  onBranchChange,
  onDoctorIdsChange,
  onDateChange,
  onActiveTabChange,
  onSelectedAppointmentIdChange,
}: Props) {
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [counts, setCounts] = useState<AppointmentCounts>({
    all: 0,
    today: 0,
    upcoming: 0,
    completed: 0,
    cancelled: 0,
    noshow: 0,
  });
  const [markerDates, setMarkerDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCancelled, setShowCancelled] = useState(false);
  const [showNoShow, setShowNoShow] = useState(false);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CalendarAppointment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarAppointment | null>(null);

  const isAdmin = useMemo(
    () => branches.some((b) => b.role === "OWNER" || b.role === "ADMIN"),
    [branches]
  );

  const branch = useMemo(
    () => branches.find((b) => b.id === branchId),
    [branchId, branches]
  );

  const fetchAll = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    const { start, end } = getWindow(selectedDate);
    const { start: mStart, end: mEnd } = getMarkerWindow(selectedDate);
    const baseParams: Record<string, string> = { branchId, includeCancelled: "true" };
    if (doctorIds.length > 0) baseParams.doctorIds = doctorIds.join(",");

    const listUrl = new URL("/api/appointments", window.location.origin);
    Object.entries({ ...baseParams, start: start.toISOString(), end: end.toISOString() }).forEach(
      ([k, v]) => listUrl.searchParams.set(k, v)
    );
    const countsUrl = new URL("/api/appointments/counts", window.location.origin);
    Object.entries(baseParams).forEach(([k, v]) => countsUrl.searchParams.set(k, v));
    const markersUrl = new URL("/api/appointments/calendar-markers", window.location.origin);
    Object.entries({ ...baseParams, start: mStart.toISOString(), end: mEnd.toISOString() }).forEach(
      ([k, v]) => markersUrl.searchParams.set(k, v)
    );

    try {
      const [listRes, countsRes, markersRes] = await Promise.all([
        fetch(listUrl.toString()),
        fetch(countsUrl.toString()),
        fetch(markersUrl.toString()),
      ]);

      if (!listRes.ok) {
        const body = await listRes.json().catch(() => ({}));
        if (body.error === "window_too_wide") {
          setError(`Too many events (${body.count}) — narrow your filters.`);
        } else {
          setError(body.error ?? "Failed to load appointments");
        }
        setAppointments([]);
      } else {
        const body = await listRes.json();
        setAppointments(body.appointments);
      }

      if (countsRes.ok) {
        const body = await countsRes.json();
        setCounts(body.counts);
      }
      if (markersRes.ok) {
        const body = await markersRes.json();
        setMarkerDates(body.dates);
      }
    } catch {
      setError("Network error loading appointments");
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [branchId, doctorIds, selectedDate]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ─── Apply tab filter on the client (we already fetched a wide window) ───
  const filteredAppointments = useMemo(() => {
    const now = new Date();
    return appointments.filter((a) =>
      appointmentMatchesTab(a, activeTab, now, selectedDate, {
        showCancelled,
        showNoShow,
      })
    );
  }, [appointments, activeTab, selectedDate, showCancelled, showNoShow]);

  const selectedAppointment = useMemo(
    () =>
      selectedAppointmentId
        ? appointments.find((a) => a.id === selectedAppointmentId) ?? null
        : null,
    [selectedAppointmentId, appointments]
  );

  const filtersDirty =
    doctorIds.length > 0 || showCancelled || showNoShow;

  const totalDoctors = branch?.doctors.length ?? 0;

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
    <div className="flex h-[calc(100vh-110px)]">
      <AppointmentSidebarFilters
        branches={branches}
        branchId={branchId}
        doctorIds={doctorIds}
        selectedDate={selectedDate}
        showCancelled={showCancelled}
        showNoShow={showNoShow}
        markerDates={markerDates}
        onBranchChange={(id) => {
          onBranchChange(id);
          onDoctorIdsChange([]);
        }}
        onDoctorIdsChange={onDoctorIdsChange}
        onDateChange={(d) => {
          onDateChange(d);
          if (activeTab !== "today" && activeTab !== "all") {
            onActiveTabChange("all");
          }
        }}
        onShowCancelledChange={setShowCancelled}
        onShowNoShowChange={setShowNoShow}
        onClearFilters={() => {
          onDoctorIdsChange([]);
          setShowCancelled(false);
          setShowNoShow(false);
        }}
        filtersDirty={filtersDirty}
      />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="px-6 pt-6 pb-3 flex flex-col gap-4 overflow-hidden">
          <AppointmentStatCards
            appointments={appointments}
            selectedDate={selectedDate}
            doctorFilterCount={doctorIds.length}
            totalDoctors={totalDoctors}
          />
          <AppointmentTabs
            active={activeTab}
            counts={counts}
            onChange={onActiveTabChange}
          />
        </div>

        <div className="relative flex-1 min-h-0 overflow-y-auto px-6 pb-6">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 pointer-events-none">
              <Loader2
                className="h-5 w-5 text-[#635BFF] animate-spin"
                strokeWidth={2}
              />
            </div>
          )}
          {error && (
            <div className="px-3 py-2 mb-3 rounded-[4px] bg-[#FDE7EC] text-[13px] text-[#DF1B41]">
              {error}
            </div>
          )}
          <AppointmentCardList
            appointments={filteredAppointments}
            selectedId={selectedAppointmentId}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            activeTab={activeTab}
            emptyAction={
              activeTab === "today" || activeTab === "upcoming" ? (
                <Button
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  className="h-8 rounded-[4px] bg-[#635BFF] hover:bg-[#5851EB] text-white text-[13px] gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  New appointment
                </Button>
              ) : null
            }
            onSelect={onSelectedAppointmentIdChange}
            onEdit={(a) => setEditId(a.id)}
            onCancel={(a) => setCancelTarget(a)}
            onDelete={(a) => setDeleteTarget(a)}
          />
        </div>
      </div>

      {selectedAppointment && (
        <AppointmentDetailPanel
          appointment={selectedAppointment}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onClose={() => onSelectedAppointmentIdChange(null)}
          onEdit={() => setEditId(selectedAppointment.id)}
          onCancel={() => setCancelTarget(selectedAppointment)}
          onDelete={() => setDeleteTarget(selectedAppointment)}
          onChanged={() => fetchAll()}
        />
      )}

      <CreateAppointmentDialog
        open={createOpen}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        prefilledPatient={null}
        prefilledDoctor={null}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          fetchAll();
        }}
      />
      <EditAppointmentDialog
        appointmentId={editId}
        isAdmin={isAdmin}
        onClose={() => setEditId(null)}
        onUpdated={() => {
          setEditId(null);
          fetchAll();
        }}
      />
      <CancelAppointmentDialog
        appointmentId={cancelTarget?.id ?? null}
        patientName={
          cancelTarget
            ? `${cancelTarget.patient.firstName} ${cancelTarget.patient.lastName}`
            : ""
        }
        appointmentDateTime={cancelTarget?.dateTime ?? null}
        onClose={() => setCancelTarget(null)}
        onCancelled={() => {
          setCancelTarget(null);
          fetchAll();
        }}
      />
      <DeleteAppointmentDialog
        appointmentId={deleteTarget?.id ?? null}
        patientName={
          deleteTarget
            ? `${deleteTarget.patient.firstName} ${deleteTarget.patient.lastName}`
            : ""
        }
        appointmentDateTime={deleteTarget?.dateTime ?? null}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          fetchAll();
        }}
      />
      <Toaster richColors closeButton position="bottom-right" />
    </div>
  );
}
