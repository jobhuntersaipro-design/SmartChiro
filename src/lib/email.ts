import { Resend } from 'resend'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { CLINIC_TIME_ZONE, clinicDateLabel } from '@/lib/clinic-time'
import { PLANS, TRIAL_DAYS } from '@/lib/plans'

// Created on first use: constructing Resend without a key throws, which used
// to crash any route importing this module (e.g. /login, build page-data
// collection) when RESEND_API_KEY was unset.
let resendClient: Resend | null = null
function resend(): Resend {
  resendClient ??= new Resend(process.env.RESEND_API_KEY)
  return resendClient
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const TOKEN_EXPIRY_HOURS = 24

/**
 * Minimal HTML escape for values interpolated into email HTML templates.
 * Patient names, branch names, etc. can contain `<`/`>`/`&` characters that
 * would otherwise break the rendered email or inject unintended markup.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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

  const { error } = await resend().emails.send({
    from: 'SmartChiro <noreply@smartchiro.org>',
    to: email,
    subject: 'Verify your SmartChiro account',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #7747ff; border-radius: 6px; padding: 8px 12px; text-align: center;">
            <span style="color: white; font-size: 14px; font-weight: bold;">Smart Chiro</span>
          </div>
        </div>
        <h1 style="color: #0b0b0b; font-size: 23px; font-weight: 600; text-align: center; margin-bottom: 8px;">
          Verify your email
        </h1>
        <p style="color: #0b0b0b; font-size: 15px; line-height: 1.5; text-align: center; margin-bottom: 32px;">
          Hi ${escapeHtml(name)}, thanks for signing up for SmartChiro. Please verify your email address to get started.
        </p>
        <div style="text-align: center; margin-bottom: 32px;">
          <a href="${verifyUrl}" style="display: inline-block; background: #7747ff; color: white; font-size: 15px; font-weight: 500; text-decoration: none; padding: 10px 24px; border-radius: 4px;">
            Verify email address
          </a>
        </div>
        <p style="color: #585858; font-size: 13px; line-height: 1.5; text-align: center;">
          This link expires in ${TOKEN_EXPIRY_HOURS} hours. If you didn't create a SmartChiro account, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e9e9e9; margin: 32px 0;" />
        <p style="color: #585858; font-size: 13px; text-align: center;">
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

// ─── Welcome ───

const WELCOME_STEPS = [
  ['Set up your clinic', 'Add your branch: address, opening hours and the doctors who work there.'],
  ['Add your patients', 'Profiles, medical history, visits and SOAP notes in one place.'],
  ['Upload and annotate X-rays', 'Measure on the film, and try AI pelvis analysis on an AP pelvis X-ray.'],
  ['Book appointments', 'Calendar, online booking and WhatsApp or email reminders.'],
] as const

/**
 * Sent once, when an account becomes verified: after the email link for
 * password sign-ups, straight away for Google sign-ups. Callers treat it as
 * best effort (a failed send never blocks sign-up).
 */
export async function sendWelcomeEmail(user: { email: string; name: string | null; trialEndsAt: Date | null }) {
  const name = user.name?.trim() || 'there'
  const trialEnd = user.trialEndsAt ? clinicDateLabel(user.trialEndsAt) : null
  const trialLine = trialEnd
    ? `Your ${TRIAL_DAYS}-day free trial has started: every feature is yours until ${trialEnd}. No card needed.`
    : 'Your account is ready.'
  const priceLine = `After the trial, SmartChiro Pro is RM ${PLANS.month.amount.toLocaleString('en-MY')} a month or RM ${PLANS.year.amount.toLocaleString('en-MY')} a year.`
  const dashboardUrl = `${APP_URL}/dashboard`

  const { error } = await resend().emails.send({
    from: 'SmartChiro <noreply@smartchiro.org>',
    to: user.email,
    subject: 'Welcome to SmartChiro',
    text: [
      `Hi ${name},`,
      '',
      `Welcome to SmartChiro. ${trialLine}`,
      '',
      'Getting started:',
      ...WELCOME_STEPS.map(([title, body], i) => `${i + 1}. ${title}: ${body}`),
      '',
      `Open SmartChiro: ${dashboardUrl}`,
      '',
      priceLine,
      '',
      'SmartChiro — See More. Treat Better.',
    ].join('\n'),
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #7747ff; border-radius: 6px; padding: 8px 12px; text-align: center;">
            <span style="color: white; font-size: 14px; font-weight: bold;">Smart Chiro</span>
          </div>
        </div>
        <h1 style="color: #0b0b0b; font-size: 23px; font-weight: 600; text-align: center; margin-bottom: 8px;">
          Welcome to SmartChiro, ${escapeHtml(name)}
        </h1>
        <p style="color: #0b0b0b; font-size: 15px; line-height: 1.5; text-align: center; margin-bottom: 28px;">
          ${escapeHtml(trialLine)}
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; margin-bottom: 28px;">
          ${WELCOME_STEPS.map(
            ([title, body], i) => `
          <tr>
            <td style="vertical-align: top; width: 32px; padding: 6px 0;">
              <div style="width: 24px; height: 24px; border-radius: 12px; background: #f1ecff; color: #7747ff; font-size: 13px; font-weight: 600; text-align: center; line-height: 24px;">${i + 1}</div>
            </td>
            <td style="padding: 6px 0;">
              <div style="color: #0b0b0b; font-size: 15px; font-weight: 600;">${title}</div>
              <div style="color: #585858; font-size: 14px; line-height: 1.45;">${body}</div>
            </td>
          </tr>`,
          ).join('')}
        </table>
        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${dashboardUrl}" style="display: inline-block; background: #0b0b0b; color: white; font-size: 15px; font-weight: 500; text-decoration: none; padding: 10px 24px; border-radius: 999px;">
            Open SmartChiro
          </a>
        </div>
        <p style="color: #585858; font-size: 13px; line-height: 1.5; text-align: center;">
          ${escapeHtml(priceLine)}
        </p>
        <hr style="border: none; border-top: 1px solid #e9e9e9; margin: 32px 0;" />
        <p style="color: #585858; font-size: 13px; text-align: center;">
          SmartChiro — See More. Treat Better.
        </p>
      </div>
    `,
  })

  if (error) {
    throw new Error(`Failed to send welcome email: ${error.message}`)
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

  const { error } = await resend().emails.send({
    from: 'SmartChiro <noreply@smartchiro.org>',
    to: email,
    subject: 'Reset your SmartChiro password',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #7747ff; border-radius: 6px; padding: 8px 12px; text-align: center;">
            <span style="color: white; font-size: 14px; font-weight: bold;">Smart Chiro</span>
          </div>
        </div>
        <h1 style="color: #0b0b0b; font-size: 23px; font-weight: 600; text-align: center; margin-bottom: 8px;">
          Reset your password
        </h1>
        <p style="color: #0b0b0b; font-size: 15px; line-height: 1.5; text-align: center; margin-bottom: 32px;">
          Hi ${escapeHtml(name)}, we received a request to reset your SmartChiro password. Click the button below to choose a new one. If you didn't request this, you can safely ignore this email — your password won't change.
        </p>
        <div style="text-align: center; margin-bottom: 32px;">
          <a href="${resetUrl}" style="display: inline-block; background: #7747ff; color: white; font-size: 15px; font-weight: 500; text-decoration: none; padding: 10px 24px; border-radius: 4px;">
            Reset password
          </a>
        </div>
        <p style="color: #585858; font-size: 13px; line-height: 1.5; text-align: center;">
          This link expires in ${PASSWORD_RESET_EXPIRY_HOURS} hour. If you didn't request a reset, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e9e9e9; margin: 32px 0;" />
        <p style="color: #585858; font-size: 13px; text-align: center;">
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

/** "You've been invited to join <branch>" — fail-soft, skipped without RESEND_API_KEY. */
export async function sendBranchInviteEmail(args: {
  to: string
  name: string | null
  branchName: string
  inviterName: string | null
  role: string
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) return
  const role = { OWNER: 'owner', ADMIN: 'admin', DOCTOR: 'doctor', FRONT_DESK: 'front desk' }[args.role] ?? args.role.toLowerCase()
  const who = args.inviterName ? `${args.inviterName} has` : 'You have been'
  const lead = args.inviterName
    ? `${escapeHtml(args.inviterName)} has invited you to join <strong>${escapeHtml(args.branchName)}</strong> as ${role}.`
    : `You have been invited to join <strong>${escapeHtml(args.branchName)}</strong> as ${role}.`
  const url = `${APP_URL}/dashboard`
  try {
    await resend().emails.send({
      from: 'SmartChiro <noreply@smartchiro.org>',
      to: args.to,
      subject: `Invitation to join ${args.branchName} on SmartChiro`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px; color: #0b0b0b;">
          <p style="margin: 0 0 16px; font-size: 15px;">Hi${args.name ? ` ${escapeHtml(args.name.split(' ')[0])}` : ''},</p>
          <p style="margin: 0 0 16px; font-size: 15px;">${lead}</p>
          <p style="margin: 0 0 16px; font-size: 15px;">Sign in to SmartChiro to accept or decline. Nothing changes until you accept.</p>
          <p style="margin: 24px 0 0;">
            <a href="${url}" style="background: #7747ff; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: 500; font-size: 14px;">Open SmartChiro</a>
          </p>
          <p style="margin: 32px 0 0; font-size: 12px; color: #7d7d7d;">If you don't know this clinic, decline the invitation or ignore this email.</p>
        </div>
      `,
      text: `${who} invited you to join ${args.branchName} as ${role}.\n\nSign in to SmartChiro to accept or decline: ${url}\n\nNothing changes until you accept.`,
    })
  } catch (e) {
    console.error('branch invite email failed', { to: args.to, error: e })
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
    // The server runs in UTC — without this an 8:00 AM booking read "12:00 am".
    timeZone: CLINIC_TIME_ZONE,
  })
  const greetingName = args.doctorName ? args.doctorName.split(' ')[0] : null
  const greeting = greetingName ? `Hi ${escapeHtml(greetingName)},` : 'Hi,'
  const patientNameSafe = escapeHtml(args.patientName)
  const branchNameSafe = escapeHtml(args.branchName)
  const treatmentLine = args.treatmentLabel
    ? `<p style="margin: 6px 0; color: #585858;"><strong>Treatment:</strong> ${escapeHtml(args.treatmentLabel)}</p>`
    : ''
  const bookedByLine = args.bookedByName
    ? `<p style="margin: 6px 0; color: #7d7d7d; font-size: 13px;">Booked by ${escapeHtml(args.bookedByName)}</p>`
    : ''
  try {
    await resend().emails.send({
      from: 'SmartChiro <noreply@smartchiro.org>',
      to: args.to,
      subject: `New appointment with ${args.patientName} — ${dateStr}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px; color: #0b0b0b;">
          <p style="margin: 0 0 16px; font-size: 15px;">${greeting}</p>
          <p style="margin: 0 0 16px; font-size: 15px;">A new appointment has just been booked on your calendar.</p>
          <div style="background: #f8f8f8; border: 1px solid #e9e9e9; border-radius: 6px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0 0 8px; font-size: 17px; font-weight: 600;">${patientNameSafe}</p>
            <p style="margin: 6px 0; color: #585858;"><strong>When:</strong> ${dateStr} (${args.duration} min)</p>
            <p style="margin: 6px 0; color: #585858;"><strong>Branch:</strong> ${branchNameSafe}</p>
            ${treatmentLine}
            ${bookedByLine}
          </div>
          <p style="margin: 24px 0 0;">
            <a href="${args.appointmentUrl}" style="background: #7747ff; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-weight: 500; font-size: 14px;">View appointment</a>
          </p>
          <p style="margin: 32px 0 0; font-size: 12px; color: #7d7d7d;">SmartChiro · Appointment notification</p>
        </div>
      `,
      text: `${greetingName ? `Hi ${greetingName},` : 'Hi,'}\n\nA new appointment has been booked.\n\nPatient: ${args.patientName}\nWhen: ${dateStr} (${args.duration} min)\nBranch: ${args.branchName}${args.treatmentLabel ? `\nTreatment: ${args.treatmentLabel}` : ''}${args.bookedByName ? `\nBooked by: ${args.bookedByName}` : ''}\n\nView: ${args.appointmentUrl}`,
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
  /** Where patient replies go (the branch's email). */
  replyTo?: string | null
  headers?: Record<string, string>
}): Promise<ReminderEmailResult> {
  try {
    const r = await resend().emails.send({
      from: args.from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      ...(args.headers ? { headers: args.headers } : {}),
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
