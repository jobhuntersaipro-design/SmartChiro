import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireXrayAccess } from '@/lib/auth/xray-guard'
import { buildXrayKey, headR2Object } from '@/lib/r2'

const confirmSchema = z.object({
  width: z.number().int().min(100, 'Image must be at least 100 × 100 pixels.').max(16384, 'Image dimensions exceed the maximum of 16384 × 16384 pixels.'),
  height: z.number().int().min(100, 'Image must be at least 100 × 100 pixels.').max(16384, 'Image dimensions exceed the maximum of 16384 × 16384 pixels.'),
  title: z.string().trim().max(200).optional(),
  bodyRegion: z.enum(['CERVICAL', 'THORACIC', 'LUMBAR', 'PELVIS', 'FULL_SPINE', 'EXTREMITY', 'OTHER']).nullish(),
  viewType: z.enum(['AP', 'LATERAL', 'OBLIQUE', 'PA', 'OTHER']).nullish(),
})

/**
 * Second half of the direct upload: the browser has PUT the file to R2 with
 * the presigned URL from /api/xrays/upload-url. Verify it actually arrived,
 * then mark the X-ray READY with its dimensions and metadata.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> }
) {
  try {
    const { xrayId } = await params
    const guard = await requireXrayAccess(xrayId)
    if (guard.error) return guard.error

    const parsed = confirmSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Missing or invalid dimensions: width and height are required.' },
        { status: 400 }
      )
    }
    const { width, height, title, bodyRegion, viewType } = parsed.data

    const xray = await prisma.xray.findUnique({
      where: { id: xrayId },
      select: { id: true, status: true, mimeType: true, patientId: true, patient: { select: { branchId: true } } },
    })

    if (!xray) {
      return NextResponse.json({ error: 'X-ray not found.' }, { status: 404 })
    }

    if (xray.status !== 'UPLOADING') {
      return NextResponse.json({ error: 'X-ray upload has already been confirmed.' }, { status: 409 })
    }

    // Don't mark READY unless the file really is in storage — otherwise the
    // X-ray shows up with a broken image. Storage errors other than "not
    // found" are logged and don't block (the upload itself succeeded).
    const ext = xray.mimeType === 'image/png' ? 'png' : 'jpg'
    try {
      const object = await headR2Object(buildXrayKey(xray.patient.branchId, xray.patientId, xray.id, `original.${ext}`))
      if (!object) {
        return NextResponse.json(
          { error: 'UPLOAD_NOT_RECEIVED', message: "The file didn't reach storage. Please upload it again." },
          { status: 409 }
        )
      }
    } catch (error) {
      console.error('Could not verify uploaded X-ray (continuing):', error)
    }

    const updatedXray = await prisma.xray.update({
      where: { id: xrayId },
      data: {
        status: 'READY',
        width,
        height,
        ...(title ? { title } : {}),
        ...(bodyRegion ? { bodyRegion } : {}),
        ...(viewType ? { viewType } : {}),
      },
    })

    return NextResponse.json({ xray: updatedXray })
  } catch (error) {
    console.error('Upload confirmation failed:', error)
    return NextResponse.json({ error: 'Could not finalize upload.' }, { status: 500 })
  }
}
