import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireXrayAccess } from '@/lib/auth/xray-guard'
import { buildXrayKey, headR2Object, readR2ObjectPrefix } from '@/lib/r2'
import { checkUploadedImage, SNIFF_BYTES } from '@/lib/image-sniff'
import { paywallCurrentUser } from '@/lib/paywall'

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
  const blocked = await paywallCurrentUser()
  if (blocked) return blocked
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
    const key = buildXrayKey(xray.patient.branchId, xray.patientId, xray.id, `original.${ext}`)
    let header: Uint8Array | null = null
    try {
      const object = await headR2Object(key)
      if (!object) {
        return NextResponse.json(
          { error: 'UPLOAD_NOT_RECEIVED', message: "The file didn't reach storage. Please upload it again." },
          { status: 409 }
        )
      }
      header = await readR2ObjectPrefix(key, SNIFF_BYTES)
    } catch (error) {
      console.error('Could not verify uploaded X-ray (continuing):', error)
    }

    // The declared type and size come from the browser: check the file's
    // magic bytes, and store the size from its header rather than the claim.
    let realWidth = width
    let realHeight = height
    if (header) {
      const check = checkUploadedImage(header, xray.mimeType, { width, height })
      if (!check.ok) {
        return NextResponse.json({ error: 'invalid_image', message: check.message }, { status: 422 })
      }
      realWidth = check.width ?? width
      realHeight = check.height ?? height
    }

    const updatedXray = await prisma.xray.update({
      where: { id: xrayId },
      data: {
        status: 'READY',
        width: realWidth,
        height: realHeight,
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
