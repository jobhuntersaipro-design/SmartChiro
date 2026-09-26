type AuthResult = { user?: unknown } | null | undefined

export function hasSessionUser(authResult: AuthResult): boolean {
  return Boolean(authResult && typeof authResult === 'object' && authResult.user)
}
