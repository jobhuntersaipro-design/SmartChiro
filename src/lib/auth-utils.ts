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

export async function getUserClinicRole(userId: string, clinicId: string) {
  const membership = await prisma.clinicMember.findUnique({
    where: {
      userId_clinicId: { userId, clinicId },
    },
  })
  return membership?.role ?? null
}
