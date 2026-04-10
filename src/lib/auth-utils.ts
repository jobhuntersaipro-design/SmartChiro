import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function getCurrentUser() {
  const session = await auth()
  return session?.user ?? null
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function getUserBranchRole(userId: string, branchId: string) {
  const membership = await prisma.branchMember.findUnique({
    where: {
      userId_branchId: { userId, branchId },
    },
  })
  return membership?.role ?? null
}
