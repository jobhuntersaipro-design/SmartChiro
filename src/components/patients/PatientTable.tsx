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
      <div className="rounded-[6px] border border-[#e5edf5] bg-white p-12 text-center"
        style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
      >
        <p className="text-[15px] text-[#64748d]">No patients found</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-[6px] border border-[#e5edf5] bg-white overflow-hidden"
      style={{ boxShadow: "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px" }}
    >
      {/* Table header */}
      <div className="grid grid-cols-[1fr_160px_120px_100px_100px] gap-4 px-4 py-2.5 border-b border-[#e5edf5] bg-[#f6f9fc]">
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
          Patient
        </span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
          Contact
        </span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
          Last Visit
        </span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
          Visits
        </span>
        <span className="text-[13px] font-medium uppercase tracking-[0.04em] text-[#64748d]">
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
            className={`grid grid-cols-[1fr_160px_120px_100px_100px] gap-4 items-center px-4 py-3 border-b border-[#e5edf5] last:border-b-0 transition-colors cursor-pointer ${
              isSelected ? "bg-[#ededfc]" : "hover:bg-[#f6f9fc]"
            }`}
          >
            {/* Patient */}
            <div className="flex items-center gap-2.5">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[12px] font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <span className="text-[15px] font-medium text-[#061b31] block truncate">
                  {fullName}
                </span>
                {patient.email && (
                  <span className="text-[13px] text-[#64748d] block truncate">
                    {patient.email}
                  </span>
                )}
              </div>
            </div>

            {/* Contact */}
            <span className="text-[15px] text-[#273951] truncate">
              {patient.phone || "—"}
            </span>

            {/* Last Visit */}
            <span className="text-[15px] text-[#273951]">
              {patient.lastVisit
                ? new Date(patient.lastVisit).toLocaleDateString("en-MY", { day: "numeric", month: "short" })
                : "—"}
            </span>

            {/* Visits */}
            <span className="text-[15px] text-[#273951]">
              {patient.totalVisits}
            </span>

            {/* X-Rays */}
            <span className="text-[15px] text-[#273951]">
              {patient.totalXrays}
            </span>
          </div>
        );
      })}
    </div>
  );
}
