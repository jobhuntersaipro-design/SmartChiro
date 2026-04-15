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

  return (
    <AnnotationPageClient
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
      initialCalibration={{
        isCalibrated: xray.isCalibrated,
        pixelsPerMm: xray.pixelsPerMm,
        calibrationNote: xray.calibrationNote,
      }}
    />
  );
}
