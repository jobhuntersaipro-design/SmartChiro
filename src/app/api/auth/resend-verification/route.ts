import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendVerificationEmail } from '@/lib/email'

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

    await sendVerificationEmail(user.email, user.name || 'there')

    return NextResponse.json({ message: 'If an account exists, a verification email has been sent.' })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
