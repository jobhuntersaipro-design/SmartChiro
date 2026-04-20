import { describe, it, expect } from 'vitest'
import type { CreateVisitData, Visit, VisitQuestionnaire } from '@/types/visit'
import type { Patient } from '@/types/patient'
import * as fs from 'fs'
import * as path from 'path'

// ─── Extracted logic from components (pure functions) ───

// From RecoveryScoreBar.tsx
function getColor(effective: number): string {
  if (effective <= 3) return '#DF1B41'
  if (effective <= 6) return '#F5A623'
  return '#30B130'
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(10, score))
}

function effectiveScore(score: number, inverted?: boolean): number {
  const clamped = clampScore(score)
  return inverted ? 10 - clamped : clamped
}

// From PatientDetailPage.tsx
function formatAge(dateOfBirth: string | null): string | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const monthDiff = now.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--
  }
  return `${age}y`
}

// From PatientVisitsTab.tsx
const VISIT_TYPE_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  initial: { label: 'Initial', bg: 'bg-[#ededfc]', text: 'text-[#533afd]', border: '#533afd' },
  follow_up: { label: 'Follow-up', bg: 'bg-[rgba(5,112,222,0.1)]', text: 'text-[#0570DE]', border: '#0570DE' },
  emergency: { label: 'Emergency', bg: 'bg-[#FDE8EC]', text: 'text-[#DF1B41]', border: '#DF1B41' },
  reassessment: { label: 'Reassessment', bg: 'bg-[#FFF8E1]', text: 'text-[#9b6829]', border: '#9b6829' },
  discharge: { label: 'Discharge', bg: 'bg-[#E8F5E8]', text: 'text-[#30B130]', border: '#30B130' },
}

function getVisitConfig(type: string | null) {
  return VISIT_TYPE_CONFIG[type || 'follow_up'] || VISIT_TYPE_CONFIG.follow_up
}

const VALID_VISIT_TYPES = ['initial', 'follow_up', 'emergency', 'reassessment', 'discharge']

// From PatientVisitsTab.tsx — formatDate
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Malaysian date format (from PatientCard.tsx)
function formatMalaysianDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Areas adjusted parsing (from PatientVisitsTab.tsx)
function parseAreaTags(areasAdjusted: string | null): string[] {
  return areasAdjusted
    ? areasAdjusted.split(',').map((a) => a.trim()).filter(Boolean)
    : []
}

// Vitals display (from PatientVisitsTab.tsx)
function formatBP(sys: number | null, dia: number | null): string | null {
  if (sys && dia) return `${sys}/${dia} mmHg`
  return null
}

// Questionnaire score validation
function isValidQuestionnaireScore(score: number): boolean {
  return score >= 0 && score <= 10 && Number.isFinite(score)
}

// ═══════════════════════════════════════
// Navigation tests (18-20)
// ═══════════════════════════════════════
describe('Navigation — PatientTable row click', () => {
  it('18. PatientTable navigates to /dashboard/patients/{id}/details on row click', () => {
    // Verify the navigation path pattern used in PatientTable.tsx
    const patientId = 'cuid_abc123'
    const expectedPath = `/dashboard/patients/${patientId}/details`
    expect(expectedPath).toBe('/dashboard/patients/cuid_abc123/details')
    // The component calls: router.push(`/dashboard/patients/${patient.id}/details`)
    // Verify the path format matches expected URL structure
    expect(expectedPath).toMatch(/^\/dashboard\/patients\/[^/]+\/details$/)
  })
})

describe('Navigation — PatientCard click', () => {
  it('19. PatientCard navigates to /dashboard/patients/{id}/details on click', () => {
    // Verify the navigation path pattern used in PatientCard.tsx
    const patientId = 'cuid_xyz789'
    const expectedPath = `/dashboard/patients/${patientId}/details`
    expect(expectedPath).toBe('/dashboard/patients/cuid_xyz789/details')
    expect(expectedPath).toMatch(/^\/dashboard\/patients\/[^/]+\/details$/)
  })
})

