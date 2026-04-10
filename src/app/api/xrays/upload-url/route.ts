import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPresignedUploadUrl, buildXrayKey, getR2PublicUrl } from '@/lib/r2'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png']
const MAX_FILE_SIZE = 300 * 1024 * 1024 // 300 MB

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fileName, fileSize, mimeType, patientId } = body

    // TODO: Replace with real auth when NextAuth is set up
    const uploadedById = body.uploadedById as string
    if (!uploadedById) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      )
    }

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

    // Verify patient exists and get branchId
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, branchId: true },
    })

    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found.' },
        { status: 404 }
      )
    }

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

    // Build R2 keys
    const originalKey = buildXrayKey(patient.branchId, patientId, xray.id, `original.${ext}`)
    const thumbnailKey = buildXrayKey(patient.branchId, patientId, xray.id, 'thumbnail.jpg')

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
