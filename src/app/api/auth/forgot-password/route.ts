import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createPasswordResetToken,
  sendPasswordResetEmail,
} from '@/lib/email'

const THROTTLE_MS = 60_000

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { email?: unknown }
    const rawEmail = typeof body.email === 'string' ? body.email : ''
    const email = rawEmail.trim().toLowerCase()

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: 'A valid email is required' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({ where: { email } })

    // No-leak: silent success when the user does not exist
    if (!user) {
      return NextResponse.json({ success: true }, { status: 200 })
    }

    // Throttle: if a token was created within the last 60s, return success silently
    const recent = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(Date.now() - THROTTLE_MS) },
      },
    })
    if (recent) {
      return NextResponse.json({ success: true }, { status: 200 })
    }

    const token = await createPasswordResetToken(user.id)

    try {
      await sendPasswordResetEmail(user.email, user.name ?? 'there', token)
    } catch (e) {
      // Always return success to avoid revealing send failures
      console.error('forgot-password: send failed', e)
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('forgot-password error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
