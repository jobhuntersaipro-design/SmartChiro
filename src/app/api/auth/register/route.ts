import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { sendVerificationEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }
    const { name, email, password, confirmPassword } = body as {
      name: string
      email: string
      password: string
      confirmPassword: string
    }

    // Strings only: anything else would crash below (500) instead of a 400.
    if (
      typeof name !== 'string' || typeof email !== 'string' ||
      typeof password !== 'string' || typeof confirmPassword !== 'string' ||
      !name || !email || !password || !confirmPassword
    ) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Passwords do not match' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    // Uniform response for new vs existing email to prevent account
    // enumeration. A verified account is left alone. An unverified one takes
    // the new password and name: whoever proves the inbox (the link goes
    // there) must not inherit a password someone else registered first.
    const normalizedEmail = email.toLowerCase()
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, emailVerified: true },
    })

    if (!existingUser?.emailVerified) {
      const hashedPassword = await hash(password, 12)

      if (existingUser) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { name, password: hashedPassword },
        })
      } else {
        await prisma.user.create({
          data: {
            name,
            email: normalizedEmail,
            password: hashedPassword,
          },
        })
      }

      // A fresh link (older ones are dropped); don't block registration if email fails
      try {
        await sendVerificationEmail(normalizedEmail, name)
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError)
      }
    }

    return NextResponse.json(
      { message: 'If this email is not already registered, a verification email has been sent.' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
