"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Plus, Loader2, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Patient, CreatePatientData } from "@/types/patient";
import { PatientSearch } from "@/components/patients/PatientSearch";
import { PatientTable } from "@/components/patients/PatientTable";
import { PatientCard } from "@/components/patients/PatientCard";
import { PatientDetailSheet } from "@/components/patients/PatientDetailSheet";
import { PatientSummaryStats } from "@/components/patients/PatientSummaryStats";
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
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [deletePatient, setDeletePatient] = useState<Patient | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [branchDoctors, setBranchDoctors] = useState<{ id: string; name: string }[]>([]);

  const isAdmin = branchRole === "OWNER" || branchRole === "ADMIN";

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

  const stats = useMemo(() => ({
    total: patients.length,
    active: patients.filter((p) => p.status === "active").length,
    inactive: patients.filter((p) => p.status === "inactive").length,
    discharged: patients.filter((p) => p.status === "discharged").length,
  }), [patients]);

  // Unique doctors for filter
  const doctorOptions = useMemo(() => {
    const map = new Map<string, string>();
    patients.forEach((p) => map.set(p.doctorId, p.doctorName));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [patients]);

  function handleSelectPatient(patient: Patient) {
    setSelectedPatient(patient);
    setSheetOpen(true);
  }

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
    setSheetOpen(false);
    setSelectedPatient(null);
    setToast("Patient deleted");
  }

  async function handleStatusChange(patientId: string, status: string) {
    const res = await fetch(`/api/patients/${patientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setPatients((prev) => prev.map((p) => p.id === patientId ? { ...p, status } : p));
      if (selectedPatient?.id === patientId) {
        setSelectedPatient((prev) => prev ? { ...prev, status } : prev);
      }
    }
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

      {/* Summary Stats */}
      {!loading && !error && (
        <PatientSummaryStats {...stats} />
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1">
          <PatientSearch value={search} onChange={setSearch} />
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

        <div className="flex items-center rounded-[4px] border border-[#e5edf5] bg-[#f6f9fc] overflow-hidden">
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center justify-center h-8 w-8 transition-colors ${viewMode === "list" ? "bg-white text-[#533afd]" : "text-[#64748d] hover:text-[#061b31]"}`}
          >
            <List className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`flex items-center justify-center h-8 w-8 transition-colors ${viewMode === "grid" ? "bg-white text-[#533afd]" : "text-[#64748d] hover:text-[#061b31]"}`}
          >
            <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Results count */}
      {!loading && !error && (
        <p className="text-[13px] text-[#64748d] mb-3">
          {filtered.length} patient{filtered.length !== 1 ? "s" : ""}{search.trim() || statusFilter !== "all" || doctorFilter !== "all" ? " matching filters" : ""}
        </p>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[#533afd] mr-2" strokeWidth={2} />
          <span className="text-[15px] text-[#64748d]">Loading patients...</span>
        </div>
      )}

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
      {!loading && !error && viewMode === "list" && (
        <PatientTable
          patients={filtered}
          onSelectPatient={handleSelectPatient}
          selectedPatientId={selectedPatient?.id ?? null}
          onEdit={(p) => setEditPatient(p)}
          onDelete={(p) => setDeletePatient(p)}
        />
      )}

      {!loading && !error && viewMode === "grid" && (
        filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((patient) => (
              <PatientCard key={patient.id} patient={patient} onSelect={handleSelectPatient} />
            ))}
          </div>
        ) : (
          <div className="rounded-[6px] border border-[#e5edf5] bg-white p-12 text-center"
            style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)" }}>
            <p className="text-[15px] text-[#64748d]">No patients found</p>
          </div>
        )
      )}

      {/* Detail sheet */}
      <PatientDetailSheet
        patient={selectedPatient}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onEdit={(p) => { setSheetOpen(false); setEditPatient(p); }}
        onDelete={(p) => { setSheetOpen(false); setDeletePatient(p); }}
        onStatusChange={handleStatusChange}
      />

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
