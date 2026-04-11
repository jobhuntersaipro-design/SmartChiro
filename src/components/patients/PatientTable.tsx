"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Patient } from "@/types/patient";

interface PatientTableProps {
  patients: Patient[];
  onSelectPatient: (patient: Patient) => void;
  selectedPatientId: string | null;
}

export function PatientTable({ patients, onSelectPatient, selectedPatientId }: PatientTableProps) {
  if (patients.length === 0) {
    return (
      <div className="rounded-[6px] border border-[#E3E8EE] bg-white p-12 text-center"
        style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)" }}
      >
        <p className="text-[15px] text-[#697386]">No patients found</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-[6px] border border-[#E3E8EE] bg-white overflow-hidden"
      style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)" }}
    >
      {/* Table header */}
      <div className="grid grid-cols-[1fr_160px_120px_100px_100px] gap-4 px-4 py-2.5 border-b border-[#E3E8EE] bg-[#F6F9FC]">
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#697386]">
          Patient
        </span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#697386]">
          Contact
        </span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#697386]">
          Last Visit
        </span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#697386]">
          Visits
        </span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#697386]">
          X-Rays
        </span>
      </div>

      {/* Table rows */}
      {patients.map((patient) => {
        const initials = `${patient.firstName[0]}${patient.lastName[0]}`;
        const fullName = `${patient.firstName} ${patient.lastName}`;
        const isSelected = selectedPatientId === patient.id;

        return (
          <div
            key={patient.id}
            onClick={() => onSelectPatient(patient)}
            className={`grid grid-cols-[1fr_160px_120px_100px_100px] gap-4 items-center px-4 py-3 border-b border-[#E3E8EE] last:border-b-0 transition-colors cursor-pointer ${
              isSelected ? "bg-[#F0EEFF]" : "hover:bg-[#F0F3F7]"
            }`}
          >
            {/* Patient */}
            <div className="flex items-center gap-2.5">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-[#F0EEFF] text-[#635BFF] text-[12px] font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <span className="text-[15px] font-medium text-[#0A2540] block truncate">
                  {fullName}
                </span>
                {patient.email && (
                  <span className="text-[13px] text-[#697386] block truncate">
                    {patient.email}
                  </span>
                )}
              </div>
            </div>

            {/* Contact */}
            <span className="text-[15px] text-[#425466] truncate">
              {patient.phone || "—"}
            </span>

            {/* Last Visit */}
            <span className="text-[15px] text-[#425466]">
              {patient.lastVisit
                ? new Date(patient.lastVisit).toLocaleDateString("en-MY", { day: "numeric", month: "short" })
                : "—"}
            </span>

            {/* Visits */}
            <span className="text-[15px] text-[#425466]">
              {patient.totalVisits}
            </span>

            {/* X-Rays */}
            <span className="text-[15px] text-[#425466]">
              {patient.totalXrays}
            </span>
          </div>
        );
      })}
    </div>
  );
}
