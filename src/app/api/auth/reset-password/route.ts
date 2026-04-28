import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: unknown
      password?: unknown
    }
    const token = typeof body.token === 'string' ? body.token : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!token) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const tokenRow = await prisma.passwordResetToken.findUnique({
      where: { token },
    })

    if (!tokenRow) {
      return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
    }

    if (tokenRow.expires < new Date()) {
      await prisma.passwordResetToken.delete({ where: { id: tokenRow.id } })
      return NextResponse.json({ error: 'expired_token' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: tokenRow.userId } })

    if (!user) {
      // Orphaned token — clean up and reject
      await prisma.passwordResetToken.delete({ where: { id: tokenRow.id } })
      return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
    }

    const newHash = await hash(password, 12)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: newHash,
          // A successful password reset via emailed link proves email ownership.
          // Promotes Google-only users into dual sign-in. Don't overwrite if already set.
          ...(user.emailVerified ? {} : { emailVerified: new Date() }),
        },
      }),
      prisma.passwordResetToken.delete({ where: { id: tokenRow.id } }),
    ])

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('reset-password error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
