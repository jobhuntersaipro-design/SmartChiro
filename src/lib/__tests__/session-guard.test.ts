import { describe, expect, it } from 'vitest'
import { endedByPasswordChange } from '../auth/session-guard'

// G4: changing or resetting a password signs out sessions from before it.
describe('endedByPasswordChange', () => {
  const changed = new Date('2026-10-04T05:00:00Z')
  it('ends sessions signed in before the change, and tokens with no sign-in time', () => {
    expect(endedByPasswordChange(changed, changed.getTime() - 1000)).toBe(true)
    expect(endedByPasswordChange(changed, undefined)).toBe(true)
  })
  it('keeps sessions signed in after it, and accounts that never changed it', () => {
    expect(endedByPasswordChange(changed, changed.getTime() + 1000)).toBe(false)
    expect(endedByPasswordChange(null, undefined)).toBe(false)
  })
})
