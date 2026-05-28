import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import type { BranchRole } from '@prisma/client'
import authConfig from './auth.config'
import { sendVerificationEmail } from './email'

class EmailNotVerifiedError extends CredentialsSignin {
  code = 'email_not_verified'
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    // Keep non-Credentials providers from config (Google OAuth, etc.)
    ...authConfig.providers.filter(
      (p) => (p as { type?: string }).type !== 'credentials'
    ),
    // Override Credentials with actual bcrypt validation
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          const email = credentials.email as string
          const password = credentials.password as string

          if (!email || !password) return null

          const user = await prisma.user.findUnique({
            where: { email },
            include: {
              branchMemberships: {
                include: { branch: true },
              },
            },
          })

          if (!user || !user.password) return null

          const isValid = await compare(password, user.password)
          if (!isValid) return null

          // Block unverified users
          if (!user.emailVerified) {
            throw new EmailNotVerifiedError()
          }

          // Find branch membership — pick first available
          let branchRole: string | null = null
          let activeBranchId: string | null = null

          const firstMembership = user.branchMemberships[0]
          if (firstMembership) {
            branchRole = firstMembership.role
            activeBranchId = firstMembership.branchId
          }

          // Set active branch if user has a membership
          if (activeBranchId) {
            await prisma.user.update({
              where: { id: user.id },
              data: { activeBranchId },
            })
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            branchRole,
            activeBranchId,
          }
        } catch (error) {
          console.error('[AUTH] authorize error:', error)
          throw error
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        const u = user as unknown as {
          branchRole: BranchRole | null
          activeBranchId: string | null
        }
        token.branchRole = u.branchRole ?? null
        token.activeBranchId = u.activeBranchId ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.branchRole = token.branchRole as BranchRole | null
        session.user.activeBranchId = token.activeBranchId as string | null
      }
      return session
    },
    async signIn({ user, account, profile, credentials }) {
      console.log('[AUTH] signIn callback:', { provider: account?.provider, userId: user?.id, hasCredentials: !!credentials })
      // For OAuth (Google), create or link user + require email verification
      if (account?.provider === 'google' && profile?.email) {
        // Refuse sign-in if Google itself didn't verify the email. Without
        // this, an attacker with a Workspace config that hasn't confirmed the
        // address could link to the victim's SmartChiro account via the email
        // match below.
        const emailVerifiedByGoogle = (profile as { email_verified?: boolean }).email_verified
        if (!emailVerifiedByGoogle) {
          console.warn('[AUTH] rejecting Google sign-in: email_verified is false', profile.email)
          return false
        }

        let dbUser = await prisma.user.findUnique({
          where: { email: profile.email },
        })

        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              email: profile.email,
              name: profile.name ?? null,
              image: (profile as Record<string, unknown>).picture as string ?? null,
            },
          })
        }

        // Link OAuth account if not already linked
        const existingAccount = await prisma.account.findUnique({
          where: {
            provider_providerAccountId: {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          },
        })

        if (!existingAccount) {
          await prisma.account.create({
            data: {
              userId: dbUser.id,
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
        }

        // Block unverified users and send verification email — but throttle
        // so repeated sign-in attempts can't be used to bomb the inbox.
        // Tokens have a 24h expiry, so a token that expires more than
        // 23h55m from now was created within the last 5 minutes.
        if (!dbUser.emailVerified) {
          const FRESH_TOKEN_WINDOW_MS = 5 * 60 * 1000
          const TOKEN_TTL_MS = 24 * 60 * 60 * 1000
          const recentToken = await prisma.verificationToken.findFirst({
            where: {
              identifier: dbUser.email,
              expires: { gt: new Date(Date.now() + TOKEN_TTL_MS - FRESH_TOKEN_WINDOW_MS) },
            },
          })
          if (!recentToken) {
            try {
              await sendVerificationEmail(dbUser.email, dbUser.name ?? 'there')
            } catch (e) {
              console.error('Failed to send verification email for Google user:', e)
            }
          }
          return '/verify-email'
        }

        // Set active branch
        const membership = await prisma.branchMember.findFirst({
          where: { userId: dbUser.id },
        })
        if (membership) {
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { activeBranchId: membership.branchId },
          })
        }

        // Attach DB user id so JWT callback can use it
        user.id = dbUser.id
      }
      return true
    },
  },
})
