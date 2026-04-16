import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DoctorProfileView } from "@/components/dashboard/doctor/DoctorProfileView";
import type { DoctorDetail, DoctorProfile, WorkingSchedule } from "@/types/doctor";

export default async function DoctorProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { userId } = await params;

  // Fetch target user with profile and branches
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      doctorProfile: true,
      branchMemberships: {
        include: { branch: { select: { id: true, name: true } } },
      },
    },
  });

  if (!user || user.branchMemberships.length === 0) {
    notFound();
  }

  // Check caller shares a branch (or is self) + determine permissions
  const isSelf = session.user.id === userId;
  let canEdit = isSelf;
  let canToggleStatus = false;

  if (!isSelf) {
    const callerMemberships = await prisma.branchMember.findMany({
      where: { userId: session.user.id },
      select: { branchId: true, role: true },
    });
    const targetBranchIds = new Set(
      user.branchMemberships.map((m) => m.branchId)
    );
    const sharedMemberships = callerMemberships.filter((m) =>
      targetBranchIds.has(m.branchId)
    );
    if (sharedMemberships.length === 0) notFound();

    const isOwnerOrAdmin = sharedMemberships.some(
      (m) => m.role === "OWNER" || m.role === "ADMIN"
    );
    canEdit = isOwnerOrAdmin;
    canToggleStatus = isOwnerOrAdmin;
  }

  // Get stats
  const [patientCount, totalVisits, totalXrays] = await Promise.all([
    prisma.patient.count({ where: { doctorId: userId } }),
    prisma.visit.count({ where: { doctorId: userId } }),
    prisma.xray.count({ where: { uploadedById: userId } }),
  ]);

  const profile: DoctorProfile | null = user.doctorProfile
    ? {
        licenseNumber: user.doctorProfile.licenseNumber,
        specialties: user.doctorProfile.specialties,
        yearsExperience: user.doctorProfile.yearsExperience,
        education: user.doctorProfile.education,
        workingSchedule: user.doctorProfile.workingSchedule as WorkingSchedule | null,
        treatmentRoom: user.doctorProfile.treatmentRoom,
        consultationFee: user.doctorProfile.consultationFee
          ? Number(user.doctorProfile.consultationFee)
          : null,
        bio: user.doctorProfile.bio,
        languages: user.doctorProfile.languages,
        insurancePlans: user.doctorProfile.insurancePlans,
        isActive: user.doctorProfile.isActive,
      }
    : null;

  const doctor: DoctorDetail = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phoneNumber,
    image: user.image,
    profile,
    branches: user.branchMemberships.map((m) => ({
      id: m.branch.id,
      name: m.branch.name,
      role: m.role,
    })),
    stats: { patientCount, totalVisits, totalXrays },
  };

  return (
    <div className="px-8 py-6">
      {/* Breadcrumb */}
      <div className="mb-5">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-[14px] text-[#64748d] hover:text-[#533afd] transition-colors"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          Back to Dashboard
        </Link>
        <h1 className="text-[23px] font-light text-[#061b31] mt-1">
          {isSelf ? "My Profile" : `Dr. ${doctor.name ?? doctor.email}`}
        </h1>
      </div>

      <DoctorProfileView
        doctor={doctor}
        currentUserId={session.user.id}
        canEdit={canEdit}
        canToggleStatus={canToggleStatus}
      />
    </div>
  );
}
