import { Resend } from 'resend'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'

const resend = new Resend(process.env.RESEND_API_KEY)

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const TOKEN_EXPIRY_HOURS = 24

export async function createVerificationToken(email: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

  // Delete any existing tokens for this email
  await prisma.verificationToken.deleteMany({
    where: { identifier: email },
  })

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires,
    },
  })

  return token
}

export async function sendVerificationEmail(email: string, name: string) {
  const token = await createVerificationToken(email)
  const verifyUrl = `${APP_URL}/api/auth/verify?token=${token}`

  const { error } = await resend.emails.send({
    from: 'SmartChiro <noreply@smartchiro.org>',
    to: email,
    subject: 'Verify your SmartChiro account',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; width: 48px; height: 48px; background: #635BFF; border-radius: 6px; line-height: 48px; text-align: center;">
            <span style="color: white; font-size: 20px; font-weight: bold;">S</span>
          </div>
        </div>
        <h1 style="color: #0A2540; font-size: 23px; font-weight: 600; text-align: center; margin-bottom: 8px;">
          Verify your email
        </h1>
        <p style="color: #425466; font-size: 15px; line-height: 1.5; text-align: center; margin-bottom: 32px;">
          Hi ${name}, thanks for signing up for SmartChiro. Please verify your email address to get started.
        </p>
        <div style="text-align: center; margin-bottom: 32px;">
          <a href="${verifyUrl}" style="display: inline-block; background: #635BFF; color: white; font-size: 15px; font-weight: 500; text-decoration: none; padding: 10px 24px; border-radius: 4px;">
            Verify email address
          </a>
        </div>
        <p style="color: #697386; font-size: 13px; line-height: 1.5; text-align: center;">
          This link expires in ${TOKEN_EXPIRY_HOURS} hours. If you didn't create a SmartChiro account, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #E3E8EE; margin: 32px 0;" />
        <p style="color: #697386; font-size: 13px; text-align: center;">
          SmartChiro — See More. Treat Better.
        </p>
      </div>
    `,
  })

  if (error) {
    console.error('Failed to send verification email:', error)
    throw new Error('Failed to send verification email')
  }
}
