import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AnnotationPageClient } from "./AnnotationPageClient";
import type { AnnotationCanvasState, ImageAdjustments } from "@/types/annotation";

interface AnnotationPageProps {
  params: Promise<{ patientId: string; xrayId: string }>;
  searchParams: Promise<{ annotationId?: string }>;
}

export default async function AnnotationPage({
  params,
  searchParams,
}: AnnotationPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { xrayId } = await params;
  const { annotationId } = await searchParams;

  const xray = await prisma.xray.findUnique({
    where: { id: xrayId },
    include: {
      patient: { select: { firstName: true, lastName: true } },
      annotations: annotationId
        ? { where: { id: annotationId }, take: 1 }
        : { orderBy: { updatedAt: "desc" }, take: 1 },
    },
  });

  if (!xray) {
    notFound();
  }

  const annotation = xray.annotations[0] ?? null;
  const patientName = `${xray.patient.firstName} ${xray.patient.lastName}`;

  const patientSeriesRaw = await prisma.xray.findMany({
    where: { patientId: xray.patientId, status: "READY" },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, bodyRegion: true, thumbnailUrl: true, createdAt: true },
  });

  const patientSeries = patientSeriesRaw.map((x) => ({
    id: x.id,
    title: x.title,
    bodyRegion: x.bodyRegion,
    thumbnailUrl: x.thumbnailUrl,
    createdAt: x.createdAt.toISOString(),
  }));

  return (
    <AnnotationPageClient
      key={xrayId}
      imageUrl={xray.fileUrl}
      imageWidth={xray.width ?? 1024}
      imageHeight={xray.height ?? 768}
      xrayTitle={xray.title ?? "Untitled X-ray"}
      patientName={patientName}
      patientId={xray.patientId}
      userId={session.user.id}
      annotationId={annotation?.id ?? null}
      initialCanvasState={annotation?.canvasState as unknown as AnnotationCanvasState | undefined}
      initialAdjustments={annotation?.imageAdjustments as unknown as ImageAdjustments | undefined}
      xrayId={xrayId}
      patientSeries={patientSeries}
    />
  );
}
