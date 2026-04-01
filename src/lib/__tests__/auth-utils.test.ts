import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock auth
const mockAuth = vi.fn()

vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}))

// Mock Prisma
const mockFindUnique = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clinicMember: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}))

// Mock next/navigation
const mockRedirect = vi.fn()

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args)
    throw new Error('NEXT_REDIRECT')
  },
}))

describe('auth-utils', () => {
  let getCurrentUser: typeof import('../auth-utils').getCurrentUser
  let requireAuth: typeof import('../auth-utils').requireAuth
  let getUserClinicRole: typeof import('../auth-utils').getUserClinicRole

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../auth-utils')
    getCurrentUser = mod.getCurrentUser
    requireAuth = mod.requireAuth
    getUserClinicRole = mod.getUserClinicRole
  })

  describe('getCurrentUser', () => {
    it('returns user when session exists', async () => {
      const user = { id: 'u1', name: 'Dr. Test', email: 'test@example.com' }
      mockAuth.mockResolvedValue({ user })

      const result = await getCurrentUser()
      expect(result).toEqual(user)
    })

    it('returns null when no session', async () => {
      mockAuth.mockResolvedValue(null)

      const result = await getCurrentUser()
      expect(result).toBeNull()
    })

    it('returns null when session has no user', async () => {
      mockAuth.mockResolvedValue({ user: undefined })

      const result = await getCurrentUser()
      expect(result).toBeNull()
    })
  })

  describe('requireAuth', () => {
    it('returns user when authenticated', async () => {
      const user = { id: 'u1', name: 'Dr. Test' }
      mockAuth.mockResolvedValue({ user })

      const result = await requireAuth()
      expect(result).toEqual(user)
      expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('redirects to /login when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      await expect(requireAuth()).rejects.toThrow('NEXT_REDIRECT')
      expect(mockRedirect).toHaveBeenCalledWith('/login')
    })
  })

  describe('getUserClinicRole', () => {
    it('returns role when membership exists', async () => {
      mockFindUnique.mockResolvedValue({ role: 'OWNER' })

      const result = await getUserClinicRole('u1', 'c1')
      expect(result).toBe('OWNER')
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { userId_clinicId: { userId: 'u1', clinicId: 'c1' } },
      })
    })

    it('returns null when no membership', async () => {
      mockFindUnique.mockResolvedValue(null)

      const result = await getUserClinicRole('u1', 'c1')
      expect(result).toBeNull()
    })
  })
})
