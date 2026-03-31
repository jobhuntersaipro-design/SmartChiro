import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import type { GlobalRole, ClinicRole } from '@prisma/client'
import authConfig from './auth.config'

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
        loginRole: { label: 'Login Role', type: 'text' },
      },
      async authorize(credentials) {
        const email = credentials.email as string
        const password = credentials.password as string
        const loginRole = credentials.loginRole as string

        if (!email || !password) return null

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            clinicMemberships: {
              include: { clinic: true },
            },
          },
        })

        if (!user || !user.password) return null

        const isValid = await compare(password, user.password)
        if (!isValid) return null

        // Validate clinic membership based on selected login role
        if (loginRole === 'owner') {
          const ownerMembership = user.clinicMemberships.find(
            (m) => m.role === 'OWNER'
          )
          if (!ownerMembership) return null

          // Set active clinic
          await prisma.user.update({
            where: { id: user.id },
            data: { activeClinicId: ownerMembership.clinicId },
          })

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role,
            clinicRole: 'OWNER' as const,
            activeClinicId: ownerMembership.clinicId,
          }
        } else {
          // Staff: DOCTOR, ADMIN, or VIEWER
          const staffMembership = user.clinicMemberships.find(
            (m) => m.role !== 'OWNER'
          )
          if (!staffMembership) return null

          await prisma.user.update({
            where: { id: user.id },
            data: { activeClinicId: staffMembership.clinicId },
          })

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role,
            clinicRole: staffMembership.role,
            activeClinicId: staffMembership.clinicId,
          }
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        const u = user as unknown as {
          role: GlobalRole
          clinicRole: ClinicRole | null
          activeClinicId: string | null
        }
        token.role = u.role
        token.clinicRole = u.clinicRole ?? null
        token.activeClinicId = u.activeClinicId ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as GlobalRole
        session.user.clinicRole = token.clinicRole as ClinicRole | null
        session.user.activeClinicId = token.activeClinicId as string | null
      }
      return session
    },
    async signIn({ user, account, profile }) {
      // For OAuth (Google), create or link user + set active clinic
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

        // Set active clinic
        const membership = await prisma.clinicMember.findFirst({
          where: { userId: dbUser.id },
        })
        if (membership) {
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { activeClinicId: membership.clinicId },
          })
        }

        // Attach DB user id so JWT callback can use it
        user.id = dbUser.id
      }
      return true
    },
  },
})
