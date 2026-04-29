/**
 * One-shot ops script: disable Resend domain-level click + open tracking.
 *
 * Why this exists: Resend tracking rewrites every link to route through
 * resend-clicks-a.com, which breaks the verify-email and password-reset
 * flows (Gmail double-wraps and the redirect chain hangs). Tracking is
 * domain-level only — there is no per-email override.
 *
 * Idempotent. Safe to re-run.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx RESEND_DOMAIN_ID=dom_xxx npx tsx scripts/disable-resend-tracking.ts
 */
import { Resend } from 'resend'

async function main() {
  const apiKey = process.env.RESEND_API_KEY
  const domainId = process.env.RESEND_DOMAIN_ID

  if (!apiKey) {
    console.error('Missing RESEND_API_KEY env var.')
    process.exit(1)
  }
  if (!domainId) {
    console.error('Missing RESEND_DOMAIN_ID env var.')
    console.error('Find your domain ID at https://resend.com/domains')
    process.exit(1)
  }

  const resend = new Resend(apiKey)

  const { data, error } = await resend.domains.update({
    id: domainId,
    clickTracking: false,
    openTracking: false,
  })

  if (error) {
    console.error('Failed to update domain tracking settings:', error)
    process.exit(1)
  }

  console.log('Tracking disabled successfully:')
  console.log(JSON.stringify(data, null, 2))
}

main()
