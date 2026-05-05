import { describe, it, expect } from 'vitest'
import {
  branchToFormData,
  computePatchPayload,
  parseOperatingHoursJson,
  type EditBranchFormData,
} from '@/components/dashboard/branches/edit-branch-form'
import {
  formatFieldName,
  formatFieldValue,
  actionStyle,
} from '@/components/dashboard/branches/audit-log-format'
import type { BranchAuditEntry } from '@/types/branch'

// ─── EditBranchDialog helpers ───

describe('branchToFormData', () => {
  it('maps a full branch to form data, converting nulls to empty strings', () => {
    const data = branchToFormData({
      id: 'b1',
      name: 'KLCC',
      address: null,
      city: 'KL',
      state: null,
      zip: null,
      phone: '+60123',
      email: null,
      website: null,
      operatingHours: null,
      treatmentRooms: null,
      ownerName: 'Dr Lam',
      licenseNumber: null,
      specialties: null,
      insuranceProviders: null,
      billingContactName: null,
      billingContactEmail: null,
      billingContactPhone: null,
    })
    expect(data.name).toBe('KLCC')
    expect(data.address).toBe('')
    expect(data.city).toBe('KL')
    expect(data.phone).toBe('+60123')
    expect(data.email).toBe('')
    expect(data.treatmentRooms).toBeNull()
  })

  it('preserves an integer treatmentRooms value', () => {
    const data = branchToFormData({
      id: 'b1', name: 'X', address: null, city: null, state: null, zip: null,
      phone: null, email: null, website: null, operatingHours: null,
      treatmentRooms: 4, ownerName: null, licenseNumber: null, specialties: null,
      insuranceProviders: null, billingContactName: null,
      billingContactEmail: null, billingContactPhone: null,
    })
    expect(data.treatmentRooms).toBe(4)
  })
})

describe('computePatchPayload', () => {
  function blank(): EditBranchFormData {
    return {
      name: 'KLCC',
      address: '1 Jalan',
      city: 'KL',
      state: 'WP',
      zip: '50450',
      phone: '+60123',
      email: 'a@b.com',
      website: '',
      operatingHours: '',
      treatmentRooms: 4,
      billingContactName: '',
      billingContactEmail: '',
      billingContactPhone: '',
    }
  }

  it('returns an empty object when nothing changed', () => {
    const initial = blank()
    const current = blank()
    expect(computePatchPayload(initial, current)).toEqual({})
  })

  it('returns only the changed string fields', () => {
    const initial = blank()
    const current = { ...initial, phone: '+60999', email: 'new@b.com' }
    const payload = computePatchPayload(initial, current)
    expect(payload).toEqual({ phone: '+60999', email: 'new@b.com' })
  })

  it('treats empty-string → empty-string as no change', () => {
    const initial: EditBranchFormData = { ...blank(), website: '' }
    const current: EditBranchFormData = { ...blank(), website: '' }
    expect(computePatchPayload(initial, current)).toEqual({})
  })

  it('treats empty-string → "https://..." as a change', () => {
    const initial: EditBranchFormData = { ...blank(), website: '' }
    const current: EditBranchFormData = { ...blank(), website: 'https://x.com' }
    expect(computePatchPayload(initial, current)).toEqual({ website: 'https://x.com' })
  })

  it('detects integer changes on treatmentRooms', () => {
    const initial = blank()
    const current = { ...initial, treatmentRooms: 6 }
    expect(computePatchPayload(initial, current)).toEqual({ treatmentRooms: 6 })
  })

  it('detects null → integer on treatmentRooms', () => {
    const initial: EditBranchFormData = { ...blank(), treatmentRooms: null }
    const current: EditBranchFormData = { ...blank(), treatmentRooms: 4 }
    expect(computePatchPayload(initial, current)).toEqual({ treatmentRooms: 4 })
  })
})

describe('parseOperatingHoursJson', () => {
  it('returns an empty map when input is null', () => {
    expect(parseOperatingHoursJson(null)).toEqual({})
  })

  it('parses valid JSON', () => {
    const json = JSON.stringify({ mon: { open: '09:00', close: '18:00' } })
    expect(parseOperatingHoursJson(json)).toEqual({
      mon: { open: '09:00', close: '18:00' },
    })
  })

  it('returns an empty map for malformed JSON (legacy free-text)', () => {
    expect(parseOperatingHoursJson('Mon-Fri 9-6')).toEqual({})
  })
})

// ─── BranchActivityLog helpers ───

describe('formatFieldName', () => {
  it('converts camelCase to Title Case', () => {
    expect(formatFieldName('billingContactEmail')).toBe('Billing Contact Email')
    expect(formatFieldName('phone')).toBe('Phone')
    expect(formatFieldName('operatingHours')).toBe('Operating Hours')
  })

  it('handles single-word fields', () => {
    expect(formatFieldName('name')).toBe('Name')
  })
})

describe('formatFieldValue', () => {
  it('returns "(empty)" for null/undefined', () => {
    expect(formatFieldValue(null)).toBe('(empty)')
    expect(formatFieldValue(undefined)).toBe('(empty)')
  })

  it('returns "(empty)" for empty string', () => {
    expect(formatFieldValue('')).toBe('(empty)')
  })

  it('returns the value for non-empty strings/numbers', () => {
    expect(formatFieldValue('+60999')).toBe('+60999')
    expect(formatFieldValue(4)).toBe('4')
  })
})

describe('actionStyle', () => {
  it('returns green for CREATE', () => {
    const s = actionStyle('CREATE')
    expect(s.label).toBe('Created')
    expect(s.bg).toContain('green') // arbitrary green class indicator
  })

  it('returns blue/info for UPDATE', () => {
    const s = actionStyle('UPDATE')
    expect(s.label).toBe('Updated')
  })

  it('returns red/danger for DELETE', () => {
    const s = actionStyle('DELETE')
    expect(s.label).toBe('Deleted')
  })
})

// ─── BranchAuditEntry type sanity ───

describe('BranchAuditEntry', () => {
  it('accepts the three valid action shapes', () => {
    const create: BranchAuditEntry = {
      id: '1',
      action: 'CREATE',
      actorId: 'u1',
      actorEmail: 'a@b.com',
      actorName: null,
      branchNameAtEvent: 'X',
      changes: { after: { name: 'X' } },
      createdAt: '2026-05-05T00:00:00Z',
    }
    const update: BranchAuditEntry = {
      ...create,
      action: 'UPDATE',
      changes: { before: { phone: null }, after: { phone: '+60' } },
    }
    const del: BranchAuditEntry = {
      ...create,
      action: 'DELETE',
      changes: { before: { name: 'X' } },
    }
    expect(create.action).toBe('CREATE')
    expect(update.action).toBe('UPDATE')
    expect(del.action).toBe('DELETE')
  })
})
