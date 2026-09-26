import { describe, expect, it } from 'vitest'
import { hasSessionUser } from '../has-session-user'

describe('hasSessionUser', () => {
  it('rejects a missing session and an Auth.js config error', () => {
    expect(hasSessionUser(null)).toBe(false)
    expect(hasSessionUser(undefined)).toBe(false)
    expect(hasSessionUser({})).toBe(false)
    expect(
      hasSessionUser({
        message: 'There was a problem with the server configuration.',
      }),
    ).toBe(false)
  })

  it('accepts a session that has a user', () => {
    expect(hasSessionUser({ user: { id: 'user_1', email: 'chris@example.com' } })).toBe(
      true,
    )
  })
})
