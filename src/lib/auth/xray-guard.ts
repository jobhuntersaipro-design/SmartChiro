import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canManagePatientXrays, canManageXray } from '@/lib/auth/xray'

type Guard = { userId: string; error?: undefined } | { userId?: undefined; error: NextResponse }

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
// 404 rather than 403 so ids can't be probed for existence.
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

/** Route guard: signed in and allowed to manage every listed X-ray. */
export async function requireXrayAccess(...xrayIds: string[]): Promise<Guard> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: unauthorized() }
  for (const id of xrayIds) {
    if (!(await canManageXray(userId, id))) return { error: notFound() }
  }
  return { userId }
}

/** Route guard: signed in and allowed to see this patient's X-rays. */
export async function requirePatientXrayAccess(patientId: string): Promise<Guard> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { error: unauthorized() }
  if (!(await canManagePatientXrays(userId, patientId))) return { error: notFound() }
  return { userId }
}
