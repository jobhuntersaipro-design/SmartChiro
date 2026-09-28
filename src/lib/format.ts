import { CLINIC_TIME_ZONE, clinicDateKey, clinicParts } from './clinic-time'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D+/g, '')
  if (digits.startsWith('0')) return '60' + digits.slice(1)
  return digits
}

export function formatDobWithAge(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = date.getUTCFullYear()

  const now = new Date()
  let age = now.getFullYear() - year
  const thisYearBirthday = new Date(now.getFullYear(), date.getUTCMonth(), date.getUTCDate())
  if (now < thisYearBirthday) age--

  return `${day}-${month}-${year} (${age})`
}

export function buildWhatsAppUrl(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = normalizePhoneDigits(phone)
  if (digits.length < 7) return null
  return `https://wa.me/${digits}`
}

/** `tel:` link in international form (MY local `012…` → `+6012…`). */
export function buildTelUrl(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = normalizePhoneDigits(phone)
  if (digits.length < 7) return null
  return `tel:+${digits}`
}

export function buildMailtoUrl(email: string | null | undefined): string | null {
  if (!email) return null
  if (!EMAIL_RE.test(email)) return null
  return `mailto:${email}`
}

export function buildMapsUrl(address: string | null | undefined): string | null {
  if (!address) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export function buildDoctorHref(userId: string): string {
  return `/dashboard/doctors/${userId}`
}

export function buildBranchHref(branchId: string): string {
  return `/dashboard/branches/${branchId}`
}

// Pinned to the clinic zone: the server renders in UTC and a browser may be
// set to any zone, and both must print the clinic's wall-clock time.
const TIME_FMT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: CLINIC_TIME_ZONE })
const WEEKDAY_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: CLINIC_TIME_ZONE })

function clinicDdMmYyyy(dt: Date): string {
  const p = clinicParts(dt)
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year}`
}

// Always returns "10:30 AM 06/05/2026". Uniform/formal — no relative
// "Today"/"Tomorrow" labels. The sort order surfaces urgency.
export function formatAppointmentDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  return `${TIME_FMT.format(dt)} ${clinicDdMmYyyy(dt)}`
}

// Returns the time part only ("10:30 AM"). Pair with formatAppointmentDateOnly
// when the time/date need to be on separate lines or styled independently.
export function formatAppointmentTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  return TIME_FMT.format(dt)
}

// Returns the date part only ("06/05/2026").
export function formatAppointmentDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  return clinicDdMmYyyy(dt)
}

// Returns short weekday like "Tue". Use with WeekdayBadge for visual emphasis.
export function getAppointmentWeekday(iso: string | null | undefined): { label: string; isWeekend: boolean } | null {
  if (!iso) return null
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  const day = clinicParts(dt).weekday // 0 = Sun, 6 = Sat
  return { label: WEEKDAY_FMT.format(dt), isWeekend: day === 0 || day === 6 }
}

/**
 * Today's date as YYYY-MM-DD on the clinic's calendar. `toISOString()` would
 * give the UTC date — yesterday before 8 AM in Malaysia.
 */
export function todayLocalISODate(now: Date = new Date()): string {
  return clinicDateKey(now)
}

/** Confirmation used before closing a form that has unsaved input. */
export const DISCARD_CHANGES_PROMPT = "Discard your unsaved changes?";

/**
 * "Dr. <name>" exactly once. Doctor names are stored however they were typed
 * ("Dr. Suresh Menon", "dr suresh", "Suresh Menon"), so any leading "Dr"/"Dr."
 * is stripped before the title is added — never "Dr. Dr. Suresh Menon".
 */
export function displayDoctorName(name: string | null | undefined, fallback = 'Unknown doctor'): string {
  const bare = (name ?? '').trim().replace(/^(dr\.?\s+|dr\.)+/i, '').trim()
  return bare ? `Dr. ${bare}` : fallback
}

/**
 * Sub-line for a "today" count. "All wrapped up" only once something was booked
 * and nothing is left — never next to an empty day.
 */
export function todayProgressLabel(total: number, remaining: number): string {
  if (total <= 0) return 'Nothing booked today'
  if (remaining <= 0) return 'All wrapped up'
  return `${remaining} remaining`
}

/** "1 appointment", "3 appointments". Pass `pluralForm` for irregular words. */
export function plural(n: number, singular: string, pluralForm: string = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}
