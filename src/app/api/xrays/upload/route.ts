import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { r2Client, buildXrayKey, getR2PublicUrl } from '@/lib/r2'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { auth } from '@/lib/auth'
import { canManagePatientXrays } from '@/lib/auth/xray'
import { checkUploadedImage } from '@/lib/image-sniff'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png']
const MAX_FILE_SIZE = 300 * 1024 * 1024 // 300 MB
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!
const BODY_REGIONS = ['CERVICAL', 'THORACIC', 'LUMBAR', 'PELVIS', 'FULL_SPINE', 'EXTREMITY', 'OTHER'] as const
const VIEW_TYPES = ['AP', 'LATERAL', 'OBLIQUE', 'PA', 'OTHER'] as const

/**
 * Fallback upload through the server, used only when the browser can't PUT
 * to R2 directly (bucket CORS not configured) and the file is small enough
 * for a serverless request body (~4.5 MB on Vercel). The normal path is
 * /api/xrays/upload-url → PUT to R2 → /api/xrays/[id]/confirm.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Sign-in required.' },
        { status: 401 }
      )
    }
    const uploadedById = session.user.id

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const thumbnail = formData.get('thumbnail') as File | null
    const patientId = formData.get('patientId') as string | null
    const widthStr = formData.get('width') as string | null
    const heightStr = formData.get('height') as string | null
    const title = ((formData.get('title') as string | null) ?? '').trim().slice(0, 200) || null
    const bodyRegion = BODY_REGIONS.find((r) => r === formData.get('bodyRegion')) ?? null
    const viewType = VIEW_TYPES.find((v) => v === formData.get('viewType')) ?? null

    if (!file || !patientId) {
      return NextResponse.json(
        { error: 'Missing required fields: file and patientId.' },
        { status: 400 }
      )
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only JPEG and PNG files are supported.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 300 MB.' },
        { status: 400 }
      )
    }

    const declaredWidth = widthStr ? parseInt(widthStr, 10) : NaN
    const declaredHeight = heightStr ? parseInt(heightStr, 10) : NaN

    // The file's own bytes decide: it must really be the declared PNG/JPEG,
    // and its header size wins over the size the browser reported.
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const check = checkUploadedImage(fileBuffer, file.type, {
      width: Number.isFinite(declaredWidth) ? declaredWidth : null,
      height: Number.isFinite(declaredHeight) ? declaredHeight : null,
    })
    if (!check.ok) {
      return NextResponse.json({ error: 'invalid_image', message: check.message }, { status: 422 })
    }
    const { width, height } = check

    // Verify branch membership (also returns false if patient doesn't exist)
    if (!(await canManagePatientXrays(uploadedById, patientId))) {
      return NextResponse.json(
        { error: 'Patient not found.' },
        { status: 404 }
      )
    }

    // Fetch patient branchId for R2 key generation (guaranteed to exist)
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, branchId: true },
    })

    const ext = file.type === 'image/png' ? 'png' : 'jpg'

    // Create Xray record
    const xray = await prisma.xray.create({
      data: {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        fileUrl: '',
        patientId,
        uploadedById,
        status: 'UPLOADING',
        width,
        height,
        title,
        bodyRegion,
        viewType,
      },
    })

    const originalKey = buildXrayKey(patient!.branchId, patientId, xray.id, `original.${ext}`)
    const fileUrl = getR2PublicUrl(originalKey)

    // Upload original to R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: originalKey,
        Body: fileBuffer,
        ContentType: file.type,
      })
    )

    // Upload thumbnail if provided
    let thumbnailUrl: string | null = null
    if (thumbnail) {
      const thumbnailKey = buildXrayKey(patient!.branchId, patientId, xray.id, 'thumbnail.jpg')
      const thumbBuffer = Buffer.from(await thumbnail.arrayBuffer())
      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: thumbnailKey,
          Body: thumbBuffer,
          ContentType: 'image/jpeg',
        })
      )
      thumbnailUrl = getR2PublicUrl(thumbnailKey)
    }

    // Update xray to READY
    await prisma.xray.update({
      where: { id: xray.id },
      data: {
        fileUrl,
        thumbnailUrl,
        status: 'READY',
      },
    })

    return NextResponse.json({
      xrayId: xray.id,
      fileUrl,
      thumbnailUrl,
    })
  } catch (error) {
    console.error('Upload failed:', error)
    return NextResponse.json(
      { error: 'Upload failed.' },
      { status: 500 }
    )
  }
}
