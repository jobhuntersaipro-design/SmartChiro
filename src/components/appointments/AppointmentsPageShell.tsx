"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, List, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { CreateAppointmentDialog } from "@/components/patients/CreateAppointmentDialog";
import { AppointmentsCalendarView } from "@/components/calendar/AppointmentsCalendarView";
import { AppointmentsListView } from "./AppointmentsListView";
import type { AppointmentTabId } from "@/lib/appointment-tabs";
import { replaceUrl } from "@/lib/url-state";
import { clinicDateKey, clinicInstant, clinicInstantFromInputs } from "@/lib/clinic-time";

type ViewMode = "list" | "calendar";

interface BranchOption {
  id: string;
  name: string;
  role: string;
  doctors: { id: string; name: string; image: string | null }[];
}

interface Props {
  currentUserId: string;
  branches: BranchOption[];
  /** The sidebar branch, or "all" in "All branches" (the list can span them). */
  initialBranchId: string;
  /** Branch the calendar shows while the list spans all branches. */
  calendarBranchId: string;
  /** Offer "All branches" in the list's branch select. */
  allowAllBranches: boolean;
}

const STORAGE_KEY = "appointments_view_mode";

function isAppointmentTab(s: string | null): s is AppointmentTabId {
  return (
    s === "all" ||
    s === "today" ||
    s === "upcoming" ||
    s === "completed" ||
    s === "cancelled" ||
    s === "noshow"
  );
}

/** `?date=YYYY-MM-DD` as noon on that clinic day (not UTC midnight). */
function parseDateParam(s: string | null): Date {
  const key = s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : clinicDateKey();
  return clinicInstantFromInputs(key, "12:00");
}

