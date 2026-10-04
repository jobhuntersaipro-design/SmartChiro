import type { User } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sendWelcomeEmail } from '@/lib/email'

export interface GoogleProfile {
  email: string
  name?: string | null
  picture?: string | null
}

export interface GoogleAccount {
  type: string
  provider: string
  providerAccountId: string
  access_token?: string | null
  refresh_token?: string | null
  expires_at?: number | null
  token_type?: string | null
  scope?: string | null
  id_token?: string | null
}

/**
 * Sign up or sign in with a Google account whose email Google has verified
 * (the caller checks `email_verified`). New users start verified, with the
 * default 30-day trial. An existing account that never verified its email is
 * marked verified and loses its password: whoever set that password never
 * proved they own the address, so it can't be allowed to sign in alongside
 * the real owner. A verified account just gets Google linked; one whose
 * password an owner typed when creating it loses that password too (the owner
 * knows it). Accounts
 * that become verified here get the welcome email.
 */
export async function resolveGoogleUser(profile: GoogleProfile, account: GoogleAccount): Promise<User> {
  // Registration stores emails in lowercase.
  const email = profile.email.toLowerCase()
  let user = await prisma.user.findUnique({ where: { email } })
  const welcome = !user?.emailVerified

  if (!user) {
    user = await prisma.user.create({
      data: { email, name: profile.name ?? null, image: profile.picture ?? null, emailVerified: new Date() },
    })
  } else if (!user.emailVerified) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date(), password: null, image: user.image ?? profile.picture ?? null },
    })
  } else if (user.passwordSetByOther) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { password: null, passwordSetByOther: false, passwordChangedAt: new Date() },
    })
  }

  await prisma.account.upsert({
    where: {
      provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId },
    },
    update: {},
    create: {
      userId: user.id,
      type: account.type,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      access_token: account.access_token,
      refresh_token: account.refresh_token,
      expires_at: account.expires_at,
      token_type: account.token_type,
      scope: account.scope,
      id_token: account.id_token,
    },
  })

  if (welcome) {
    await sendWelcomeEmail(user).catch((err) => console.error('[auth] welcome email failed:', err))
  }
  return user
}
