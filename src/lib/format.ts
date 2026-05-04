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

const TIME_FMT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
const WEEKDAY_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

// Always returns "10:30 AM 06/05/2026". Uniform/formal — no relative
// "Today"/"Tomorrow" labels. The sort order surfaces urgency.
export function formatAppointmentDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  const time = TIME_FMT.format(dt) // "10:30 AM"
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const yyyy = dt.getFullYear()
  return `${time} ${dd}/${mm}/${yyyy}`
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
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const yyyy = dt.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

// Returns short weekday like "Tue". Use with WeekdayBadge for visual emphasis.
export function getAppointmentWeekday(iso: string | null | undefined): { label: string; isWeekend: boolean } | null {
  if (!iso) return null
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  const day = dt.getDay() // 0 = Sun, 6 = Sat
  return { label: WEEKDAY_FMT.format(dt), isWeekend: day === 0 || day === 6 }
}
