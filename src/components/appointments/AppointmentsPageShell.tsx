"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, List, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateAppointmentDialog } from "@/components/patients/CreateAppointmentDialog";
import { AppointmentsCalendarView } from "@/components/calendar/AppointmentsCalendarView";
import { AppointmentsListView } from "./AppointmentsListView";
import type { AppointmentTabId } from "@/lib/appointment-tabs";

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

function parseDateParam(s: string | null): Date {
  if (!s) return new Date();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function AppointmentsPageShell({ currentUserId, branches }: Props) {
  const router = useRouter();
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
  const [branchId, setBranchId] = useState<string>(
    searchParams.get("branch") ?? branches[0]?.id ?? ""
  );
  const [doctorIds, setDoctorIds] = useState<string[]>(
    searchParams.get("doctors")?.split(",").filter(Boolean) ?? []
  );
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
  const [createOpen, setCreateOpen] = useState(false);

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
    params.set("date", selectedDate.toISOString().split("T")[0]);
    if (viewMode === "list") {
      params.set("tab", activeTab);
      if (selectedAppointmentId) params.set("appointment", selectedAppointmentId);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [viewMode, branchId, doctorIds, selectedDate, activeTab, selectedAppointmentId, router]);

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-110px)]">
      {/* Top bar */}
      <div className="flex items-baseline justify-between gap-3 px-6 pt-4">
        <div>
          <h1 className="text-[23px] font-light tracking-[-0.18px] text-[#061b31]">
            Appointments
          </h1>
          <p className="text-[14px] text-[#64748d]">
            Schedule, reschedule, and manage all bookings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div
            role="tablist"
            aria-label="View mode"
            className="inline-flex rounded-[4px] border border-[#e5edf5] overflow-hidden"
          >
            <button
              role="tab"
              type="button"
              aria-selected={viewMode === "list"}
              onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-[#635BFF] text-white"
                  : "bg-white text-[#425466] hover:text-[#0A2540]"
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
              className={`inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium border-l border-[#e5edf5] transition-colors ${
                viewMode === "calendar"
                  ? "bg-[#635BFF] text-white"
                  : "bg-white text-[#425466] hover:text-[#0A2540]"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} />
              Calendar
            </button>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="h-9 rounded-[4px] bg-[#635BFF] hover:bg-[#5851EB] text-white text-[14px] gap-1.5"
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
            branchId={branchId}
            doctorIds={doctorIds}
            selectedDate={selectedDate}
            selectedAppointmentId={selectedAppointmentId}
            activeTab={activeTab}
            onBranchChange={setBranchId}
            onDoctorIdsChange={setDoctorIds}
            onDateChange={setSelectedDate}
            onActiveTabChange={setActiveTab}
            onSelectedAppointmentIdChange={setSelectedAppointmentId}
          />
        ) : (
          <div className="px-6 pb-4 h-full">
            <AppointmentsCalendarView
              currentUserId={currentUserId}
              branches={branches}
              hideHeader
              disableUrlSync
            />
          </div>
        )}
      </div>

      {/* Top-level create dialog (mounted once, reachable from any view) */}
      <CreateAppointmentDialog
        open={createOpen}
        isAdmin={branches.some((b) => b.role === "OWNER" || b.role === "ADMIN")}
        currentUserId={currentUserId}
        prefilledPatient={null}
        prefilledDoctor={null}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          // Force list/calendar re-fetch by bumping the date state to itself.
          setSelectedDate(new Date(selectedDate.getTime()));
        }}
      />
    </div>
  );
}