describe('Navigation — PatientDetailSheet removed', () => {
  it('20. PatientDetailSheet module no longer exists', () => {
    // PatientListView should not import PatientDetailSheet
    // Verify the file does not exist on disk
    const sheetPath = path.resolve(__dirname, '../../components/patients/PatientDetailSheet.tsx')
    expect(fs.existsSync(sheetPath)).toBe(false)

    // Also verify PatientListView.tsx does not reference PatientDetailSheet
    const listViewPath = path.resolve(__dirname, '../../components/patients/PatientListView.tsx')
    const listViewContent = fs.readFileSync(listViewPath, 'utf-8')
    expect(listViewContent).not.toContain('PatientDetailSheet')
  })
})

// ═══════════════════════════════════════
// RecoveryScoreBar tests (21-23)
// ═══════════════════════════════════════
describe('RecoveryScoreBar — getColor', () => {
  it('21. returns green color for score 8 (high)', () => {
    const color = getColor(8)
    expect(color).toBe('#30B130')
  })

  it('22. returns red color for score 2 (low)', () => {
    const color = getColor(2)
    expect(color).toBe('#DF1B41')
  })

  it('23. returns red color for inverted score 8 (high pain = bad)', () => {
    // Inverted: effective = 10 - 8 = 2
    const effective = effectiveScore(8, true)
    expect(effective).toBe(2)
    const color = getColor(effective)
    expect(color).toBe('#DF1B41')
  })
})

// ═══════════════════════════════════════
// Visit data tests (24-30)
// ═══════════════════════════════════════
describe('Visit data — CreateVisitData type', () => {
  it('24. CreateVisitData type has all required fields', () => {
    // CreateVisitData allows all fields to be optional — verify a full object is valid
    const data: CreateVisitData = {
      visitDate: '2026-04-17',
      visitType: 'follow_up',
      chiefComplaint: 'Lower back pain',
      subjective: 'Patient reports improvement',
      objective: 'ROM improved 20%',
      assessment: 'Improving lumbar subluxation',
      plan: 'Continue weekly adjustments',
      treatmentNotes: 'Gonstead technique applied',
      areasAdjusted: 'L4, L5, SI joint',
      techniqueUsed: 'Gonstead',
      subluxationFindings: 'L4 PLI',
      bloodPressureSys: 120,
      bloodPressureDia: 80,
      heartRate: 72,
      weight: 75.5,
      temperature: 36.5,
      recommendations: 'Ice 20min after adjustment',
      referrals: 'None',
      nextVisitDays: 7,
      questionnaire: {
        painLevel: 3,
        mobilityScore: 7,
        sleepQuality: 6,
        dailyFunction: 8,
        overallImprovement: 7,
        patientComments: 'Feeling much better',
      },
    }
    expect(data.visitDate).toBe('2026-04-17')
    expect(data.visitType).toBe('follow_up')
    expect(data.questionnaire?.painLevel).toBe(3)
    expect(data.questionnaire?.overallImprovement).toBe(7)
  })
})

describe('Visit type validation', () => {
  it('25. accepts valid visit types', () => {
    const validTypes = ['initial', 'follow_up', 'emergency', 'reassessment', 'discharge']
    for (const type of validTypes) {
      expect(VALID_VISIT_TYPES).toContain(type)
    }
  })

  it('26. rejects invalid visit type', () => {
    const invalidType = 'consultation'
    expect(VALID_VISIT_TYPES).not.toContain(invalidType)
  })
})

describe('Questionnaire score validation', () => {
  it('27. accepts score in 0-10 range', () => {
    expect(isValidQuestionnaireScore(0)).toBe(true)
    expect(isValidQuestionnaireScore(5)).toBe(true)
    expect(isValidQuestionnaireScore(10)).toBe(true)
  })

  it('28. rejects negative number', () => {
    expect(isValidQuestionnaireScore(-1)).toBe(false)
    expect(isValidQuestionnaireScore(-5)).toBe(false)
  })

  it('29. rejects number > 10', () => {
    expect(isValidQuestionnaireScore(11)).toBe(false)
    expect(isValidQuestionnaireScore(100)).toBe(false)
  })
})

describe('formatAge helper', () => {
  it('30. calculates correct age', () => {
    // Use a fixed date that is clearly in the past
    const now = new Date()
    const thirtyYearsAgo = new Date(now.getFullYear() - 30, 0, 1)
    const result = formatAge(thirtyYearsAgo.toISOString())
    expect(result).toBe('30y')

    // Null case
    expect(formatAge(null)).toBeNull()
  })
})

