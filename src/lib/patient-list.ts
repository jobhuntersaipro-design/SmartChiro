import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Patient } from "@/types/patient";

export async function listPatients(
  userId: string,
  filters: {
    search?: string | null;
    branchId?: string | null;
    status?: string | null;
    doctorId?: string | null;
  } = {},
): Promise<Patient[]> {
  const search = filters.search?.trim() || null;
  const branchIdFilter = filters.branchId || null;
  const statusFilter = filters.status || null;
  const doctorIdFilter = filters.doctorId || null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      activeBranchId: true,
      branchMemberships: { select: { branchId: true, role: true } },
    },
  });

  const activeBranchId = branchIdFilter || user?.activeBranchId || user?.branchMemberships[0]?.branchId;
  const membershipInBranch = user?.branchMemberships.find((m) => m.branchId === activeBranchId);
  const isOwnerOrAdmin = membershipInBranch?.role === "OWNER" || membershipInBranch?.role === "ADMIN";

  const where: Prisma.PatientWhereInput = {};
  if (isOwnerOrAdmin && activeBranchId) {
    where.branchId = activeBranchId;
    if (doctorIdFilter && doctorIdFilter !== "all") where.doctorId = doctorIdFilter;
  } else {
    const memberBranchIds = user?.branchMemberships.map((m) => m.branchId) ?? [];
    const targetBranchIds = branchIdFilter
      ? memberBranchIds.includes(branchIdFilter) ? [branchIdFilter] : []
      : memberBranchIds;
    where.doctorId = userId;
    where.branchId = { in: targetBranchIds };
  }

  if (statusFilter && statusFilter !== "all") where.status = statusFilter;
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { icNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  const now = new Date();
  const patients = await prisma.patient.findMany({
    where,
    include: {
      doctor: { select: { id: true, name: true } },
      _count: { select: { visits: true, xrays: true } },
      visits: {
        select: { visitDate: true },
        orderBy: { visitDate: "desc" },
        take: 1,
      },
      appointments: {
        where: { status: { in: ["SCHEDULED", "CHECKED_IN"] }, dateTime: { gte: now } },
        orderBy: { dateTime: "asc" },
        take: 1,
        select: { id: true, dateTime: true, status: true, doctorId: true, duration: true, notes: true },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return patients.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    phone: p.phone,
    icNumber: p.icNumber,
    dateOfBirth: p.dateOfBirth?.toISOString() ?? null,
    gender: p.gender,
    occupation: p.occupation,
    race: p.race,
    maritalStatus: p.maritalStatus,
    bloodType: p.bloodType,
    allergies: p.allergies,
    referralSource: p.referralSource,
    initialTreatmentFee: p.initialTreatmentFee,
    firstTreatmentFee: p.firstTreatmentFee,
    standardFollowUpFee: p.standardFollowUpFee,
    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    city: p.city,
    state: p.state,
    postcode: p.postcode,
    country: p.country,
    emergencyName: p.emergencyName,
    emergencyPhone: p.emergencyPhone,
    emergencyRelation: p.emergencyRelation,
    address: p.address,
    emergencyContact: p.emergencyContact,
    medicalHistory: p.medicalHistory,
    notes: p.notes,
    status: p.status ?? "active",
    reminderChannel: p.reminderChannel,
    preferredLanguage: p.preferredLanguage === "ms" ? "ms" : "en",
    doctorId: p.doctorId,
    doctorName: p.doctor?.name ?? "Unknown",
    branchId: p.branchId,
    lastVisit: p.visits[0]?.visitDate?.toISOString() ?? null,
    totalVisits: p._count.visits,
    totalXrays: p._count.xrays,
    upcomingAppointment: p.appointments[0]
      ? {
          id: p.appointments[0].id,
          dateTime: p.appointments[0].dateTime.toISOString(),
          status: p.appointments[0].status,
          doctorId: p.appointments[0].doctorId,
          duration: p.appointments[0].duration,
          notes: p.appointments[0].notes ?? null,
        }
      : null,
    createdAt: p.createdAt.toISOString(),
    xrays: [],
  }));
}
