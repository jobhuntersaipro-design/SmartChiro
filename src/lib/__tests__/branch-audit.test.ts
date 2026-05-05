import { describe, it, expect } from 'vitest'
import { snapshotOf, diffSnapshots, AUDITED_BRANCH_FIELDS } from '@/lib/branch-audit'
import type { Branch } from '@prisma/client'

function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: 'branch-1',
    name: 'KLCC Clinic',
    address: '1 Jalan Ampang',
    city: 'KL',
    state: 'WP',
    zip: '50450',
    phone: '+60111111111',
    email: 'klcc@smartchiro.org',
    logo: null,
    ownerName: 'Dr Lam',
    licenseNumber: 'LIC-001',
    operatingHours: 'Mon-Fri 9am-6pm',
    treatmentRooms: 4,
    clinicType: 'solo',
    website: 'https://klcc.example',
    insuranceProviders: 'AIA, Allianz',
    specialties: 'Gonstead',
    billingContactName: 'Finance',
    billingContactEmail: 'billing@klcc.example',
    billingContactPhone: '+60122222222',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Branch
}

describe('AUDITED_BRANCH_FIELDS', () => {
  it('does NOT include id, createdAt, updatedAt, or logo', () => {
    expect(AUDITED_BRANCH_FIELDS).not.toContain('id')
    expect(AUDITED_BRANCH_FIELDS).not.toContain('createdAt')
    expect(AUDITED_BRANCH_FIELDS).not.toContain('updatedAt')
    expect(AUDITED_BRANCH_FIELDS).not.toContain('logo')
  })

  it('includes the core editable fields', () => {
    for (const f of [
      'name', 'address', 'city', 'state', 'zip', 'phone', 'email',
      'operatingHours', 'treatmentRooms',
      'billingContactName', 'billingContactEmail', 'billingContactPhone',
    ]) {
      expect(AUDITED_BRANCH_FIELDS).toContain(f)
    }
  })
})

describe('snapshotOf', () => {
  it('returns only the audited fields', () => {
    const branch = makeBranch()
    const snap = snapshotOf(branch)
    expect(Object.keys(snap).sort()).toEqual([...AUDITED_BRANCH_FIELDS].sort())
  })

  it('preserves null values verbatim', () => {
    const branch = makeBranch({ phone: null, email: null })
    const snap = snapshotOf(branch)
    expect(snap.phone).toBeNull()
    expect(snap.email).toBeNull()
  })

  it('does not include id, createdAt, updatedAt, or logo', () => {
    const branch = makeBranch()
    const snap = snapshotOf(branch)
    expect(snap).not.toHaveProperty('id')
    expect(snap).not.toHaveProperty('createdAt')
    expect(snap).not.toHaveProperty('updatedAt')
    expect(snap).not.toHaveProperty('logo')
  })
})

describe('diffSnapshots', () => {
  it('returns empty before/after when nothing changed', () => {
    const before = snapshotOf(makeBranch())
    const after = snapshotOf(makeBranch())
    const diff = diffSnapshots(before, after)
    expect(diff.before).toEqual({})
    expect(diff.after).toEqual({})
  })

  it('returns only the changed fields, not the full snapshot', () => {
    const before = snapshotOf(makeBranch({ phone: '+60111111111' }))
    const after = snapshotOf(makeBranch({ phone: '+60999999999' }))
    const diff = diffSnapshots(before, after)
    expect(diff.before).toEqual({ phone: '+60111111111' })
    expect(diff.after).toEqual({ phone: '+60999999999' })
  })

  it('captures multiple field changes', () => {
    const before = snapshotOf(makeBranch({ phone: '+60111111111', email: 'old@a.com' }))
    const after = snapshotOf(makeBranch({ phone: '+60999999999', email: 'new@a.com' }))
    const diff = diffSnapshots(before, after)
    expect(diff.before).toEqual({ phone: '+60111111111', email: 'old@a.com' })
    expect(diff.after).toEqual({ phone: '+60999999999', email: 'new@a.com' })
  })

  it('treats null → string and string → null as changes', () => {
    const before = snapshotOf(makeBranch({ phone: null }))
    const after = snapshotOf(makeBranch({ phone: '+60123' }))
    const diff = diffSnapshots(before, after)
    expect(diff.before).toEqual({ phone: null })
    expect(diff.after).toEqual({ phone: '+60123' })
  })
})
