/**
 * A password change or reset ends every session signed in before it (G4).
 * `signedInAt` is the token's sign-in time in ms; tokens from before it was
 * recorded count as signed in at 0.
 */
export function endedByPasswordChange(passwordChangedAt: Date | null, signedInAt: unknown): boolean {
  const since = typeof signedInAt === 'number' ? signedInAt : 0
  return passwordChangedAt != null && passwordChangedAt.getTime() > since
}
