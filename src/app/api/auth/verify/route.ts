import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/verify-email?status=invalid', req.url))
  }

  const verificationToken = await prisma.verificationToken.findUnique({
    where: { token },
  })

  if (!verificationToken) {
    return NextResponse.redirect(new URL('/verify-email?status=invalid', req.url))
  }

  if (verificationToken.expires < new Date()) {
    // Clean up expired token
    await prisma.verificationToken.delete({
      where: { token },
    })
    return NextResponse.redirect(new URL('/verify-email?status=expired', req.url))
  }

  // Mark user as verified
  const user = await prisma.user.findUnique({
    where: { email: verificationToken.identifier },
  })

  if (!user) {
    return NextResponse.redirect(new URL('/verify-email?status=invalid', req.url))
  }

  if (user.emailVerified) {
    // Already verified — clean up token and redirect
    await prisma.verificationToken.delete({
      where: { token },
    })
    return NextResponse.redirect(new URL('/verify-email?status=already-verified', req.url))
  }

  // Verify user and delete token
  await prisma.$transaction([
    prisma.user.update({
      where: { email: verificationToken.identifier },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.delete({
      where: { token },
    }),
  ])

  return NextResponse.redirect(new URL('/verify-email?status=success', req.url))
}
