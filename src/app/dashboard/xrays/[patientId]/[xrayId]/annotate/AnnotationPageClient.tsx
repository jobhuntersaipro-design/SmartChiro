"use client";

import { useRouter } from "next/navigation";
import { AnnotationCanvas } from "@/components/annotation/AnnotationCanvas";
import type { AnnotationCanvasState, ImageAdjustments } from "@/types/annotation";

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
  initialCalibration?: {
    isCalibrated: boolean;
    pixelsPerMm: number | null;
    calibrationNote: string | null;
  };
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
  initialCalibration,
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
      initialCalibration={initialCalibration}
    />
  );
}
