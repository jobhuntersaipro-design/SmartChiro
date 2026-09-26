import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = vi.fn()
const mockRedirect = vi.fn()

vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}))

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    mockRedirect(path)
    throw new Error('NEXT_REDIRECT')
  },
}))

vi.mock('@/components/auth/LoginForm', () => ({
  LoginForm: () => null,
}))

describe('login page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the form when Auth.js returns a config error with no user', async () => {
    mockAuth.mockResolvedValue({
      message: 'There was a problem with the server configuration.',
    })
    const { default: LoginPage } = await import('./page')

    const page = await LoginPage({ searchParams: Promise.resolve({}) })

    expect(page).toMatchObject({ type: 'div' })
  })

  it('sends a signed-in user to the dashboard', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user_1', email: 'chris@example.com' } })
    const { default: LoginPage } = await import('./page')

    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT',
    )
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard')
  })
})
