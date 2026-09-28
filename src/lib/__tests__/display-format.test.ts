import { describe, it, expect } from 'vitest'
import { displayDoctorName, plural, todayProgressLabel } from '@/lib/format'

describe('displayDoctorName', () => {
  it('adds the title to a bare name', () => {
    expect(displayDoctorName('Suresh Menon')).toBe('Dr. Suresh Menon')
  })

  it('never doubles a stored title', () => {
    expect(displayDoctorName('Dr. Suresh Menon')).toBe('Dr. Suresh Menon')
    expect(displayDoctorName('Dr Suresh Menon')).toBe('Dr. Suresh Menon')
    expect(displayDoctorName('dr. suresh')).toBe('Dr. suresh')
    expect(displayDoctorName('DR.Suresh')).toBe('Dr. Suresh')
    expect(displayDoctorName('Dr. Dr. Suresh Menon')).toBe('Dr. Suresh Menon')
  })

  it('keeps names that merely start with the letters "dr"', () => {
    expect(displayDoctorName('Drake Lim')).toBe('Dr. Drake Lim')
    expect(displayDoctorName('Drew')).toBe('Dr. Drew')
  })

  it('trims whitespace', () => {
    expect(displayDoctorName('  Dr.  Lee Mei Han  ')).toBe('Dr. Lee Mei Han')
  })

  it('falls back when there is no name', () => {
    expect(displayDoctorName(null)).toBe('Unknown doctor')
    expect(displayDoctorName('')).toBe('Unknown doctor')
    expect(displayDoctorName('Dr.')).toBe('Unknown doctor')
    expect(displayDoctorName(undefined, '—')).toBe('—')
  })
})

describe('todayProgressLabel', () => {
  it('never says "All wrapped up" for an empty day', () => {
    expect(todayProgressLabel(0, 0)).toBe('Nothing booked today')
  })

  it('says "All wrapped up" only when something was booked and none remain', () => {
    expect(todayProgressLabel(1, 0)).toBe('All wrapped up')
    expect(todayProgressLabel(1, 1)).toBe('1 remaining')
    expect(todayProgressLabel(5, 2)).toBe('2 remaining')
  })
})

describe('plural', () => {
  it('uses the singular only for exactly one', () => {
    expect(plural(1, 'appointment')).toBe('1 appointment')
    expect(plural(0, 'appointment')).toBe('0 appointments')
    expect(plural(3, 'appointment')).toBe('3 appointments')
  })

  it('accepts an irregular plural', () => {
    expect(plural(2, 'patient', 'patients')).toBe('2 patients')
    expect(plural(2, 'person', 'people')).toBe('2 people')
    expect(plural(1, 'person', 'people')).toBe('1 person')
  })
})
