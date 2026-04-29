"use client";

import { useRouter } from "next/navigation";
import { AnnotationCanvas } from "@/components/annotation/AnnotationCanvas";
import type { AnnotationCanvasState, ImageAdjustments } from "@/types/annotation";
import type { SeriesXray } from "@/components/annotation/SeriesStrip";

interface AnnotationPageClientProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  xrayTitle: string;
  patientName: string;
  patientId: string;
  userId: string;
  annotationId: string | null;
  initialCanvasState?: AnnotationCanvasState;
  initialAdjustments?: ImageAdjustments;
  xrayId: string;
  patientSeries?: SeriesXray[];
}

export function AnnotationPageClient({
  imageUrl,
  imageWidth,
  imageHeight,
  xrayTitle,
  patientName,
  patientId,
  userId,
  annotationId,
  initialCanvasState,
  initialAdjustments,
  xrayId,
  patientSeries,
}: AnnotationPageClientProps) {
  const router = useRouter();

  return (
    <AnnotationCanvas
      imageUrl={imageUrl}
      imageWidth={imageWidth}
      imageHeight={imageHeight}
      xrayTitle={xrayTitle}
      patientName={patientName}
      patientId={patientId}
      userId={userId}
      annotationId={annotationId}
      initialCanvasState={initialCanvasState}
      initialAdjustments={initialAdjustments}
      xrayId={xrayId}
      onClose={() => router.back()}
      patientSeries={patientSeries}
    />
  );
}
