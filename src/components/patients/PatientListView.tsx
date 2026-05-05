"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Plus, LayoutGrid, List, X, Search as SearchIcon, Users, FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Patient, CreatePatientData } from "@/types/patient";
import { PatientTable, SortKey, SortDir } from "@/components/patients/PatientTable";
import { PatientCard } from "@/components/patients/PatientCard";
import { PatientTableSkeleton } from "@/components/patients/PatientTableSkeleton";
import { BranchStatsCards } from "@/components/patients/BranchStatsCards";
import { UpcomingAppointmentsSection } from "@/components/patients/UpcomingAppointmentsSection";
import { AddPatientDialog } from "@/components/patients/AddPatientDialog";
import { EditPatientDialog } from "@/components/patients/EditPatientDialog";
import { DeletePatientDialog } from "@/components/patients/DeletePatientDialog";

interface PatientListViewProps {
  userId: string;
  userName: string | null;
  branchRole: string;
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function EmptyPatientState({
  hasFilters,
  onClearFilters,
  onAddPatient,
}: {
  hasFilters: boolean;
  onClearFilters: () => void;
  onAddPatient: () => void;
}) {
  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white p-12 text-center"
      style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)" }}
    >
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#ededfc]">
        {hasFilters ? (
          <FilterX className="h-5 w-5 text-[#533afd]" strokeWidth={1.5} />
        ) : (
          <Users className="h-5 w-5 text-[#533afd]" strokeWidth={1.5} />
        )}
      </div>
      <h3 className="text-[16px] font-medium text-[#061b31] mb-1">
        {hasFilters ? "No patients match these filters" : "No patients yet"}
      </h3>
      <p className="text-[14px] text-[#64748d] mb-4 max-w-sm mx-auto">
        {hasFilters
          ? "Try adjusting your search or filters to find who you're looking for."
          : "Add your first patient to start tracking visits, X-rays, and appointments."}
      </p>
      {hasFilters ? (
        <Button variant="outline" onClick={onClearFilters} className="h-8 px-3 text-[13px] rounded-[4px] gap-1.5">
          <X className="h-3.5 w-3.5" strokeWidth={2} />
          Clear filters
        </Button>
      ) : (
        <Button onClick={onAddPatient} className="h-8 px-3 text-[13px] rounded-[4px] gap-1.5">
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          Add Patient
        </Button>
      )}
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-3 fade-in duration-300">
      <div className="rounded-[6px] border border-[#e5edf5] bg-white px-4 py-2.5 text-[14px] text-[#061b31]"
        style={{ boxShadow: "0 4px 6px rgba(0,0,0,0.04), 0 8px 24px rgba(18,42,66,0.06)" }}>
        {message}
      </div>
    </div>
  );
}

