const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizePhoneDigits(phone: string): string {
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

// Time bucket for an appointment relative to now. Drives styling intensity.
export type AppointmentTimeBucket = 'today' | 'tomorrow' | 'thisWeek' | 'beyond' | 'past'

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function appointmentTimeBucket(iso: string | null | undefined, now: Date = new Date()): AppointmentTimeBucket | null {
  if (!iso) return null
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  const todayStart = startOfDay(now)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const dayAfterTomorrowStart = new Date(todayStart)
  dayAfterTomorrowStart.setDate(dayAfterTomorrowStart.getDate() + 2)
  const weekEnd = new Date(todayStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  if (dt.getTime() < todayStart.getTime()) return 'past'
  if (dt.getTime() < tomorrowStart.getTime()) return 'today'
  if (dt.getTime() < dayAfterTomorrowStart.getTime()) return 'tomorrow'
  if (dt.getTime() < weekEnd.getTime()) return 'thisWeek'
  return 'beyond'
}

const TIME_FMT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
const DAY_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

// "Today 10:30 AM" | "Tomorrow 2:00 PM" | "Tue, May 6 · 10:30 AM"
export function formatRelativeAppointmentTime(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null
  const bucket = appointmentTimeBucket(iso, now)
  if (!bucket) return null
  const dt = new Date(iso)
  const time = TIME_FMT.format(dt)
  if (bucket === 'today') return `Today ${time}`
  if (bucket === 'tomorrow') return `Tomorrow ${time}`
  return `${DAY_FMT.format(dt)} · ${time}`
}