export function AppointmentsPageShell({
  currentUserId,
  branches,
  initialBranchId,
  calendarBranchId,
  allowAllBranches,
}: Props) {
  const searchParams = useSearchParams();

  // ─── View mode ───
  // SSR-safe: initialize from URL only (deterministic on server). After hydration,
  // a useEffect below reads localStorage and upgrades the mode if no URL value was set.
  // Default is "calendar" to match the per-doctor day-view design (Zendenta-style).
  const initialUrlViewMode = (() => {
    const v = searchParams.get("view");
    return v === "list" || v === "calendar" ? v : null;
  })();
  const [viewMode, setViewMode] = useState<ViewMode>(initialUrlViewMode ?? "calendar");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (!initialUrlViewMode && typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "list" || stored === "calendar") setViewMode(stored);
    }
    // intentionally only on mount — initialUrlViewMode is captured at render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Shared filter state ───
  // A shared `?branch=` link wins on arrival; otherwise the sidebar branch.
  const urlBranch = searchParams.get("branch");
  const [branchId, setBranchId] = useState<string>(() =>
    urlBranch && (urlBranch === "all" ? allowAllBranches : branches.some((b) => b.id === urlBranch))
      ? urlBranch
      : initialBranchId
  );
  const [doctorIds, setDoctorIds] = useState<string[]>(
    searchParams.get("doctors")?.split(",").filter(Boolean) ?? []
  );
  // Switching branch in the sidebar re-renders the page with a new default.
  const [syncedInitialBranch, setSyncedInitialBranch] = useState(initialBranchId);
  if (initialBranchId !== syncedInitialBranch) {
    setSyncedInitialBranch(initialBranchId);
    setBranchId(initialBranchId);
    setDoctorIds([]);
  }
  const [selectedDate, setSelectedDate] = useState<Date>(
    parseDateParam(searchParams.get("date"))
  );

  // ─── List-view-only state ───
  const [activeTab, setActiveTab] = useState<AppointmentTabId>(
    isAppointmentTab(searchParams.get("tab")) ? (searchParams.get("tab") as AppointmentTabId) : "today"
  );
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(
    searchParams.get("appointment")
  );

  // ─── Create dialog (top-level) ───
  // `?create=1` (sidebar / Quick Actions "New Appointment") opens the dialog on arrival.
  const [createOpen, setCreateOpen] = useState(() => searchParams.get("create") === "1");
  // Bump on create/edit/cancel/delete so the list re-fetches without us having
  // to mutate `selectedDate` (which would also trigger an unrelated URL push).
  const [refreshKey, setRefreshKey] = useState(0);

  // Persist view mode choice (skip the very first render before localStorage is read)
  useEffect(() => {
    if (hydrated && typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, viewMode);
    }
  }, [viewMode, hydrated]);

  // Sync URL params (single source of truth — same pattern as AppointmentsCalendarView)
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", viewMode);
    if (branchId) params.set("branch", branchId);
    if (doctorIds.length > 0) params.set("doctors", doctorIds.join(","));
    params.set("date", clinicDateKey(selectedDate));
    if (viewMode === "list") {
      params.set("tab", activeTab);
      if (selectedAppointmentId) params.set("appointment", selectedAppointmentId);
    }
    replaceUrl(`?${params.toString()}`);
  }, [viewMode, branchId, doctorIds, selectedDate, activeTab, selectedAppointmentId]);

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-110px)]">
      {/* Top bar */}
      <div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-baseline sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h1 className="text-[23px] font-light tracking-[-0.18px] text-foreground">
            Appointments
          </h1>
          <p className="text-[14px] text-fg-secondary">
            Schedule, reschedule, and manage all bookings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div
            role="tablist"
            aria-label="View mode"
            className="inline-flex rounded-md border border-border overflow-hidden"
          >
            <button
              role="tab"
              type="button"
              aria-selected={viewMode === "list"}
              onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-primary text-white"
                  : "bg-white text-fg-secondary hover:text-foreground"
              }`}
            >
              <List className="h-3.5 w-3.5" strokeWidth={1.75} />
              List
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={viewMode === "calendar"}
              onClick={() => setViewMode("calendar")}
              className={`inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium border-l border-border transition-colors ${
                viewMode === "calendar"
                  ? "bg-primary text-white"
                  : "bg-white text-fg-secondary hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} />
              Calendar
            </button>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="h-9 rounded-md bg-primary hover:bg-primary/90 text-white text-[14px] gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            New Appointment
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        {viewMode === "list" ? (
          <AppointmentsListView
            currentUserId={currentUserId}
            branches={branches}
            allowAllBranches={allowAllBranches}
            branchId={branchId}
            doctorIds={doctorIds}
            selectedDate={selectedDate}
            selectedAppointmentId={selectedAppointmentId}
            activeTab={activeTab}
            refreshKey={refreshKey}
            onBranchChange={setBranchId}
            onDoctorIdsChange={setDoctorIds}
            onDateChange={(d) =>
              // Mini-calendar returns device-local midnight; keep the picked day.
              setSelectedDate(clinicInstant(d.getFullYear(), d.getMonth() + 1, d.getDate(), 12))
            }
            onActiveTabChange={setActiveTab}
            onSelectedAppointmentIdChange={setSelectedAppointmentId}
            onOpenCreate={() => setCreateOpen(true)}
            onChanged={() => setRefreshKey((k) => k + 1)}
          />
        ) : (
          <div className="px-6 pb-4 h-full">
            <AppointmentsCalendarView
              currentUserId={currentUserId}
              branches={branches}
              hideHeader
              disableUrlSync
              // The calendar needs one branch for its doctor columns.
              initialBranchId={branchId === "all" ? calendarBranchId : branchId}
              onBranchChange={setBranchId}
            />
          </div>
        )}
      </div>

      {/* Top-level create dialog (mounted once, reachable from any view) */}
      <CreateAppointmentDialog
        open={createOpen}
        isAdmin={branches.some((b) => can(b.role, "appointment.manageAll"))}
        currentUserId={currentUserId}
        prefilledPatient={null}
        prefilledDoctor={null}
        defaultBranchId={branchId || null}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
