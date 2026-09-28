import { NextResponse } from "next/server";
import type { BranchRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserBranchRole } from "@/lib/auth-utils";

/**
 * Role checks for packages, care plans and appointment series (Phase 3).
 *
 * TODO(front-desk): switch to src/lib/permissions.ts once the FRONT_DESK role
 * merges. FRONT_DESK may sell / view packages and book series, but must NOT
 * see care plans. Every call site is marked with the same TODO.
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
  // TODO(front-desk): FRONT_DESK may view packages.
  return access.isManager || access.isAssignedDoctor;
}

/** Packages: sell / cancel — managers. */
export function canSellPackages(role: BranchRole | null): boolean {
  // TODO(front-desk): FRONT_DESK may sell packages.
  return isManagerRole(role);
}

/** Care plans are clinical: managers and the patient's own doctor. */
export function canAccessCarePlans(access: PatientAccess): boolean {
  // TODO(front-desk): FRONT_DESK must NOT see care plans (keep it excluded).
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
  // TODO(front-desk): FRONT_DESK completes appointments and takes payment — allow redeem/reverse.
  if (!isManagerRole(role) && appt.doctorId !== userId) {
    return NextResponse.json({ error: "forbidden", message: "You can't change this appointment." }, { status: 403 });
  }
  return "ok";
}
