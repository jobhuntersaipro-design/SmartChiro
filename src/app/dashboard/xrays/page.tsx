import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Image, ExternalLink } from "lucide-react";
import { XraysPageClient } from "./XraysPageClient";

export const dynamic = "force-dynamic";

export default async function XraysPage() {
  const xrays = await prisma.xray.findMany({
    include: {
      patient: { select: { firstName: true, lastName: true } },
      _count: { select: { annotations: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const patients = await prisma.patient.findMany({
    select: { id: true, firstName: true, lastName: true },
    orderBy: { lastName: "asc" },
    take: 100,
  });

  return (
    <div className="px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "#0A2540" }}>
            X-Rays
          </h1>
          <p className="text-sm" style={{ color: "#697386" }}>
            View and annotate patient X-ray images
          </p>
        </div>
      </div>

      <XraysPageClient
        patients={patients}
        xrays={xrays.map((xray) => ({
          id: xray.id,
          title: xray.title,
          bodyRegion: xray.bodyRegion,
          viewType: xray.viewType,
          status: xray.status,
          patientName: `${xray.patient.firstName} ${xray.patient.lastName}`,
          annotationCount: xray._count.annotations,
        }))}
      />
    </div>
  );
}