export function PatientListView({ userId, userName, branchRole }: PatientListViewProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [sortKey, setSortKey] = useState<SortKey>("upcomingAppointment");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [addOpen, setAddOpen] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [deletePatient, setDeletePatient] = useState<Patient | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [branchDoctors, setBranchDoctors] = useState<{ id: string; name: string }[]>([]);

  const isAdmin = branchRole === "OWNER" || branchRole === "ADMIN";

  function handleSortChange(key: SortKey) {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      // New key: default direction depends on column
      setSortDir(key === "totalVisits" ? "desc" : "asc");
      return key;
    });
  }

  // Keyboard shortcut: `/` focuses search (skip if typing in an input)
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hasActiveFilters = search.trim() !== "" || statusFilter !== "all" || (isAdmin && doctorFilter !== "all");

  function clearAllFilters() {
    setSearch("");
    setStatusFilter("all");
    setDoctorFilter("all");
  }

  const fetchPatients = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/patients");
      if (!res.ok) throw new Error("Failed to fetch patients");
      const data = await res.json();
      setPatients(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load patients");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDoctors = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/doctors");
      if (!res.ok) return;
      const data = await res.json();
      setBranchDoctors(data.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name || "Unknown" })));
    } catch {
      // Non-critical
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchPatients();
    fetchDoctors();
  }, [fetchPatients, fetchDoctors]);

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = patients;

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((p) => p.status === statusFilter);
    }

    // Doctor filter (admin only)
    if (isAdmin && doctorFilter !== "all") {
      result = result.filter((p) => p.doctorId === doctorFilter);
    }

    // Search
    if (search.trim()) {
      result = result.filter((p) => {
        const searchable = `${p.firstName} ${p.lastName} ${p.email || ""} ${p.phone || ""} ${p.icNumber || ""}`;
        return fuzzyMatch(searchable, search.trim());
      });
    }

    return result;
  }, [patients, statusFilter, doctorFilter, search, isAdmin]);

  // Unique doctors for filter
  const doctorOptions = useMemo(() => {
    const map = new Map<string, string>();
    patients.forEach((p) => map.set(p.doctorId, p.doctorName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [patients]);

  async function handleAddPatient(data: CreatePatientData) {
    const res = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create patient");
    }
    await fetchPatients();
    setToast("Patient created");
  }

  async function handleEditPatient(patientId: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/patients/${patientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to update patient");
    }
    await fetchPatients();
    setToast("Patient updated");
  }

  async function handleDeletePatient(patientId: string) {
    const res = await fetch(`/api/patients/${patientId}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to delete patient");
    }
    setPatients((prev) => prev.filter((p) => p.id !== patientId));
    setToast("Patient deleted");
  }

  const selectClass = "h-8 rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] px-3 text-[14px] text-[#061b31] focus:outline-none focus:ring-1 focus:ring-[#533afd] appearance-none";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-light tracking-[-0.22px] text-[#061b31]">Patients</h1>
          <p className="text-[14px] text-[#64748d] mt-0.5">Manage your clinic&apos;s patient records</p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="gap-1.5 h-8 px-3 text-[15px] font-medium rounded-[4px]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          Add Patient
        </Button>
      </div>

      {/* Per-branch stat cards (or personal cards for DOCTOR) */}
      <BranchStatsCards />

      {/* Upcoming appointments section */}
      <UpcomingAppointmentsSection
        currentUserId={userId}
        isAdmin={branchRole === "OWNER" || branchRole === "ADMIN"}
      />

      {/* Filter bar — sticky to top of viewport while scrolling */}
      <div className="sticky top-[52px] z-20 -mx-2 px-2 py-2 bg-[#f6f9fc]/95 backdrop-blur-sm mb-3 border-b border-transparent supports-[backdrop-filter]:bg-[#f6f9fc]/80">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#64748d] pointer-events-none" strokeWidth={1.75} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patients by name, IC, phone, email…"
              className="w-full h-8 rounded-[4px] border border-[#e5edf5] bg-white pl-8 pr-12 text-[14px] text-[#061b31] placeholder:text-[#94a3b8] focus:outline-none focus:ring-1 focus:ring-[#533afd] focus:border-[#533afd] transition-colors"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center justify-center h-5 min-w-[18px] px-1 rounded border border-[#e5edf5] bg-[#f6f9fc] text-[10px] font-medium text-[#94a3b8] pointer-events-none">/</kbd>
          </div>

          {isAdmin && (
            <select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className={selectClass}>
              <option value="all">All Doctors</option>
              {doctorOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="discharged">Discharged</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-[4px] text-[13px] text-[#64748d] hover:text-[#061b31] hover:bg-white transition-colors"
              title="Clear all filters"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              Clear
            </button>
          )}

          <div className="flex items-center rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center justify-center h-8 w-8 transition-colors ${viewMode === "list" ? "bg-white text-[#533afd]" : "text-[#64748d] hover:text-[#061b31]"}`}
              title="List view"
            >
              <List className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center justify-center h-8 w-8 transition-colors ${viewMode === "grid" ? "bg-white text-[#533afd]" : "text-[#64748d] hover:text-[#061b31]"}`}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Results count */}
      {!loading && !error && (
        <p className="text-[13px] text-[#64748d] mb-3">
          {filtered.length} patient{filtered.length !== 1 ? "s" : ""}{hasActiveFilters ? " matching filters" : ""}
          {sortKey === "upcomingAppointment" && (
            <span className="text-[#94a3b8]"> · sorted by next appointment {sortDir === "asc" ? "↑" : "↓"}</span>
          )}
        </p>
      )}

      {/* Loading state */}
      {loading && <PatientTableSkeleton rows={6} />}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-[6px] border border-[#e5edf5] bg-white p-8 text-center"
          style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)" }}
        >
          <p className="text-[15px] text-[#DF1B41] mb-2">{error}</p>
          <Button variant="outline" onClick={fetchPatients} className="h-7 px-3 text-[13px] rounded-[4px]">
            Retry
          </Button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && filtered.length === 0 && (
        <EmptyPatientState
          hasFilters={hasActiveFilters}
          onClearFilters={clearAllFilters}
          onAddPatient={() => setAddOpen(true)}
        />
      )}

      {!loading && !error && filtered.length > 0 && viewMode === "list" && (
        <PatientTable
          patients={filtered}
          onEdit={(p) => setEditPatient(p)}
          onDelete={(p) => setDeletePatient(p)}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={handleSortChange}
        />
      )}

      {!loading && !error && filtered.length > 0 && viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((patient) => (
            <PatientCard key={patient.id} patient={patient} />
          ))}
        </div>
      )}

      {/* Add patient dialog */}
      <AddPatientDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={handleAddPatient}
        branchDoctors={branchDoctors}
        isAdmin={isAdmin}
      />

      {/* Edit patient dialog */}
      <EditPatientDialog
        patient={editPatient}
        open={!!editPatient}
        onOpenChange={(open) => { if (!open) setEditPatient(null); }}
        onSave={handleEditPatient}
        branchDoctors={branchDoctors}
        isAdmin={isAdmin}
      />

      {/* Delete patient dialog */}
      <DeletePatientDialog
        patient={deletePatient}
        open={!!deletePatient}
        onOpenChange={(open) => { if (!open) setDeletePatient(null); }}
        onDelete={handleDeletePatient}
      />

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
