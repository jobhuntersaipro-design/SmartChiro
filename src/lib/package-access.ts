import { NextResponse } from "next/server";
import type { BranchRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserBranchRole } from "@/lib/auth-utils";
import { can } from "@/lib/permissions";

/**
 * Role checks for packages, care plans and appointment series (Phase 3),
 * expressed through the shared permission map: front desk may view and sell
 * packages, redeem sessions and book series, but never sees care plans.
 */

/** OWNER / ADMIN — manage catalogue, sell, cancel. */
export function isManagerRole(role: BranchRole | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export interface PatientAccess {
  patient: { id: string; branchId: string; doctorId: string; firstName: string; lastName: string };
  role: BranchRole;
  isManager: boolean;
  /** The caller is the patient's assigned doctor. */
  isAssignedDoctor: boolean;
}

/**
 * The caller's access to a patient. `null` when the patient doesn't exist or
 * the caller isn't a member of its branch (routes answer 404 for both, so a
 * cross-branch id reveals nothing).
 */
export async function loadPatientAccess(userId: string, patientId: string): Promise<PatientAccess | null> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, branchId: true, doctorId: true, firstName: true, lastName: true },
  });
  if (!patient) return null;
  const role = await getUserBranchRole(userId, patient.branchId);
  if (!role) return null;
  return {
    patient,
    role,
    isManager: isManagerRole(role),
    isAssignedDoctor: patient.doctorId === userId,
  };
}

/** Packages: view — managers and the patient's own doctor. */
export function canViewPackages(access: PatientAccess): boolean {
  return can(access.role, "patient.readAll") || access.isAssignedDoctor;
}

/** Packages: sell — whoever takes payment (OWNER / ADMIN / FRONT_DESK). Cancelling stays with managers. */
export function canSellPackages(role: BranchRole | null): boolean {
  return can(role, "invoice.manage");
}

/** Care plans are clinical: managers and the patient's own doctor. */
export function canAccessCarePlans(access: PatientAccess): boolean {
  if (!can(access.role, "clinical.read")) return false;
  return access.isManager || access.isAssignedDoctor;
}

/**
 * Redeem / reverse a package session on an appointment: managers, or the
 * appointment's own doctor (the same people who can complete it). Returns
 * "ok" or the error response (404 outside the branch, 403 otherwise).
 */
export async function loadRedeemAccess(userId: string, appointmentId: string): Promise<"ok" | Response> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { branchId: true, doctorId: true },
  });
  const role = appt ? await getUserBranchRole(userId, appt.branchId) : null;
  if (!appt || !role) {
    return NextResponse.json({ error: "not_found", message: "Appointment not found." }, { status: 404 });
  }
  if (!can(role, "appointment.manageAll") && appt.doctorId !== userId) {
    return NextResponse.json({ error: "forbidden", message: "You can't change this appointment." }, { status: 403 });
  }
  return "ok";
}
