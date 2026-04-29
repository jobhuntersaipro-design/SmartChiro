import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getXrayCapability } from '@/lib/auth/xray'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> },
) {
  const { xrayId } = await params
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Sign-in required.' }, { status: 401 })
  }
  if (!(await getXrayCapability(session.user.id, xrayId))) {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'X-ray not found.' }, { status: 404 })
  }

  const notes = await prisma.xrayNote.findMany({
    where: { xrayId },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, name: true, email: true } } },
  })

  const [current, ...history] = notes
  return NextResponse.json({ current: current ?? null, history })
}

const MAX_BODY = 10_000
const HISTORY_CAP = 100

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ xrayId: string }> },
) {
  const { xrayId } = await params
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Sign-in required.' }, { status: 401 })
  }
  // Notes write requires "manage" — same as edit metadata.
  const cap = await getXrayCapability(session.user.id, xrayId)
  if (cap !== 'manage') {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'X-ray not found.' }, { status: 404 })
  }

  let body: { bodyMd?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Invalid JSON.' }, { status: 400 })
  }
  const bodyMd = typeof body.bodyMd === 'string' ? body.bodyMd : ''
  if (bodyMd.length > MAX_BODY) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: `Body must be <= ${MAX_BODY} characters.` },
      { status: 400 },
    )
  }

  await prisma.xrayNote.create({
    data: { xrayId, authorId: session.user.id, bodyMd: bodyMd.trim() },
  })

  // Soft cap on revisions: keep only the latest HISTORY_CAP rows.
  const total = await prisma.xrayNote.count({ where: { xrayId } })
  if (total > HISTORY_CAP) {
    const stale = await prisma.xrayNote.findMany({
      where: { xrayId },
      orderBy: { createdAt: 'asc' },
      take: total - HISTORY_CAP,
      select: { id: true },
    })
    await prisma.xrayNote.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } })
  }

  const notes = await prisma.xrayNote.findMany({
    where: { xrayId },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, name: true, email: true } } },
  })
  const [current, ...history] = notes
  return NextResponse.json({ current: current ?? null, history }, { status: 201 })
}
