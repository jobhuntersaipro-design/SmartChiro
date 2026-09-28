"use client";

import { useState } from "react";
import type { BranchRole } from "@prisma/client";
import { can } from "@/lib/permissions";
import { CarePlanSection } from "./CarePlanSection";
import { PatientPackagesSection } from "./PatientPackagesSection";

interface Props {
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    branchId: string;
    doctorId: string;
    doctorName: string | null;
  };
  branchRole: BranchRole | null;
  currentUserId: string;
}

/** Who sees the patient page's packages tab: whole-branch roles and the assigned doctor. */
export function canViewPatientPackages(role: BranchRole | null, patientDoctorId: string, currentUserId: string): boolean {
  return can(role, "patient.readAll") || patientDoctorId === currentUserId;
}

/**
 * Patient page "Packages" tab. Care plans are clinical, so only the patient's
 * doctor and owners / admins see them — never front desk.
 */
export function PatientCareTab({ patient, branchRole, currentUserId }: Props) {
  const [packagesKey, setPackagesKey] = useState(0);
  const isAssignedDoctor = patient.doctorId === currentUserId;
  const showCarePlans =
    can(branchRole, "clinical.read") && (can(branchRole, "package.manage") || isAssignedDoctor);
  const canSell = can(branchRole, "invoice.manage");
  const patientName = `${patient.firstName} ${patient.lastName}`;
  const pickDoctor = can(branchRole, "appointment.manageAll");

  return (
    <div className="space-y-6">
      {showCarePlans && (
        <CarePlanSection
          patientId={patient.id}
          patientName={patientName}
          branchId={patient.branchId}
          defaultDoctor={
            pickDoctor
              ? { id: patient.doctorId, name: patient.doctorName ?? "Assigned doctor" }
              : { id: currentUserId, name: patient.doctorName ?? "Me" }
          }
          canPickDoctor={pickDoctor}
          canSell={canSell}
          onChanged={() => setPackagesKey((k) => k + 1)}
        />
      )}
      <PatientPackagesSection
        patientId={patient.id}
        patientName={patientName}
        branchId={patient.branchId}
        canSell={canSell}
        canCancel={can(branchRole, "package.manage")}
        canOpenInvoices={can(branchRole, "invoice.manage")}
        refreshKey={packagesKey}
      />
    </div>
  );
}
