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
          <div style="display: inline-block; background: #533afd; border-radius: 6px; padding: 8px 12px; text-align: center;">
            <span style="color: white; font-size: 14px; font-weight: bold;">Smart Chiro</span>
          </div>
        </div>
        <h1 style="color: #061b31; font-size: 23px; font-weight: 600; text-align: center; margin-bottom: 8px;">
          Verify your email
        </h1>
        <p style="color: #273951; font-size: 15px; line-height: 1.5; text-align: center; margin-bottom: 32px;">
          Hi ${name}, thanks for signing up for SmartChiro. Please verify your email address to get started.
        </p>
        <div style="text-align: center; margin-bottom: 32px;">
          <a href="${verifyUrl}" style="display: inline-block; background: #533afd; color: white; font-size: 15px; font-weight: 500; text-decoration: none; padding: 10px 24px; border-radius: 4px;">
            Verify email address
          </a>
        </div>
        <p style="color: #64748d; font-size: 13px; line-height: 1.5; text-align: center;">
          This link expires in ${TOKEN_EXPIRY_HOURS} hours. If you didn't create a SmartChiro account, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e5edf5; margin: 32px 0;" />
        <p style="color: #64748d; font-size: 13px; text-align: center;">
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

// ─── Password Reset ───

const PASSWORD_RESET_EXPIRY_HOURS = 1

export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000)

  // Single-active-token invariant: drop any prior tokens for this user
  await prisma.passwordResetToken.deleteMany({
    where: { userId },
  })

  await prisma.passwordResetToken.create({
    data: {
      userId,
      token,
      expires,
    },
  })

  return token
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string
) {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`

  const { error } = await resend.emails.send({
    from: 'SmartChiro <noreply@smartchiro.org>',
    to: email,
    subject: 'Reset your SmartChiro password',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #533afd; border-radius: 6px; padding: 8px 12px; text-align: center;">
            <span style="color: white; font-size: 14px; font-weight: bold;">Smart Chiro</span>
          </div>
        </div>
        <h1 style="color: #061b31; font-size: 23px; font-weight: 600; text-align: center; margin-bottom: 8px;">
          Reset your password
        </h1>
        <p style="color: #273951; font-size: 15px; line-height: 1.5; text-align: center; margin-bottom: 32px;">
          Hi ${name}, we received a request to reset your SmartChiro password. Click the button below to choose a new one. If you didn't request this, you can safely ignore this email — your password won't change.
        </p>
        <div style="text-align: center; margin-bottom: 32px;">
          <a href="${resetUrl}" style="display: inline-block; background: #533afd; color: white; font-size: 15px; font-weight: 500; text-decoration: none; padding: 10px 24px; border-radius: 4px;">
            Reset password
          </a>
        </div>
        <p style="color: #64748d; font-size: 13px; line-height: 1.5; text-align: center;">
          This link expires in ${PASSWORD_RESET_EXPIRY_HOURS} hour. If you didn't request a reset, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e5edf5; margin: 32px 0;" />
        <p style="color: #64748d; font-size: 13px; text-align: center;">
          SmartChiro — See More. Treat Better.
        </p>
      </div>
    `,
  })

  if (error) {
    console.error('Failed to send password reset email:', error)
    throw new Error('Failed to send password reset email')
  }
}

// ─── Reminder emails ───

export type ReminderEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'invalid_email' | 'bounce_hard' | 'unknown'; message: string }

/**
 * Notify a doctor that a new appointment was booked on their calendar. Fail-soft:
 * any email error is swallowed and logged so the booking flow never fails on
 * notification problems. Skipped silently if RESEND_API_KEY is unset (dev environments).
 */
export async function sendDoctorBookingNotification(args: {
  to: string
  doctorName: string | null
  patientName: string
  dateTime: Date
  duration: number
  branchName: string
  treatmentLabel: string | null
  bookedByName: string | null
  appointmentUrl: string
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  const dt = args.dateTime
  const dateStr = dt.toLocaleString('en-MY', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const greeting = args.doctorName ? `Hi ${args.doctorName.split(' ')[0]},` : 'Hi,'
  const treatmentLine = args.treatmentLabel
    ? `<p style="margin: 6px 0; color: #425466;"><strong>Treatment:</strong> ${args.treatmentLabel}</p>`
    : ''
  const bookedByLine = args.bookedByName
    ? `<p style="margin: 6px 0; color: #697386; font-size: 13px;">Booked by ${args.bookedByName}</p>`
    : ''
  try {
    await resend.emails.send({
      from: 'SmartChiro <noreply@smartchiro.org>',
      to: args.to,
      subject: `New appointment with ${args.patientName} — ${dateStr}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px; color: #061b31;">
          <p style="margin: 0 0 16px; font-size: 15px;">${greeting}</p>
          <p style="margin: 0 0 16px; font-size: 15px;">A new appointment has just been booked on your calendar.</p>
          <div style="background: #F6F9FC; border: 1px solid #e5edf5; border-radius: 6px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0 0 8px; font-size: 17px; font-weight: 600;">${args.patientName}</p>
            <p style="margin: 6px 0; color: #425466;"><strong>When:</strong> ${dateStr} (${args.duration} min)</p>
            <p style="margin: 6px 0; color: #425466;"><strong>Branch:</strong> ${args.branchName}</p>
            ${treatmentLine}
            ${bookedByLine}
          </div>
          <p style="margin: 24px 0 0;">
            <a href="${args.appointmentUrl}" style="background: #635BFF; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: 500; font-size: 14px;">View appointment</a>
          </p>
          <p style="margin: 32px 0 0; font-size: 12px; color: #697386;">SmartChiro · Appointment notification</p>
        </div>
      `,
      text: `${greeting}\n\nA new appointment has been booked.\n\nPatient: ${args.patientName}\nWhen: ${dateStr} (${args.duration} min)\nBranch: ${args.branchName}${args.treatmentLabel ? `\nTreatment: ${args.treatmentLabel}` : ''}${args.bookedByName ? `\nBooked by: ${args.bookedByName}` : ''}\n\nView: ${args.appointmentUrl}`,
    })
  } catch (e) {
    console.error('appointment-booked notification failed', { to: args.to, error: e })
  }
}

export async function sendReminderEmail(args: {
  to: string
  subject: string
  html: string
  text: string
  from: string
}): Promise<ReminderEmailResult> {
  try {
    const r = await resend.emails.send({
      from: args.from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    })
    if (r.error) {
      const m = r.error.message ?? ''
      const reason: 'invalid_email' | 'bounce_hard' | 'unknown' = /invalid.*(email|address)/i.test(
        m
      )
        ? 'invalid_email'
        : /bounce|undeliverable|hard.*fail/i.test(m)
          ? 'bounce_hard'
          : 'unknown'
      return { ok: false, reason, message: m }
    }
    return { ok: true, id: r.data?.id ?? '' }
  } catch (e) {
    return {
      ok: false,
      reason: 'unknown',
      message: e instanceof Error ? e.message : String(e),
    }
  }
}
