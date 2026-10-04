import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireXrayAccess } from '@/lib/auth/xray-guard'
import { buildXrayKey, deleteR2Object } from '@/lib/r2'
import { paywallCurrentUser } from '@/lib/paywall'

/**
 * A direct upload failed or was cancelled: remove its UPLOADING row (and any
 * partial files) so it doesn't linger. Confirmed X-rays are never touched.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> }
) {
  const blocked = await paywallCurrentUser()
  if (blocked) return blocked
  const { xrayId } = await params
  const guard = await requireXrayAccess(xrayId)
  if (guard.error) return guard.error

  const xray = await prisma.xray.findUnique({
    where: { id: xrayId },
    select: { id: true, status: true, mimeType: true, patientId: true, patient: { select: { branchId: true } } },
  })
  if (!xray || xray.status !== 'UPLOADING') {
    return NextResponse.json({ error: 'NOT_ABORTABLE' }, { status: 409 })
  }

  await prisma.xray.delete({ where: { id: xrayId } })

  const ext = xray.mimeType === 'image/png' ? 'png' : 'jpg'
  await Promise.allSettled(
    [`original.${ext}`, 'thumbnail.jpg'].map((name) =>
      deleteR2Object(buildXrayKey(xray.patient.branchId, xray.patientId, xray.id, name))
    )
  )

  return new NextResponse(null, { status: 204 })
}
