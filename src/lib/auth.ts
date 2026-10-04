import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import type { BranchRole } from '@prisma/client'
import authConfig from './auth.config'
import { resolveGoogleUser } from './auth/google'
import { loadBranchContext } from './branch-context'
import { cache } from 'react'
import { recordSignIn } from './login-activity'

const accountStatus = cache((userId: string) =>
  prisma.user.findUnique({ where: { id: userId }, select: { disabledAt: true } }),
)

class EmailNotVerifiedError extends CredentialsSignin {
  code = 'email_not_verified'
}

class AccountDisabledError extends CredentialsSignin {
  code = 'account_disabled'
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
          const rawEmail = credentials.email as string
          const password = credentials.password as string

          if (!rawEmail || !password) return null
          // Registration stores emails in lowercase. Match that here so
          // Jobhunters... and jobhunters... are the same account.
          const email = rawEmail.toLowerCase()

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

          // Turned off by a super admin.
          if (user.disabledAt) {
            throw new AccountDisabledError()
          }

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
        // A super admin can disable an account that is signed in, and accounts
        // can be deleted: drop the user so every auth() check fails.
        const account = await accountStatus(session.user.id)
        if (!account || account.disabledAt) {
          return {
            ...session,
            user: undefined,
            error: account ? 'account_disabled' : 'account_missing',
          } as unknown as typeof session
        }
        // Role and active branch come from the database, not the token
        // (see loadBranchContext) — so they're current after creating or
        // switching a branch, and set for Google sign-ins too.
        const context = await loadBranchContext(session.user.id)
        session.user.branchRole = context.branchRole
        session.user.activeBranchId = context.activeBranchId
      }
      return session
    },
    async signIn({ user, account, profile, credentials }) {
      console.log('[AUTH] signIn callback:', { provider: account?.provider, userId: user?.id, hasCredentials: !!credentials })
      // Google: sign up (new account, already verified by Google) or sign in.
      if (account?.provider === 'google' && profile?.email) {
        // Refuse sign-in if Google itself didn't verify the email. Without
        // this, an attacker with a Workspace config that hasn't confirmed the
        // address could take over the victim's SmartChiro account, which
        // resolveGoogleUser finds by email.
        const emailVerifiedByGoogle = (profile as { email_verified?: boolean }).email_verified
        if (!emailVerifiedByGoogle) {
          console.warn('[AUTH] rejecting Google sign-in: email_verified is false', profile.email)
          return false
        }

        const dbUser = await resolveGoogleUser(
          {
            email: profile.email,
            name: profile.name ?? null,
            picture: ((profile as Record<string, unknown>).picture as string | undefined) ?? null,
          },
          account,
        )

        if (dbUser.disabledAt) {
          return '/login?error=account_disabled'
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
  events: {
    async signIn({ user }) {
      await recordSignIn(user)
    },
  },
})