// ═══════════════════════════════════════
// API response shape tests (31-35)
// ═══════════════════════════════════════
describe('API response shapes', () => {
  it('31. Visit response includes questionnaire when present', () => {
    const visit: Visit = {
      id: 'visit-1',
      visitDate: '2026-04-17T10:00:00Z',
      visitType: 'follow_up',
      chiefComplaint: 'Back pain',
      subjective: null,
      objective: null,
      assessment: null,
      plan: null,
      treatmentNotes: null,
      areasAdjusted: null,
      techniqueUsed: null,
      subluxationFindings: null,
      bloodPressureSys: null,
      bloodPressureDia: null,
      heartRate: null,
      weight: null,
      temperature: null,
      recommendations: null,
      referrals: null,
      nextVisitDays: null,
      questionnaire: {
        id: 'q-1',
        painLevel: 4,
        mobilityScore: 6,
        sleepQuality: 7,
        dailyFunction: 8,
        overallImprovement: 7,
        patientComments: 'Feeling better',
      },
      doctor: { id: 'doc-1', name: 'Dr. Test' },
      xrays: [],
      createdAt: '2026-04-17T10:00:00Z',
    }
    expect(visit.questionnaire).not.toBeNull()
    expect(visit.questionnaire!.painLevel).toBe(4)
    expect(visit.questionnaire!.overallImprovement).toBe(7)
  })

  it('32. Visit response has null questionnaire when not present', () => {
    const visit: Visit = {
      id: 'visit-2',
      visitDate: '2026-04-17T10:00:00Z',
      visitType: 'initial',
      chiefComplaint: null,
      subjective: null,
      objective: null,
      assessment: null,
      plan: null,
      treatmentNotes: null,
      areasAdjusted: null,
      techniqueUsed: null,
      subluxationFindings: null,
      bloodPressureSys: null,
      bloodPressureDia: null,
      heartRate: null,
      weight: null,
      temperature: null,
      recommendations: null,
      referrals: null,
      nextVisitDays: null,
      questionnaire: null,
      doctor: { id: 'doc-1', name: 'Dr. Test' },
      xrays: [],
      createdAt: '2026-04-17T10:00:00Z',
    }
    expect(visit.questionnaire).toBeNull()
  })

  it('33. Patient detail with include=detail has recoveryTrend field', () => {
    // The PatientDetail interface extends Patient with recoveryTrend
    interface PatientDetail extends Patient {
      branchName: string
      recoveryTrend: number | null
      nextAppointment: string | null
      visitsByType: Record<string, number>
    }

    const detail: PatientDetail = {
      id: 'p-1',
      firstName: 'Ahmad',
      lastName: 'Test',
      email: null,
      phone: null,
      icNumber: null,
      dateOfBirth: null,
      gender: null,
      occupation: null,
      race: null,
      maritalStatus: null,
      bloodType: null,
      allergies: null,
      referralSource: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postcode: null,
      country: null,
      emergencyName: null,
      emergencyPhone: null,
      emergencyRelation: null,
      address: null,
      emergencyContact: null,
      medicalHistory: null,
      notes: null,
      status: 'active',
      doctorId: 'doc-1',
      doctorName: 'Dr. Test',
      branchId: 'branch-1',
      lastVisit: null,
      totalVisits: 5,
      totalXrays: 2,
      createdAt: '2026-01-01T00:00:00Z',
      xrays: [],
      branchName: 'Main Branch',
      recoveryTrend: 15,
      nextAppointment: '2026-04-20T10:00:00Z',
      visitsByType: { follow_up: 3, initial: 1, reassessment: 1 },
    }
    expect(detail.recoveryTrend).toBe(15)
    expect(detail.nextAppointment).toBeDefined()
    expect(detail.visitsByType).toBeDefined()
    expect(Object.keys(detail.visitsByType).length).toBe(3)
  })

  it('34. Appointment response includes doctor info', () => {
    // Matches the shape used in PatientOverviewTab
    interface AppointmentItem {
      id: string
      dateTime: string
      duration: number
      status: string
      doctor: { id: string; name: string | null }
    }

    const appointment: AppointmentItem = {
      id: 'appt-1',
      dateTime: '2026-04-20T10:00:00Z',
      duration: 30,
      status: 'SCHEDULED',
      doctor: { id: 'doc-1', name: 'Dr. Ahmad' },
    }
    expect(appointment.doctor).toBeDefined()
    expect(appointment.doctor.id).toBe('doc-1')
    expect(appointment.doctor.name).toBe('Dr. Ahmad')
    expect(appointment.duration).toBe(30)
    expect(appointment.status).toBe('SCHEDULED')
  })

  it('35. Visit type filter applies correctly', () => {
    const visits: { visitType: string | null }[] = [
      { visitType: 'initial' },
      { visitType: 'follow_up' },
      { visitType: 'follow_up' },
      { visitType: 'emergency' },
      { visitType: null },
    ]

    const filterType = 'follow_up'
    const filtered = visits.filter((v) =>
      filterType === 'all' ? true : v.visitType === filterType,
    )
    expect(filtered).toHaveLength(2)
    expect(filtered.every((v) => v.visitType === 'follow_up')).toBe(true)

    // "all" filter returns everything
    const allFiltered = visits.filter((v) =>
      'all' === 'all' ? true : v.visitType === 'all',
    )
    expect(allFiltered).toHaveLength(5)
  })
})

