// CLI entry for the e2e seed. Runs only via tsx, never imported by Playwright.
// Loads .env.test then .env so DATABASE_URL_TEST is visible, then invokes
// seedE2E. Use this when you want to wipe and reseed without running tests:
//
//   npx tsx e2e/fixtures/seed-cli.ts
//
import { config as loadDotenv } from 'dotenv'
import { seedE2E } from './seed'

loadDotenv({ path: '.env.test' })
loadDotenv()

seedE2E()
  .then(() => {
    console.log('seed: ok')
  })
  .catch((err) => {
    console.error('seed failed:', err)
    process.exit(1)
  })
