"use client";

import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mockPatients, MockPatient } from "@/lib/mock-data";
import { PatientSearch } from "@/components/patients/PatientSearch";
import { PatientTable } from "@/components/patients/PatientTable";
import { PatientDetailSheet } from "@/components/patients/PatientDetailSheet";
import { AddPatientDialog } from "@/components/patients/AddPatientDialog";

function fuzzyMatch(text: string, query: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  // Simple fuzzy: check if all characters in query appear in order
  let qi = 0;
  for (let i = 0; i < lowerText.length && qi < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[qi]) qi++;
  }
  return qi === lowerQuery.length;
}

export default function PatientsPage() {
  const [search, setSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<MockPatient | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [patients, setPatients] = useState<MockPatient[]>(mockPatients);

  const filteredPatients = useMemo(() => {
    if (!search.trim()) return patients;
    return patients.filter((p) => {
      const fullName = `${p.firstName} ${p.lastName}`;
      const searchable = `${fullName} ${p.email || ""} ${p.phone || ""}`;
      return fuzzyMatch(searchable, search.trim());
    });
  }, [patients, search]);

  function handleSelectPatient(patient: MockPatient) {
    setSelectedPatient(patient);
    setSheetOpen(true);
  }

  function handleAddPatient(data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    gender: string;
    doctorName: string;
  }) {
    const newPatient: MockPatient = {
      id: `pat_${Date.now()}`,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || null,
      phone: data.phone || null,
      dateOfBirth: data.dateOfBirth || null,
      gender: data.gender || null,
      address: null,
      emergencyContact: null,
      medicalHistory: null,
      notes: null,
      doctorId: "user_1",
      doctorName: data.doctorName,
      branchId: "branch_1",
      lastVisit: null,
      totalVisits: 0,
      totalXrays: 0,
      status: "active",
      createdAt: new Date().toISOString().split("T")[0],
    };
    setPatients((prev) => [newPatient, ...prev]);
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[23px] font-semibold tracking-[-0.01em] text-[#0A2540]">
            Patients
          </h1>
          <p className="text-[15px] text-[#697386] mt-0.5">
            {patients.length} total patients — {filteredPatients.length} shown
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

      {/* Patient table */}
      <PatientTable
        patients={filteredPatients}
        onSelectPatient={handleSelectPatient}
        selectedPatientId={selectedPatient?.id ?? null}
      />

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
