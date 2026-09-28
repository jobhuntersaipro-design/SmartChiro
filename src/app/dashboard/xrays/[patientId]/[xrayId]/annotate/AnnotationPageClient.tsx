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
  annotationVersion: number | null;
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
  annotationVersion,
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
      annotationVersion={annotationVersion}
      initialCanvasState={initialCanvasState}
      initialAdjustments={initialAdjustments}
      xrayId={xrayId}
      // Always back to the patient's X-rays — the viewer is often opened in a
      // new tab, where router.back() had no history and went to about:blank.
      onClose={() => router.push(`/dashboard/patients/${patientId}/details?tab=xrays`)}
      patientSeries={patientSeries}
    />
  );
}
