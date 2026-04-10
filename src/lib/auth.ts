import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import type { BranchRole } from '@prisma/client'
import authConfig from './auth.config'

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
    async signIn({ user, account, profile }) {
      // For OAuth (Google), create or link user + set active branch
      if (account?.provider === 'google' && profile?.email) {
        let dbUser = await prisma.user.findUnique({
          where: { email: profile.email },
        })

        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: {
              email: profile.email,
              name: profile.name ?? null,
              image: (profile as Record<string, unknown>).picture as string ?? null,
              emailVerified: new Date(),
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