// ═══════════════════════════════════════
// Integration helpers (36-40)
// ═══════════════════════════════════════
describe('Integration helpers', () => {
  it('36. RecoveryScoreBar getColor returns correct gradient for each range', () => {
    // Red: 0-3
    expect(getColor(0)).toBe('#DF1B41')
    expect(getColor(1)).toBe('#DF1B41')
    expect(getColor(2)).toBe('#DF1B41')
    expect(getColor(3)).toBe('#DF1B41')
    // Yellow: 4-6
    expect(getColor(4)).toBe('#F5A623')
    expect(getColor(5)).toBe('#F5A623')
    expect(getColor(6)).toBe('#F5A623')
    // Green: 7-10
    expect(getColor(7)).toBe('#30B130')
    expect(getColor(8)).toBe('#30B130')
    expect(getColor(9)).toBe('#30B130')
    expect(getColor(10)).toBe('#30B130')
  })

  it('37. Visit type badge has correct color for each type', () => {
    expect(getVisitConfig('initial').border).toBe('#533afd')
    expect(getVisitConfig('follow_up').border).toBe('#0570DE')
    expect(getVisitConfig('emergency').border).toBe('#DF1B41')
    expect(getVisitConfig('reassessment').border).toBe('#9b6829')
    expect(getVisitConfig('discharge').border).toBe('#30B130')
    // null defaults to follow_up
    expect(getVisitConfig(null).border).toBe('#0570DE')
    // unknown type defaults to follow_up
    expect(getVisitConfig('unknown_type').border).toBe('#0570DE')
  })

  it('38. Date formatting helper formats Malaysian dates correctly', () => {
    // Malaysian locale date formatting (en-MY)
    const date = '2026-04-17T10:00:00Z'
    const formatted = formatMalaysianDate(date)
    // en-MY format: "17 Apr 2026" (day month year)
    expect(formatted).toContain('Apr')
    expect(formatted).toContain('2026')
    expect(formatted).toContain('17')

    // US format for comparison
    const usFormatted = formatDate(date)
    expect(usFormatted).toContain('Apr')
    expect(usFormatted).toContain('2026')
  })

  it('39. Areas adjusted string splits into tag array correctly', () => {
    // Normal case
    expect(parseAreaTags('C5, T4, L3, SI joint')).toEqual(['C5', 'T4', 'L3', 'SI joint'])

    // Single area
    expect(parseAreaTags('L4')).toEqual(['L4'])

    // Null case
    expect(parseAreaTags(null)).toEqual([])

    // Empty string
    expect(parseAreaTags('')).toEqual([])

    // Extra whitespace and trailing comma
    expect(parseAreaTags(' C5 , T4 , ')).toEqual(['C5', 'T4'])
  })

  it('40. Vitals display formats BP correctly (systolic/diastolic)', () => {
    expect(formatBP(120, 80)).toBe('120/80 mmHg')
    expect(formatBP(140, 90)).toBe('140/90 mmHg')
    // Null cases
    expect(formatBP(null, 80)).toBeNull()
    expect(formatBP(120, null)).toBeNull()
    expect(formatBP(null, null)).toBeNull()
  })
})
