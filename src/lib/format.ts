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
