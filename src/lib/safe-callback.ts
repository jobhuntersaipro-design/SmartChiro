/**
 * Where to go after signing in: a path on this site only (never "//evil.com"
 * or "https://…", which would make the login page an open redirect).
 */
export function safeCallbackPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  if (value.startsWith('/login') || value.startsWith('/api/')) return fallback
  return value
}
