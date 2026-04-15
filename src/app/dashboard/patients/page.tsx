"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Patient } from "@/types/patient";
import { PatientSearch } from "@/components/patients/PatientSearch";
import { PatientTable } from "@/components/patients/PatientTable";
import { PatientDetailSheet } from "@/components/patients/PatientDetailSheet";
import { AddPatientDialog } from "@/components/patients/AddPatientDialog";

function fuzzyMatch(text: string, query: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lowerText.length && qi < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[qi]) qi++;
  }
  return qi === lowerQuery.length;
}

export default function PatientsPage() {
  const [search, setSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const filteredPatients = useMemo(() => {
    if (!search.trim()) return patients;
    return patients.filter((p) => {
      const fullName = `${p.firstName} ${p.lastName}`;
      const searchable = `${fullName} ${p.email || ""} ${p.phone || ""}`;
      return fuzzyMatch(searchable, search.trim());
    });
  }, [patients, search]);

  function handleSelectPatient(patient: Patient) {
    setSelectedPatient(patient);
    setSheetOpen(true);
  }

  async function handleAddPatient(data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    gender: string;
  }) {
    const res = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create patient");
    }

    const newPatient: Patient = await res.json();
    setPatients((prev) => [newPatient, ...prev]);
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[23px] font-light tracking-[-0.01em] text-[#061b31]">
            Patients
          </h1>
          <p className="text-[15px] text-[#64748d] mt-0.5">
            {patients.length} total patients{search.trim() ? ` — ${filteredPatients.length} shown` : ""}
          </p>
        </div>
        <Button
          onClick={() => setAddDialogOpen(true)}
          className="gap-1.5 h-8 px-3 text-[15px] font-medium rounded-[4px]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          Add Patient
        </Button>
      </div>

      {/* Search bar */}
      <div className="mb-4">
        <PatientSearch value={search} onChange={setSearch} />
      </div>

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

      {/* Patient table */}
      {!loading && !error && (
        <PatientTable
          patients={filteredPatients}
          onSelectPatient={handleSelectPatient}
          selectedPatientId={selectedPatient?.id ?? null}
        />
      )}

      {/* Detail sheet */}
      <PatientDetailSheet
        patient={selectedPatient}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      {/* Add patient dialog */}
      <AddPatientDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={handleAddPatient}
      />
    </div>
  );
}
