import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canManageXray } from "@/lib/auth/xray";
import { aiUsageToday } from "@/lib/ai-usage";
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

  const { patientId, xrayId } = await params;
  const { annotationId } = await searchParams;

  // Same rule as the X-ray APIs: assigned doctor or branch OWNER/ADMIN.
  // notFound (not 403) so X-ray ids can't be probed.
  if (!(await canManageXray(session.user.id, xrayId))) notFound();

  const [xray, patientSeriesRaw, aiUsage] = await Promise.all([
    prisma.xray.findUnique({
      where: { id: xrayId },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        annotations: annotationId
          ? { where: { id: annotationId }, take: 1 }
          : { orderBy: { updatedAt: "desc" }, take: 1 },
      },
    }),
    prisma.xray.findMany({
      where: { patientId, status: "READY" },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, bodyRegion: true, thumbnailUrl: true, createdAt: true },
    }),
    aiUsageToday(session.user.id),
  ]);

  if (!xray || xray.patientId !== patientId) {
    notFound();
  }

  const annotation = xray.annotations[0] ?? null;
  const patientName = `${xray.patient.firstName} ${xray.patient.lastName}`;

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
      annotationVersion={annotation?.version ?? null}
      initialCanvasState={annotation?.canvasState as unknown as AnnotationCanvasState | undefined}
      initialAdjustments={annotation?.imageAdjustments as unknown as ImageAdjustments | undefined}
      xrayId={xrayId}
      patientSeries={patientSeries}
      aiUsage={{ used: aiUsage.xrayIds.size, limit: aiUsage.limit }}
    />
  );
}
