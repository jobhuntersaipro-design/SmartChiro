import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { r2Client, buildXrayKey, getR2PublicUrl } from '@/lib/r2'
import { PutObjectCommand } from '@aws-sdk/client-s3'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png']
const MAX_FILE_SIZE = 300 * 1024 * 1024 // 300 MB
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const thumbnail = formData.get('thumbnail') as File | null
    const patientId = formData.get('patientId') as string | null
    const uploadedById = formData.get('uploadedById') as string | null
    const widthStr = formData.get('width') as string | null
    const heightStr = formData.get('height') as string | null

    if (!uploadedById) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      )
    }

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

    const width = widthStr ? parseInt(widthStr, 10) : null
    const height = heightStr ? parseInt(heightStr, 10) : null

    // Verify patient exists
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
      },
    })

    const originalKey = buildXrayKey(patient.branchId, patientId, xray.id, `original.${ext}`)
    const fileUrl = getR2PublicUrl(originalKey)

    // Upload original to R2
    const fileBuffer = Buffer.from(await file.arrayBuffer())
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
      const thumbnailKey = buildXrayKey(patient.branchId, patientId, xray.id, 'thumbnail.jpg')
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
