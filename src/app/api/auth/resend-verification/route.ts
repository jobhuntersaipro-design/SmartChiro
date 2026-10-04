import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendVerificationEmail } from '@/lib/email'

const THROTTLE_MS = 60_000
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    const { email } = (await req.json()) as { email: string }

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    // Don't reveal whether user exists — always return success
    if (!user || user.emailVerified) {
      return NextResponse.json({ message: 'If an account exists, a verification email has been sent.' })
    }

    // At most one email a minute per address (a token lives 24 hours, so a
    // token expiring more than 24h − 60s from now was made in the last minute).
    const recent = await prisma.verificationToken.findFirst({
      where: { identifier: user.email, expires: { gt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS - THROTTLE_MS) } },
    })
    if (recent) {
      return NextResponse.json({ message: 'If an account exists, a verification email has been sent.' })
    }

    await sendVerificationEmail(user.email, user.name || 'there')

    return NextResponse.json({ message: 'If an account exists, a verification email has been sent.' })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
