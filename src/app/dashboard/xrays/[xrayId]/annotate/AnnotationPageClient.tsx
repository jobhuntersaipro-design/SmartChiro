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
  annotationId: string | null;
  initialCanvasState?: AnnotationCanvasState;
  initialAdjustments?: ImageAdjustments;
  xrayId: string;
}

export function AnnotationPageClient({
  imageUrl,
  imageWidth,
  imageHeight,
  xrayTitle,
  patientName,
  annotationId,
  initialCanvasState,
  initialAdjustments,
}: AnnotationPageClientProps) {
  const router = useRouter();

  return (
    <AnnotationCanvas
      imageUrl={imageUrl}
      imageWidth={imageWidth}
      imageHeight={imageHeight}
      xrayTitle={xrayTitle}
      patientName={patientName}
      annotationId={annotationId}
      initialCanvasState={initialCanvasState}
      initialAdjustments={initialAdjustments}
      onClose={() => router.back()}
    />
  );
}
