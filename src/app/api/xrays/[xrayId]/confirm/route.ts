import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> }
) {
  try {
    const { xrayId } = await params
    const body = await request.json()
    const { width, height } = body

    // Validate dimensions
    if (!width || !height || typeof width !== 'number' || typeof height !== 'number') {
      return NextResponse.json(
        { error: 'Missing or invalid dimensions: width and height are required.' },
        { status: 400 }
      )
    }

    if (width < 100 || height < 100) {
      return NextResponse.json(
        { error: 'Image must be at least 100 × 100 pixels.' },
        { status: 400 }
      )
    }

    if (width > 16384 || height > 16384) {
      return NextResponse.json(
        { error: 'Image dimensions exceed the maximum of 16384 × 16384 pixels.' },
        { status: 400 }
      )
    }

    // Find the xray record
    const xray = await prisma.xray.findUnique({
      where: { id: xrayId },
      select: { id: true, status: true },
    })

    if (!xray) {
      return NextResponse.json(
        { error: 'X-ray not found.' },
        { status: 404 }
      )
    }

    if (xray.status !== 'UPLOADING') {
      return NextResponse.json(
        { error: 'X-ray upload has already been confirmed.' },
        { status: 409 }
      )
    }

    // Update to READY with dimensions
    const updatedXray = await prisma.xray.update({
      where: { id: xrayId },
      data: {
        status: 'READY',
        width,
        height,
      },
    })

    return NextResponse.json({ xray: updatedXray })
  } catch (error) {
    console.error('Upload confirmation failed:', error)
    return NextResponse.json(
      { error: 'Could not finalize upload.' },
      { status: 500 }
    )
  }
}
