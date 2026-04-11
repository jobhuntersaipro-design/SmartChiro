import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ComparePageClient } from "./ComparePageClient";

export const dynamic = "force-dynamic";

interface ComparePageProps {
  searchParams: Promise<{ ids?: string }>;
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const { ids: idsParam } = await searchParams;

  if (!idsParam) {
    redirect("/dashboard/patients");
  }

  const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.length !== 2) {
    redirect("/dashboard/patients");
  }

  const xrays = await prisma.xray.findMany({
    where: { id: { in: ids }, status: "READY" },
    include: {
      patient: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (xrays.length !== 2 || xrays[0].patientId !== xrays[1].patientId) {
    redirect("/dashboard/patients");
  }

  const patientName = `${xrays[0].patient.firstName} ${xrays[0].patient.lastName}`;

  return (
    <ComparePageClient
      leftXray={{
        id: xrays[0].id,
        title: xrays[0].title ?? "Untitled",
        fileUrl: xrays[0].fileUrl,
        width: xrays[0].width ?? 1024,
        height: xrays[0].height ?? 768,
        createdAt: xrays[0].createdAt.toISOString(),
      }}
      rightXray={{
        id: xrays[1].id,
        title: xrays[1].title ?? "Untitled",
        fileUrl: xrays[1].fileUrl,
        width: xrays[1].width ?? 1024,
        height: xrays[1].height ?? 768,
        createdAt: xrays[1].createdAt.toISOString(),
      }}
      patientName={patientName}
    />
  );
}
