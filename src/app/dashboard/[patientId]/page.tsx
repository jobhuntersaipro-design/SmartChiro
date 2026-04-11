import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PatientDetailView } from "@/components/patients/PatientDetailView";

interface Props {
  params: Promise<{ patientId: string }>;
}

export default async function PatientDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { patientId } = await params;

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      xrays: {
        where: { status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          bodyRegion: true,
          viewType: true,
          status: true,
          thumbnailUrl: true,
          createdAt: true,
          _count: { select: { annotations: true } },
        },
      },
      doctor: {
        select: { name: true },
      },
    },
  });

  if (!patient) redirect("/dashboard/patients");

  return (
    <PatientDetailView
      patient={{
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        phone: patient.phone,
        dateOfBirth: patient.dateOfBirth?.toISOString() ?? null,
        gender: patient.gender,
        address: patient.address,
        emergencyContact: patient.emergencyContact,
        medicalHistory: patient.medicalHistory,
        notes: patient.notes,
        doctorName: patient.doctor?.name ?? "Unknown",
        createdAt: patient.createdAt.toISOString(),
        xrays: patient.xrays.map((x) => ({
          id: x.id,
          title: x.title,
          bodyRegion: x.bodyRegion,
          viewType: x.viewType,
          status: x.status,
          thumbnailUrl: x.thumbnailUrl,
          annotationCount: x._count.annotations,
          createdAt: x.createdAt.toISOString(),
        })),
      }}
    />
  );
}
