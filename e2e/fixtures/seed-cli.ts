// CLI entry for the e2e seed. Runs only via tsx, never imported by Playwright.
// Loads .env (which holds DATABASE_URL_TEST + E2E_* vars) then invokes seedE2E.
// Use this when you want to wipe and reseed without running tests:
//
//   npx tsx e2e/fixtures/seed-cli.ts
//
import 'dotenv/config'
import { seedE2E } from './seed'

seedE2E()
  .then(() => {
    console.log('seed: ok')
  })
  .catch((err) => {
    console.error('seed failed:', err)
    process.exit(1)
  })
