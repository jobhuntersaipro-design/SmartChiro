import { describe, it, expect, vi, afterEach } from 'vitest'

import {
  formatDobWithAge,
  buildWhatsAppUrl,
  buildMailtoUrl,
  buildMapsUrl,
  buildDoctorHref,
  buildBranchHref,
} from '@/lib/format'

afterEach(() => {
  vi.useRealTimers()
})

describe('formatDobWithAge', () => {
  it('returns DD-MM-YYYY with age for a valid ISO date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T12:00:00.000Z'))
    // born 15 May 1990 → 35 years old on 2026-04-21 is still 35 (not 36 until May 15)
    expect(formatDobWithAge('1990-05-15T00:00:00.000Z')).toBe('15-05-1990 (35)')
  })

  it('zero-pads single-digit day and month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T12:00:00.000Z'))
    expect(formatDobWithAge('2000-01-05T00:00:00.000Z')).toMatch(/^05-01-2000 \(\d+\)$/)
  })

  it('returns null for null, undefined, and empty string', () => {
    expect(formatDobWithAge(null)).toBeNull()
    expect(formatDobWithAge(undefined)).toBeNull()
    expect(formatDobWithAge('')).toBeNull()
  })

  it('computes age as years-1 when current date is before this year\'s birthday', () => {
    vi.useFakeTimers()
    // today = 2026-04-21, DOB = 1995-06-15 → not yet 31 (still 30)
    vi.setSystemTime(new Date('2026-04-21T00:00:00.000Z'))
    expect(formatDobWithAge('1995-06-15T00:00:00.000Z')).toBe('15-06-1995 (30)')
  })

  it('returns null for unparseable input', () => {
    expect(formatDobWithAge('not-a-date')).toBeNull()
  })
})

describe('buildWhatsAppUrl', () => {
  it('strips +, spaces, and dashes from a MY number with country code', () => {
    expect(buildWhatsAppUrl('+60 12-345 6789')).toBe('https://wa.me/60123456789')
  })

  it('converts a local MY number with leading 0 to 60 prefix', () => {
    expect(buildWhatsAppUrl('012-345 6789')).toBe('https://wa.me/60123456789')
  })

  it('preserves a number already in 60XXXXXXXXX format', () => {
    expect(buildWhatsAppUrl('60123456789')).toBe('https://wa.me/60123456789')
  })

  it('returns null when the number has fewer than 7 digits', () => {
    expect(buildWhatsAppUrl('123')).toBeNull()
  })

  it('returns null for null, undefined, and empty string', () => {
    expect(buildWhatsAppUrl(null)).toBeNull()
    expect(buildWhatsAppUrl(undefined)).toBeNull()
    expect(buildWhatsAppUrl('')).toBeNull()
  })
})

describe('buildMailtoUrl', () => {
  it('returns mailto: URL for a valid email', () => {
    expect(buildMailtoUrl('patient@example.com')).toBe('mailto:patient@example.com')
  })

  it('returns null for an invalid email', () => {
    expect(buildMailtoUrl('not-an-email')).toBeNull()
  })

  it('returns null for null, undefined, and empty string', () => {
    expect(buildMailtoUrl(null)).toBeNull()
    expect(buildMailtoUrl(undefined)).toBeNull()
    expect(buildMailtoUrl('')).toBeNull()
  })
})

describe('buildMapsUrl', () => {
  it('URL-encodes the address in the query param', () => {
    const url = buildMapsUrl('123 Jalan Ampang, Kuala Lumpur')
    expect(url).toContain('https://www.google.com/maps/search/?api=1&query=')
    expect(url).toContain('123%20Jalan%20Ampang%2C%20Kuala%20Lumpur')
  })

  it('returns null for empty string and null input', () => {
    expect(buildMapsUrl('')).toBeNull()
    expect(buildMapsUrl(null)).toBeNull()
    expect(buildMapsUrl(undefined)).toBeNull()
  })
})

describe('buildDoctorHref', () => {
  it('returns the internal dashboard doctor path', () => {
    expect(buildDoctorHref('u123')).toBe('/dashboard/doctors/u123')
  })
})

describe('buildBranchHref', () => {
  it('returns the internal dashboard branch path', () => {
    expect(buildBranchHref('b123')).toBe('/dashboard/branches/b123')
  })
})
