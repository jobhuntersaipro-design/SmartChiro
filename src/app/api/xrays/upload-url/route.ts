import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPresignedUploadUrl, buildXrayKey, getR2PublicUrl } from '@/lib/r2'
import { auth } from '@/lib/auth'
import { canManagePatientXrays } from '@/lib/auth/xray'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png']
const MAX_FILE_SIZE = 300 * 1024 * 1024 // 300 MB

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Sign-in required.' },
        { status: 401 }
      )
    }
    const uploadedById = session.user.id

    const body = await request.json()
    const { fileName, fileSize, mimeType, patientId } = body

    // Validate required fields
    if (!fileName || !fileSize || !mimeType || !patientId) {
      return NextResponse.json(
        { error: 'Missing required fields: fileName, fileSize, mimeType, patientId.' },
        { status: 400 }
      )
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: 'Only JPEG and PNG files are supported.' },
        { status: 400 }
      )
    }

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 300 MB.' },
        { status: 400 }
      )
    }

    // Verify branch membership (also returns false if patient doesn't exist)
    if (!(await canManagePatientXrays(uploadedById, patientId))) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Patient not found.' },
        { status: 404 }
      )
    }

    // Get patient branchId for R2 key generation
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, branchId: true },
    })

    // Determine file extension from MIME type
    const ext = mimeType === 'image/png' ? 'png' : 'jpg'

    // Create Xray record in UPLOADING state
    const xray = await prisma.xray.create({
      data: {
        fileName,
        fileSize,
        mimeType,
        fileUrl: '', // placeholder, updated after key generation
        patientId,
        uploadedById,
        status: 'UPLOADING',
      },
    })

    // Build R2 keys (patient is guaranteed to exist — already verified above)
    const originalKey = buildXrayKey(patient!.branchId, patientId, xray.id, `original.${ext}`)
    const thumbnailKey = buildXrayKey(patient!.branchId, patientId, xray.id, 'thumbnail.jpg')

    // Generate presigned URLs (5 min expiry)
    const [uploadUrl, thumbnailUploadUrl] = await Promise.all([
      getPresignedUploadUrl(originalKey, mimeType),
      getPresignedUploadUrl(thumbnailKey, 'image/jpeg'),
    ])

    // Update xray record with the file URL
    const fileUrl = getR2PublicUrl(originalKey)
    const thumbnailUrl = getR2PublicUrl(thumbnailKey)

    await prisma.xray.update({
      where: { id: xray.id },
      data: { fileUrl, thumbnailUrl },
    })

    return NextResponse.json({
      xrayId: xray.id,
      uploadUrl,
      thumbnailUploadUrl,
      fileUrl,
      thumbnailUrl,
    })
  } catch (error) {
    console.error('Upload URL generation failed:', error)
    return NextResponse.json(
      { error: 'Failed to generate upload URL.' },
      { status: 500 }
    )
  }
}
